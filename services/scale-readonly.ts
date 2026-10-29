import { isWebSerialSupported } from "@/services/hardware-bridge"
import { parseMass } from "@/lib/pesagem/mass"

/** A&D HV-G/HW-G, Format 1 / stream; manual, seções 16–16.2.
 * https://www.aandd.jp/products/manual/balances/hvw-g.pdf
 * Não autodetecta Toledo/Filizola e nunca transmite comandos.
 */
export const SCALE_PROFILE = "and-hvg-stream" as const
export const SCALE_STALE_MS = 3000
export const SCALE_BAUD_RATES = [2400, 4800, 9600] as const

export type ScaleSample = {
  kg: number
  decimalPlaces: number
  stable: boolean
  receivedAt: number
  sequence: number
}
export type ScaleStatus = "disconnected" | "connecting" | "disconnecting" | "waiting" | "unstable" | "stable" | "stale" | "error"
export type ScaleSnapshot = { status: ScaleStatus; sample: ScaleSample | null; message?: string }
export const EMPTY_SCALE_SNAPSHOT: ScaleSnapshot = { status: "disconnected", sample: null }

export interface ReadonlyScalePort {
  readable: ReadableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits: 7; stopBits: 1; parity: "even"; flowControl: "none" }): Promise<void>
  close(): Promise<void>
}
export interface ScaleSerial {
  requestPort(): Promise<ReadonlyScalePort>
  addEventListener(type: "disconnect", listener: (event: Event) => void): void
  removeEventListener(type: "disconnect", listener: (event: Event) => void): void
}

/** Formato completo, incluindo sinal, largura fixa e unidade. Nunca extrai substrings. */
export function parseAndScaleFrame(frame: string): Omit<ScaleSample, "receivedAt" | "sequence"> | null {
  const match = /^(ST|US),\+(\d+\.\d+)( kg)$/.exec(frame)
  if (!match || frame.length !== 15) return null
  const mass = parseMass(match[2], "kg")
  if (!mass.ok) return null
  const kg = Number(mass.mass.kilograms)
  // Limite conservador do visor de balcão; não é a capacidade/calibração do equipamento.
  if (!Number.isFinite(kg) || kg < 0 || kg > 300) return null
  return { kg, decimalPlaces: mass.mass.decimalPlaces, stable: match[1] === "ST" }
}

/** Buffer limitado. Um frame só existe após CR LF, mesmo quando dividido em chunks. */
export class ScaleFrameDecoder {
  private pending = ""
  private discarding = false
  private previousCR = false
  private pendingSince: number | null = null

  constructor(private now: () => number = Date.now) {}

  get hasPending(): boolean { return this.pending.length > 0 || this.discarding }

  push(bytes: Uint8Array): Array<ReturnType<typeof parseAndScaleFrame>> {
    const frames: Array<ReturnType<typeof parseAndScaleFrame>> = []
    const now = this.now()
    if (this.pendingSince !== null && (now - this.pendingSince >= SCALE_STALE_MS || now < this.pendingSince)) {
      this.pending = ""
      this.discarding = true
      this.previousCR = false
      this.pendingSince = null
    }
    for (const byte of bytes) {
      if (byte === 10) {
        frames.push(!this.discarding && this.previousCR ? parseAndScaleFrame(this.pending.slice(0, -1)) : null)
        this.pending = ""
        this.discarding = false
        this.pendingSince = null
      } else if (!this.discarding) {
        this.pendingSince ??= now
        if (byte > 127 || this.pending.length >= 64) {
          this.pending = ""
          this.discarding = true
        } else {
          this.pending += String.fromCharCode(byte)
        }
      }
      this.previousCR = byte === 13
    }
    return frames
  }
}

const claimedPorts = new WeakSet<ReadonlyScalePort>()
type Attempt = {
  port?: ReadonlyScalePort
  claimed?: boolean
  opening?: Promise<void>
  opened?: boolean
  reader?: ReadableStreamDefaultReader<Uint8Array>
  reading?: Promise<void>
  closing?: Promise<void>
  timer?: ReturnType<typeof setInterval>
  onDisconnect?: (event: Event) => void
  validAt: number
  sequence: number
}

/** Sessão local ao visor/terminal. Sem buffer global, banco, carrinho ou writer serial. */
export class ReadonlyScaleSession {
  private snapshot: ScaleSnapshot = EMPTY_SCALE_SNAPSHOT
  private listeners = new Set<(snapshot: ScaleSnapshot) => void>()
  private attempt: Attempt | null = null
  private cleanup: Promise<void> | null = null
  private serial: ScaleSerial | undefined

  constructor(serial?: ScaleSerial, private now: () => number = Date.now) {
    this.serial = serial ?? (isWebSerialSupported() ? navigator.serial as unknown as ScaleSerial : undefined)
  }

