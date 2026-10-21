import { WeightSession, type EndReason, type WeightSnapshot } from "../../lib/pesagem"
import type { ScaleChannel, ScaleTransport } from "./transport"

const owners = new WeakMap<object, ScaleConnection>()
const sessionOwners = new WeakMap<WeightSession, ScaleConnection>()
type Outcome = { ok: true } | { ok: false; error: unknown }

/** Uma execução por instância. Reconexão exige outra sessão e outro contexto explícito. */
export class ScaleConnection {
  private readonly abort = new AbortController()
  private done: Promise<WeightSnapshot> | null = null
  private channel: ScaleChannel | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private cancelPromise: Promise<Outcome> | null = null
  private closePromise: Promise<Outcome> | null = null
  private readerReleased = false
  private cleanupPromise: Promise<void> | null = null
  private resources: readonly object[] = []
  private packetSequence = 0

  constructor(readonly session: WeightSession, private readonly transport: ScaleTransport,
    private readonly idleTimeoutMs: number, private readonly cleanupTimeoutMs = 1000) {
    if (![idleTimeoutMs, cleanupTimeoutMs].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647)) {
      throw new Error("invalid_idle_or_cleanup_timeout")
    }
  }

  run(signal?: AbortSignal): Promise<WeightSnapshot> {
    if (this.done) return this.done
    const owner = sessionOwners.get(this.session)
    if ((owner && owner !== this) ||
        (!this.abort.signal.aborted && (this.session.isActive || this.session.isEnded))) {
      return Promise.reject(new Error("session_is_single_use"))
    }
    sessionOwners.set(this.session, this)
    // Instala a Promise antes de acquire: até callbacks reentrantes recebem a mesma execução.
    let finish!: (snapshot: WeightSnapshot) => void
    let fail!: (error: unknown) => void
    this.done = new Promise((resolve, reject) => { finish = resolve; fail = reject })
    void this.execute(signal).then(finish, fail)
    return this.done
  }

  private requestStop(reason: EndReason): void {
    if (this.abort.signal.aborted) return
    if (!this.session.isEnded) this.session.end(reason)
    this.abort.abort()
  }

  private armTimeout(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.requestStop("timeout"), this.idleTimeoutMs)
  }

  private async readUntilStopped(channel: ScaleChannel): Promise<ReadableStreamReadResult<Uint8Array> | null> {
    if (this.abort.signal.aborted) return null
    let onStop!: () => void
    const stopped = new Promise<null>((resolve) => {
      onStop = () => resolve(null)
      this.abort.signal.addEventListener("abort", onStop, { once: true })
    })
    try { return await Promise.race([channel.reader.read(), stopped]) }
    finally { this.abort.signal.removeEventListener("abort", onStop) }
  }

  private async execute(signal?: AbortSignal): Promise<WeightSnapshot> {
    const onAbort = () => this.requestStop("cancelled")
    if (signal?.aborted) this.requestStop("cancelled")
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
      if (this.abort.signal.aborted) return this.session.snapshot()
      this.resources = [...new Set([this.transport.resource, ...this.transport.resources ?? []])]
      if (this.resources.some((resource) => owners.has(resource))) {
        this.session.end("port_in_use")
        return this.session.snapshot()
      }
      for (const resource of this.resources) owners.set(resource, this)
      this.channel = this.transport.acquire()
      this.session.markConnected()
      this.armTimeout()
      while (!this.abort.signal.aborted) {
        // O encerramento não depende de read ou cancel do driver concluírem.
        // Promise.race também observa rejeições tardias sem alterar a sessão encerrada.
        const result = await this.readUntilStopped(this.channel)
        if (result === null || this.abort.signal.aborted) break
        const { value, done } = result
        if (done) { this.requestStop("disconnected"); break }
        if (value?.length) {
          this.armTimeout()
          this.session.receive({ sessionId: this.session.sessionId, packetSequence: ++this.packetSequence, bytes: value })
          if (!this.session.isActive) this.requestStop("clock_error")
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) this.session.end(this.channel ? "read_error" : "connection_error",
        error instanceof Error ? error.message : "transport_failure")
    } finally {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      signal?.removeEventListener("abort", onAbort)
      await this.cleanup()
    }
    return this.session.snapshot()
  }

  private cleanup(): Promise<void> {
    this.cleanupPromise ??= this.releaseResources().finally(() => { this.cleanupPromise = null })
    return this.cleanupPromise
  }

  private attempt(operation: () => Promise<void>): Promise<Outcome> {
    return Promise.resolve().then(operation).then(() => ({ ok: true }), (error: unknown) => ({ ok: false, error }))
  }

  private async withinDeadline(operation: Promise<Outcome>): Promise<Outcome | null> {
    let timer!: ReturnType<typeof setTimeout>
    const expired = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.cleanupTimeoutMs) })
    try { return await Promise.race([operation, expired]) }
    finally { clearTimeout(timer) }
  }

  private releaseOwnership(): void {
    for (const resource of this.resources) {
      if (owners.get(resource) === this) owners.delete(resource)
    }
  }

  private async releaseResources(): Promise<void> {
    if (!this.channel) { this.releaseOwnership(); return }
    const channel = this.channel
    try {
      const cancelled = await this.withinDeadline(this.cancelPromise ??= this.attempt(() => channel.reader.cancel()))
      if (cancelled === null) {
        this.session.end("cleanup_error", "reader_cancel_timeout; resources_retained")
        return
      }
      if (!this.readerReleased) {
        channel.reader.releaseLock()
        this.readerReleased = true
      }
      const closed = await this.withinDeadline(this.closePromise ??= this.attempt(() => channel.close()))
      if (closed === null) {
        this.session.end("cleanup_error", "port_close_timeout; resources_retained")
        return
      }
      if (!closed.ok) {
        // Rejeição concluída permite nova tentativa; fechamento ainda pendente nunca é duplicado.
        this.closePromise = null
        throw closed.error
      }
      this.channel = null
      this.releaseOwnership()
      const final = this.session.snapshot()
      if (!cancelled.ok) {
        this.session.end(final.status as EndReason, (final.detail ? final.detail + "; " : "") + "reader_cancel_failed; resources_released")
      } else if (final.status === "cleanup_error") {
        this.session.end("cleanup_error", "cleanup_recovered; resources_released")
      }
    } catch (error) {
      this.session.end("cleanup_error", (error instanceof Error ? error.message : "resource_release_failed") + "; resources_retained")
    }
  }

  async stop(reason: "cancelled" | "context_changed" = "cancelled"): Promise<void> {
    const owner = sessionOwners.get(this.session)
    if ((owner && owner !== this) || (!this.done && (this.session.isActive || this.session.isEnded))) return
    this.requestStop(reason)
    await this.done
  }

  async retryClose(): Promise<void> {
    const done = this.done
    if (!done) return
    await done
    await this.cleanup()
  }
}
