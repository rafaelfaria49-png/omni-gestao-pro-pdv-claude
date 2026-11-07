import { describe, expect, it } from "vitest"
import { explicitUnitAsciiProtocol, simulatedWeightProtocol, WeightSession, type StabilityPolicy, type WeightProtocol } from "../../lib/pesagem"
import { proposeSaleWeight, SCALE_CAPTURE_PROFILES, summarizeRawCapture } from "../../lib/pesagem/sale-capture"

const policy: StabilityPolicy = { windowMs: 1000, minimumSpanMs: 200, minimumSamples: 3, maximumSamples: 20, toleranceKg: "0.002", validForMs: 1500 }
const enc = (s: string) => new TextEncoder().encode(s)

function session(protocol: WeightProtocol = simulatedWeightProtocol) {
  let t = 1000
  const clock = () => t
  const s = new WeightSession({ sessionId: "s1", contextId: "pdv-1:queijo", protocol, policy, clock })
  s.markConnected()
  let seq = 0
  return {
    s,
    at: (ms: number) => { t = ms },
    send: (line: string) => s.receive({ sessionId: "s1", packetSequence: ++seq, bytes: enc(line + "\n") }),
    now: () => t,
  }
}
const propose = (h: ReturnType<typeof session>, extra: Partial<Parameters<typeof proposeSaleWeight>[0]> = {}) =>
  proposeSaleWeight({ profileId: "simulated-v1", snapshot: h.s.snapshot(), contextId: "pdv-1:queijo", productUnit: "KG", now: h.now(), validForMs: policy.validForMs, bench: true, ...extra })

describe("proposta de peso para venda (preparação, sem captura física)", () => {
  it("nenhum perfil físico está homologado; Toledo não tem parser", () => {
    expect(Object.values(SCALE_CAPTURE_PROFILES).filter((p) => p.saleCaptureHomologated)).toEqual([])
    expect(SCALE_CAPTURE_PROFILES["toledo-prix3-fit"]).toMatchObject({ parserAvailable: false, status: "PENDING_PHYSICAL_HOMOLOGATION" })
  })

  it("Toledo é recusada antes de qualquer leitura; A&D e ASCII não propõem peso de venda", () => {
    const h = session(); h.send("SIM|ST|NET|0.350|kg")
    expect(propose(h, { profileId: "toledo-prix3-fit" })).toMatchObject({ ok: false, reason: "protocol_not_implemented" })
    expect(propose(h, { profileId: "and-hvg-stream", bench: false })).toMatchObject({ ok: false, reason: "protocol_not_homologated" })
    expect(propose(h, { profileId: "explicit-unit-ascii-v1" })).toMatchObject({ ok: false, reason: "protocol_not_homologated" })
    expect(propose(h, { profileId: "inventada" })).toMatchObject({ ok: false, reason: "unknown_profile" })
    expect(propose(h, { bench: false })).toMatchObject({ ok: false, reason: "protocol_not_homologated" })
  })

  it("bancada: leitura estável líquida de 0,350 kg vira 350 g exatos e marcada como simulada", () => {
    const h = session(); h.send("SIM|ST|NET|0.350|kg")
    expect(propose(h)).toMatchObject({ ok: true, grams: 350, kg: 0.35, kilograms: "0.350", simulated: true })
  })

  it.each([["0.001", 1], ["0.125", 125], ["1.250", 1250], ["2.350", 2350], ["9.999", 9999], ["350", 350, "g"]])("bancada: %s → %s g", (v, g, unit = "kg") => {
    const h = session(); h.send(`SIM|ST|NET|${v}|${unit}`)
    expect(propose(h)).toMatchObject({ ok: true, grams: g })
  })

  it("recusa instável, vencido, zero, negativo, bruto, sem base, precisão > 3 casas e outro contexto", () => {
    const cases: Array<[string, string]> = [
      ["SIM|US|NET|0.350|kg", "unstable"],
      ["SIM|ST|NET|0.000|kg", "zero"],
      ["SIM|ST|NET|-0.350|kg", "negative"],
      ["SIM|ST|GROSS|0.350|kg", "not_net_weight"],
      ["SIM|ST|UNKNOWN|0.350|kg", "not_net_weight"],
      ["SIM|ST|NET|0.3505|kg", "precision_exceeded"],
    ]
    for (const [line, reason] of cases) { const h = session(); h.send(line); expect(propose(h)).toMatchObject({ ok: false, reason }) }
    const stale = session(); stale.send("SIM|ST|NET|0.350|kg"); stale.at(1000 + policy.validForMs)
    expect(propose(stale)).toMatchObject({ ok: false, reason: "stale" })
    const other = session(); other.send("SIM|ST|NET|0.350|kg")
    expect(propose(other, { contextId: "pdv-1:presunto" })).toMatchObject({ ok: false, reason: "context_mismatch" })
    const un = session(); un.send("SIM|ST|NET|0.350|kg")
    expect(propose(un, { productUnit: "UN" })).toMatchObject({ ok: false, reason: "product_not_kg" })
  })

  it("leitura antiga é descartada após desconexão; sem leitura não há proposta", () => {
    const h = session(); h.send("SIM|ST|NET|0.350|kg"); h.s.end("disconnected")
    expect(propose(h)).toMatchObject({ ok: false })
    const empty = session()
    expect(propose(empty)).toMatchObject({ ok: false, reason: "no_reading" })
  })

  it("leitura real (protocolo não simulado) nunca passa pelo atalho de bancada", () => {
    const h = session(explicitUnitAsciiProtocol("net"))
    for (let i = 0; i < 4; i++) { h.at(1000 + i * 100); h.send("0.350 kg") }
    expect(h.s.snapshot().status).toBe("ready")
    expect(propose(h, { profileId: "simulated-v1" })).toMatchObject({ ok: false, reason: "protocol_not_homologated" })
  })
})

describe("diagnóstico passivo de porta", () => {
  it("resume bytes sem alegar protocolo", () => {
    const summary = summarizeRawCapture([{ at: 0, bytes: Uint8Array.from([0x02, 0x30, 0x2e, 0x33, 0x35, 0x30, 0x03]) }, { at: 120, bytes: enc("ok\r\n") }])
    expect(summary).toMatchObject({ totalBytes: 11, chunks: 2, terminators: { stx: 1, etx: 1, cr: 1, lf: 1, crlf: 1 }, medianGapMs: 120, protocolClaim: null })
    expect(summary.hexPreview.startsWith("02 30 2e 33 35 30 03")).toBe(true)
  })
})