  subscribe(listener: (snapshot: ScaleSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot(): ScaleSnapshot { return this.snapshot }

  private publish(snapshot: ScaleSnapshot) {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener(snapshot))
  }

  /** Chamar somente de um gesto explícito. Não usa getPorts nem tenta reconectar sozinho. */
  async connect(profile: string = SCALE_PROFILE, baudRate: number = 2400): Promise<void> {
    if (this.attempt || this.cleanup) return
    if (profile !== SCALE_PROFILE || !SCALE_BAUD_RATES.some((rate) => rate === baudRate)) {
      this.publish({ status: "error", sample: null, message: "Perfil de balança não compatível." })
      return
    }
    const serial = this.serial
    if (!serial) {
      this.publish({ status: "error", sample: null, message: "Navegador sem Web Serial. Use Chrome ou Edge em HTTPS ou localhost." })
      return
    }
    const attempt: Attempt = { validAt: this.now(), sequence: 0 }
    this.attempt = attempt
    this.publish({ status: "connecting", sample: null })
    try {
      const port = await serial.requestPort()
      // A seleção de porta não pode ser cancelada programaticamente. Um visor
      // desmontado enquanto o seletor estava aberto jamais abre a porta retornada.
      if (this.attempt !== attempt) return
      if (claimedPorts.has(port) || port.readable?.locked) throw new Error("port_busy")
      claimedPorts.add(port)
      attempt.claimed = true
      attempt.port = port
      attempt.opening = port.open({ baudRate, dataBits: 7, stopBits: 1, parity: "even", flowControl: "none" })
        .then(() => { attempt.opened = true })
      await attempt.opening
      if (this.attempt !== attempt) return
      if (!port.readable) throw new Error("no_readable_stream")
      attempt.reader = port.readable.getReader()
      attempt.validAt = this.now()
      attempt.onDisconnect = (event) => {
        if (event.target === port as unknown || (event as Event & { port?: unknown }).port === port) {
          this.end(attempt, "disconnected", "Balança desconectada.")
        }
      }
      serial.addEventListener("disconnect", attempt.onDisconnect)
      attempt.timer = setInterval(() => {
        if (this.attempt !== attempt) return
        const age = this.now() - attempt.validAt
        if (age >= SCALE_STALE_MS || age < 0) {
          this.publish({ status: "stale", sample: null, message: "Sem leitura válida recente. Confira o cabo e o modo de saída da balança." })
        }
      }, 250)
      this.publish({ status: "waiting", sample: null })
      attempt.reading = this.read(attempt)
    } catch (error) {
      if (this.attempt !== attempt) return
      const name = error instanceof Error ? error.name : ""
      this.end(attempt, name === "NotFoundError" ? "disconnected" : "error",
        name === "NotFoundError" ? "Seleção de porta cancelada." :
          name === "NotAllowedError" || name === "SecurityError" ? "Permissão de acesso à balança negada." :
            "Não foi possível abrir a balança. Confira a porta, o cabo e se outro programa está usando o dispositivo.")
    }
  }

  private async read(attempt: Attempt): Promise<void> {
    const reader = attempt.reader!
    const decoder = new ScaleFrameDecoder(this.now)
    try {
      while (this.attempt === attempt) {
        const { value, done } = await reader.read()
        if (this.attempt !== attempt) break
        if (done) { this.end(attempt, "disconnected", "Balança desconectada."); break }
        if (!value) continue
        for (const frame of decoder.push(value)) {
          if (!frame) {
            this.publish({ status: "waiting", sample: null, message: "Leitura inválida ou protocolo incompatível. Confira o perfil da balança." })
            continue
          }
          attempt.validAt = this.now()
          const sample: ScaleSample = { ...frame, receivedAt: attempt.validAt, sequence: ++attempt.sequence }
          this.publish({ status: frame.stable ? "stable" : "unstable", sample })
        }
        // Fragmentos ficam no decoder sem alterar a última amostra ou sua idade.
        // O timer expira a leitura a partir do último frame completo válido.
      }
    } catch {
      if (this.attempt === attempt) this.end(attempt, "error", "Erro de comunicação com a balança. Desconecte e tente novamente.")
    } finally {
      reader.releaseLock()
    }
  }

  private end(attempt: Attempt, status: "disconnected" | "error", message: string) {
    if (this.attempt !== attempt) return
    this.attempt = null
    this.publish({ status, sample: null, message })
    this.cleanup = this.release(attempt).finally(() => { this.cleanup = null })
  }

  private release(attempt: Attempt): Promise<void> {
    if (attempt.closing) return attempt.closing
    clearInterval(attempt.timer)
    if (attempt.onDisconnect) this.serial?.removeEventListener("disconnect", attempt.onDisconnect)
    attempt.closing = (async () => {
      await attempt.opening?.catch(() => {})
      try { await attempt.reader?.cancel() } catch { /* transporte já encerrado */ }
      await attempt.reading
      try {
        if (attempt.opened) await attempt.port?.close()
      } catch {
        this.publish({ status: "error", sample: null, message: "Não foi possível fechar a porta. Remova o cabo da balança antes de reconectar." })
      } finally {
        if (attempt.claimed && attempt.port) claimedPorts.delete(attempt.port)
      }
    })()
    return attempt.closing
  }

  async disconnect(): Promise<void> {
    const attempt = this.attempt
    this.attempt = null
    this.publish({ status: "disconnecting", sample: null })
    if (attempt) this.cleanup = this.release(attempt)
    await this.cleanup
    this.cleanup = null
    if (this.snapshot.status === "disconnecting") this.publish(EMPTY_SCALE_SNAPSHOT)
  }
}
