import { AsciiLineFramer } from "./framing"
import { compareDecimal, parseMass, withinTolerance, type Mass } from "./mass"
import type { ParsedWeight, WeightBasis, WeightProtocol } from "./protocol"

export type EndReason = "disconnected" | "cancelled" | "timeout" | "context_changed" |
  "read_error" | "connection_error" | "port_in_use" | "cleanup_error" | "clock_error"
export type WeightStatus = EndReason | "idle" | "waiting" | "ready" | "unstable" | "stale" |
  "incomplete" | "invalid" | "unknown_unit" | "device_error" | "overload" |
  "negative" | "zero" | "gross_weight" | "unknown_weight_basis"

export type WeightReading = Readonly<{
  sessionId: string
  contextId: string
  sequence: number
  packetSequence: number
  receivedAt: number
  protocolId: string
  simulated: boolean
  mass: Mass
  basis: WeightBasis
  stability: Readonly<{ stable: boolean; source: "protocol" | "estimated"; samples: number }>
}>

export type WeightSnapshot = Readonly<{
  sessionId: string
  contextId: string
  status: WeightStatus
  detail: string | null
  reading: WeightReading | null
  /** Aptidão física apenas; não autoriza venda, produto, loja ou terminal. */
  usable: boolean
}>

export type StabilityPolicy = Readonly<{
  windowMs: number
  minimumSpanMs: number
  minimumSamples: number
  maximumSamples: number
  toleranceKg: string
  validForMs: number
}>

export type ReceiveResult = {
  accepted: boolean
  rejection?: "foreign_session" | "duplicate_packet" | "closed" | "invalid_packet_sequence"
  snapshot: WeightSnapshot
}

export class WeightSession {
  readonly sessionId: string
  readonly contextId: string
  private readonly protocol: WeightProtocol
  private readonly policy: StabilityPolicy
  private readonly clock: () => number
  private readonly framer: AsciiLineFramer
  private status: WeightStatus = "idle"
  private detail: string | null = null
  private reading: WeightReading | null = null
  private samples: { kilograms: string; receivedAt: number }[] = []
  private packetSequence = 0
  private sequence = 0
  private lastClock = -Infinity
  private active = false
  private ended = false

  constructor(options: {
    sessionId: string; contextId: string; protocol: WeightProtocol; policy: StabilityPolicy
    clock?: () => number; maxLineBytes?: number
  }) {
    if (!options.sessionId.trim() || !options.contextId.trim()) throw new Error("session_and_context_required")
    const p = options.policy
    if (![p.windowMs, p.minimumSpanMs, p.validForMs].every((n) => Number.isFinite(n) && n > 0) ||
        p.minimumSpanMs > p.windowMs || !Number.isSafeInteger(p.minimumSamples) || p.minimumSamples < 2 ||
        !Number.isSafeInteger(p.maximumSamples) || p.maximumSamples < p.minimumSamples || p.maximumSamples > 10000) {
      throw new Error("invalid_stability_policy")
    }
    const tolerance = parseMass(p.toleranceKg, "kg")
    if (!tolerance.ok || compareDecimal(tolerance.mass.value, "0") < 0) throw new Error("invalid_tolerance")
    this.sessionId = options.sessionId
    this.contextId = options.contextId
    this.protocol = Object.freeze({ id: options.protocol.id, simulated: options.protocol.simulated,
      parse: options.protocol.parse.bind(options.protocol) })
    this.policy = Object.freeze({ ...p, toleranceKg: tolerance.mass.value })
    this.clock = options.clock ?? Date.now
    this.framer = new AsciiLineFramer(options.maxLineBytes)
  }

  get isActive(): boolean { return this.active }
  get isEnded(): boolean { return this.ended }

  markConnected(): void {
    if (this.active || this.ended) throw new Error("session_is_single_use")
    this.active = true
    this.status = "waiting"
  }

  end(reason: EndReason, detail: string | null = null): void {
    this.active = false
    this.ended = true
    this.invalidate(reason, detail)
    this.framer.reset()
  }

