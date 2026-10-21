import { WeightSession, simulatedWeightProtocol, type StabilityPolicy, type WeightProtocol } from "../../lib/pesagem"

export const policy: StabilityPolicy = {
  windowMs: 500, minimumSpanMs: 200, minimumSamples: 3, maximumSamples: 256,
  toleranceKg: "0.001", validForMs: 1000,
}
export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
export const frame = (value = "0.350", state = "NA", basis = "NET", unit = "kg"): string =>
  `SIM|${state}|${basis}|${value}|${unit}\n`

export function fixture(id = "session-a", protocol: WeightProtocol = simulatedWeightProtocol,
  overrides: Partial<StabilityPolicy> = {}) {
  let now = 1000
  let packetSequence = 0
  const session = new WeightSession({ sessionId: id, contextId: "isolated-context", protocol,
    policy: { ...policy, ...overrides }, clock: () => now })
  return {
    session,
    advance(ms: number) { now += ms },
    send(text: string) { return session.receive({ sessionId: id, packetSequence: ++packetSequence, bytes: encode(text) }) },
  }
}

export function simulatedStream() {
  let source!: ReadableStreamDefaultController<Uint8Array>
  let cancellations = 0
  let closes = 0
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { source = controller },
    cancel() { cancellations++ },
  })
  return { stream, send(text: string) { source.enqueue(encode(text)) },
    disconnect() { source.close() }, fail() { source.error(new Error("simulated_read_failure")) },
    async close() { closes++ }, stats: () => ({ cancellations, closes, locked: stream.locked }) }
}

export const flush = async (): Promise<void> => {
  for (let step = 0; step < 8; step++) await Promise.resolve()
}
