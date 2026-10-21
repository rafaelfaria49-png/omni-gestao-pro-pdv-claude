import { WeightSession, type EndReason, type WeightSnapshot } from "../../lib/pesagem"
import type { ScaleChannel, ScaleTransport } from "./transport"

const owners = new WeakMap<object, ScaleConnection>()

/** Uma execução por instância. Reconexão exige outra sessão e outro contexto explícito. */
export class ScaleConnection {
  private readonly abort = new AbortController()
  private done: Promise<WeightSnapshot> | null = null
  private channel: ScaleChannel | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private cancelPromise: Promise<void> | null = null
  private cancelError: unknown = null
  private readerReleased = false
  private cleanupPromise: Promise<void> | null = null
  private packetSequence = 0

  constructor(readonly session: WeightSession, private readonly transport: ScaleTransport,
    private readonly idleTimeoutMs: number) {
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs <= 0 || idleTimeoutMs > 2147483647) {
      throw new Error("invalid_idle_timeout")
    }
  }

  run(signal?: AbortSignal): Promise<WeightSnapshot> {
    if (!this.done && !this.abort.signal.aborted && (this.session.isActive || this.session.isEnded)) {
      return Promise.reject(new Error("session_is_single_use"))
    }
    this.done ??= this.execute(signal)
    return this.done
  }

  private cancelReader(): Promise<void> {
    if (!this.channel) return Promise.resolve()
    this.cancelPromise ??= this.channel.reader.cancel().catch((error: unknown) => { this.cancelError = error })
    return this.cancelPromise
  }

  private requestStop(reason: EndReason): void {
    if (this.abort.signal.aborted) return
    if (!this.session.isEnded) this.session.end(reason)
    this.abort.abort()
    void this.cancelReader()
  }

  private armTimeout(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.requestStop("timeout"), this.idleTimeoutMs)
  }

  private async execute(signal?: AbortSignal): Promise<WeightSnapshot> {
    const onAbort = () => this.requestStop("cancelled")
    if (signal?.aborted) this.requestStop("cancelled")
    signal?.addEventListener("abort", onAbort, { once: true })
    if (this.abort.signal.aborted) {
      signal?.removeEventListener("abort", onAbort)
      return this.session.snapshot()
    }
    if (owners.has(this.transport.resource)) {
      signal?.removeEventListener("abort", onAbort)
      this.session.end("port_in_use")
      return this.session.snapshot()
    }
    owners.set(this.transport.resource, this)
    try {
      this.channel = this.transport.acquire()
      this.session.markConnected()
      this.armTimeout()
      while (!this.abort.signal.aborted) {
        const { value, done } = await this.channel.reader.read()
        if (this.abort.signal.aborted) break
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

  private async releaseResources(): Promise<void> {
    if (!this.channel) {
      if (owners.get(this.transport.resource) === this) owners.delete(this.transport.resource)
      return
    }
    try {
      await this.cancelReader()
      if (!this.readerReleased) {
        this.channel.reader.releaseLock()
        this.readerReleased = true
      }
      await this.channel.close()
      this.channel = null
      owners.delete(this.transport.resource)
      if (this.cancelError) {
        const final = this.session.snapshot()
        this.session.end(final.status as EndReason, (final.detail ? final.detail + "; " : "") + "reader_cancel_failed; resources_released")
      }
    } catch (error) {
      // Mantém a reserva se close falhar; retryClose permite recuperação explícita.
      this.session.end("cleanup_error", error instanceof Error ? error.message : "resource_release_failed")
    }
  }

  async stop(reason: "cancelled" | "context_changed" = "cancelled"): Promise<void> {
    this.requestStop(reason)
    await this.done
  }

  async retryClose(): Promise<void> {
    await this.done
    await this.cleanup()
  }
}