  private invalidate(status: WeightStatus, detail: string | null = null, clearSamples = true): void {
    this.status = status
    this.detail = detail
    this.reading = null
    if (clearSamples) this.samples = []
  }

  private now(): number | null {
    const now = this.clock()
    if (!Number.isFinite(now) || now < 0 || now < this.lastClock) {
      this.end("clock_error")
      return null
    }
    this.lastClock = now
    if (this.reading && now - this.reading.receivedAt >= this.policy.validForMs) this.invalidate("stale")
    if (this.samples.length && now - this.samples[this.samples.length - 1].receivedAt >= this.policy.validForMs) {
      this.samples = []
    }
    return now
  }

  receive(packet: { sessionId: string; packetSequence: number; bytes: Uint8Array }): ReceiveResult {
    if (packet.sessionId !== this.sessionId) return this.reject("foreign_session")
    if (!this.active) return this.reject("closed")
    if (!Number.isSafeInteger(packet.packetSequence) || packet.packetSequence < 1) return this.reject("invalid_packet_sequence")
    if (packet.packetSequence <= this.packetSequence) return this.reject("duplicate_packet")
    const now = this.now()
    if (now === null) return this.reject("closed")
    this.packetSequence = packet.packetSequence
    const frames = this.framer.push(packet.bytes)
    for (const frame of frames) {
      this.sequence++
      if (frame.kind === "invalid") this.invalidate("invalid", frame.detail)
      else {
        let parsed: ParsedWeight
        try { parsed = this.protocol.parse(frame.line) }
        catch { parsed = { kind: "invalid", detail: "parser_error" } }
        this.accept(parsed, now)
      }
    }
    // Uma nova mensagem parcial retira a aptidão da anterior imediatamente.
    if (this.framer.pending) this.invalidate("incomplete", null, false)
    return { accepted: true, snapshot: this.snapshot() }
  }

  private reject(rejection: ReceiveResult["rejection"]): ReceiveResult {
    return { accepted: false, rejection, snapshot: this.snapshot() }
  }

  private accept(parsed: ParsedWeight, now: number): void {
    if (parsed.kind !== "measurement") {
      this.invalidate(parsed.kind, parsed.detail)
      return
    }
    const sign = compareDecimal(parsed.mass.kilograms, "0")
    const eligibleMass = sign > 0 && parsed.basis === "net"
    let stable = parsed.stable === true
    let count = 1
    if (parsed.stable !== undefined || !eligibleMass) this.samples = []
    else {
      this.samples = this.samples.filter((sample) => now - sample.receivedAt <= this.policy.windowMs)
      this.samples.push({ kilograms: parsed.mass.kilograms, receivedAt: now })
      this.samples = this.samples.slice(-this.policy.maximumSamples)
      count = this.samples.length
      stable = count >= this.policy.minimumSamples &&
        now - this.samples[0].receivedAt >= this.policy.minimumSpanMs &&
        withinTolerance(this.samples.map((sample) => sample.kilograms), this.policy.toleranceKg)
    }
    this.reading = Object.freeze({
      sessionId: this.sessionId, contextId: this.contextId, sequence: this.sequence,
      packetSequence: this.packetSequence, receivedAt: now,
      protocolId: this.protocol.id, simulated: this.protocol.simulated,
      mass: parsed.mass, basis: parsed.basis,
      stability: Object.freeze({ stable, source: parsed.stable === undefined ? "estimated" : "protocol", samples: count }),
    })
    this.detail = null
    this.status = sign < 0 ? "negative" : sign === 0 ? "zero" : parsed.basis === "gross" ? "gross_weight" :
      parsed.basis === "unknown" ? "unknown_weight_basis" : stable ? "ready" : "unstable"
  }

  snapshot(): WeightSnapshot {
    if (this.active) this.now()
    return Object.freeze({ sessionId: this.sessionId, contextId: this.contextId,
      status: this.status, detail: this.detail, reading: this.reading, usable: this.status === "ready" })
  }

  measurementCandidate(afterSequence = 0): WeightReading | null {
    const state = this.snapshot()
    return state.usable && state.reading && state.reading.sequence > afterSequence ? state.reading : null
  }
}
