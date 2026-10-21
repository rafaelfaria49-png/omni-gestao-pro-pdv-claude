import { describe, expect, it } from "vitest"
import { WeightSession, explicitUnitAsciiProtocol, simulatedWeightProtocol } from "../../lib/pesagem"
import { encode, fixture, frame, policy } from "./helpers"

describe("estabilidade, identidade, validade e aptidão física", () => {
  it("estima estabilidade de amostras novas cobrindo a janela mínima", () => {
    const f = fixture()
    f.session.markConnected()
    expect(f.send(frame()).snapshot.status).toBe("unstable")
    f.advance(100)
    f.send(frame("0.3505"))
    f.advance(100)
    const result = f.send(frame("0.351"))
    expect(result.snapshot).toMatchObject({ status: "ready", usable: true, reading: {
      sessionId: "session-a", contextId: "isolated-context", sequence: 3, packetSequence: 3,
      receivedAt: 1200, simulated: true, stability: { stable: true, source: "estimated", samples: 3 },
    } })
  })

  it("oscilação acima da tolerância impede estabilidade até sair da janela", () => {
    const f = fixture()
    f.session.markConnected()
    f.send(frame("0.300")); f.advance(100)
    f.send(frame("0.350")); f.advance(100)
    expect(f.send(frame("0.350")).snapshot.status).toBe("unstable")
    f.advance(301)
    f.send(frame("0.350")); f.advance(100)
    expect(f.send(frame("0.350")).snapshot.status).toBe("ready")
  })

  it("mesmo pacote, buffer vazio e snapshots não criam amostras", () => {
    const f = fixture()
    f.session.markConnected()
    f.send(frame())
    f.advance(200)
    const replay = f.session.receive({ sessionId: "session-a", packetSequence: 1, bytes: encode(frame()) })
    expect(replay.rejection).toBe("duplicate_packet")
    f.send("")
    for (let i = 0; i < 10; i++) expect(f.session.snapshot().reading?.stability.samples).toBe(1)
    expect(f.session.measurementCandidate()).toBeNull()
  })

  it("muitas mensagens num único pacote não comprovam duração da estabilidade", () => {
    const f = fixture()
    f.session.markConnected()
    expect(f.send(frame().repeat(10)).snapshot).toMatchObject({ status: "unstable", reading: { sequence: 10, packetSequence: 1 } })
  })

  it("um consumidor pode exigir sequência posterior à última observada", () => {
    const f = fixture()
    f.session.markConnected()
    f.send(frame("0.350", "ST"))
    const previous = f.session.measurementCandidate()!
    expect(f.session.measurementCandidate(previous.sequence)).toBeNull()
    f.send(frame("0.350", "ST"))
    expect(f.session.measurementCandidate(previous.sequence)?.sequence).toBe(2)
  })

  it("corrupção de linha sem terminador permanece erro, sem virar incompleto", () => {
    const f = fixture()
    f.session.markConnected()
    expect(f.send("x".repeat(257)).snapshot).toMatchObject({ status: "invalid", detail: "line_too_long" })
    expect(f.send("350 g\n").snapshot.status).toBe("invalid")
    expect(f.send(frame("0.350", "ST")).snapshot.status).toBe("ready")
  })

  it("política em KG compara massas em G sem perder a precisão", () => {
    const f = fixture()
    f.session.markConnected()
    f.send(frame("350.0000", "NA", "NET", "g")); f.advance(100)
    f.send(frame("0.3505000")); f.advance(100)
    expect(f.send(frame("351.0000", "NA", "NET", "g")).snapshot).toMatchObject({
      status: "ready", reading: { mass: { value: "351.0000", kilograms: "0.3510000", decimalPlaces: 4 } },
    })
  })

  it("preserva a janela entre fragmentos, mas não oferece a mensagem parcial", () => {
    const f = fixture()
    f.session.markConnected()
    for (let i = 0; i < 3; i++) {
      expect(f.send("SIM|NA|NET|0.").snapshot.status).toBe("incomplete")
      expect(f.session.measurementCandidate()).toBeNull()
      f.send("350|kg\n")
      if (i < 2) f.advance(100)
    }
    expect(f.session.snapshot().status).toBe("ready")
    expect(f.send("SIM|").snapshot.status).toBe("incomplete")
  })

  it("estabilidade do protocolo é distinta e US nunca é sobreposto por estimação", () => {
    const f = fixture()
    f.session.markConnected()
    expect(f.send(frame("0.350", "ST")).snapshot.reading?.stability).toEqual({ stable: true, source: "protocol", samples: 1 })
    for (let i = 0; i < 4; i++) {
      f.advance(100)
      expect(f.send(frame("0.350", "US")).snapshot.status).toBe("unstable")
    }
  })

  it("peso estável expira no limite e não é devolvido como leitura nova", () => {
    const f = fixture()
    f.session.markConnected()
    f.send(frame("350", "ST", "NET", "g"))
    f.advance(999)
    expect(f.session.measurementCandidate()?.mass.kilograms).toBe("0.350")
    f.advance(1)
    expect(f.session.snapshot()).toMatchObject({ status: "stale", reading: null, usable: false })
    f.send("")
    expect(f.session.measurementCandidate()).toBeNull()
    expect(f.send(frame()).snapshot.reading?.stability.samples).toBe(1)
  })

  it("não transporta amostras vencidas através de mensagem fragmentada", () => {
    const f = fixture("a", simulatedWeightProtocol, { windowMs: 5000 })
    f.session.markConnected()
    f.send(frame()); f.advance(100); f.send(frame()); f.send("SIM|NA|")
    f.advance(1000)
    expect(f.send("NET|0.350|kg\n").snapshot.reading?.stability.samples).toBe(1)
  })

  it.each([
    [frame("-0.350", "ST"), "negative"], [frame("0", "ST"), "zero"],
    [frame("0.350", "ST", "GROSS"), "gross_weight"],
    [frame("0.350", "ST", "UNKNOWN"), "unknown_weight_basis"],
    [frame("0.350", "ST", "NET", "lb"), "unknown_unit"],
    ["SIM|ERR|E01\n", "device_error"], ["SIM|OL\n", "overload"], ["garbage\n", "invalid"],
  ])("invalida o candidato anterior em %s", (message, status) => {
    const f = fixture()
    f.session.markConnected(); f.send(frame("0.350", "ST"))
    expect(f.send(message).snapshot.status).toBe(status)
    expect(f.session.measurementCandidate()).toBeNull()
  })

  it("não subtrai tara de peso líquido nem reinterpreta bruto", () => {
    const f = fixture()
    f.session.markConnected()
    expect(f.send(frame("350", "ST", "NET", "g")).snapshot.reading?.mass.value).toBe("350")
    expect(f.send(frame("350", "ST", "GROSS", "g")).snapshot.reading?.mass.value).toBe("350")
    expect(f.session.measurementCandidate()).toBeNull()
  })

  it.each(["disconnected", "cancelled", "timeout", "context_changed"] as const)("%s é terminal e remove toda leitura", (reason) => {
    const f = fixture()
    f.session.markConnected(); f.send(frame("0.350", "ST")); f.session.end(reason)
    expect(f.session.snapshot()).toMatchObject({ status: reason, reading: null, usable: false })
    expect(f.send(frame("0.350", "ST")).rejection).toBe("closed")
    expect(() => f.session.markConnected()).toThrow("single_use")
  })

  it("reconexão e contextos não herdam peso, sequência, fragmentos ou amostras", () => {
    const old = fixture("old")
    const fresh = fixture("fresh")
    old.session.markConnected(); old.send(frame("0.350", "ST")); old.send("SIM|ST|")
    old.session.end("disconnected"); fresh.session.markConnected()
    expect(fresh.session.receive({ sessionId: "old", packetSequence: 99, bytes: encode(frame("5", "ST")) }).rejection).toBe("foreign_session")
    expect(fresh.session.snapshot()).toMatchObject({ status: "waiting", reading: null })
    expect(fresh.send(frame()).snapshot.reading).toMatchObject({ sessionId: "fresh", sequence: 1, stability: { samples: 1 } })
  })

  it("ASCII sem declaração de líquido nunca entrega aptidão operacional", () => {
    const f = fixture("a", explicitUnitAsciiProtocol())
    f.session.markConnected()
    for (let i = 0; i < 3; i++) { f.send("350 g\n"); f.advance(100) }
    expect(f.session.snapshot().status).toBe("unknown_weight_basis")
  })

  it("limita amostras na janela explicitamente configurada", () => {
    const f = fixture("a", simulatedWeightProtocol, { maximumSamples: 3 })
    f.session.markConnected()
    for (let i = 0; i < 10; i++) { f.send(frame()); f.advance(10) }
    expect(f.session.snapshot().reading?.stability.samples).toBe(3)
    expect(f.session.snapshot().status).toBe("unstable")
  })

  it("erro de parser e relógio regressivo invalidam sem reaproveitar peso", () => {
    const f = fixture("a", { id: "broken", simulated: true, parse() { throw new Error("broken") } })
    f.session.markConnected()
    expect(f.send("line\n").snapshot).toMatchObject({ status: "invalid", detail: "parser_error" })
    f.advance(-1)
    expect(f.session.snapshot().status).toBe("clock_error")
  })

  it("valida as políticas e não compartilha suas referências mutáveis", () => {
    expect(() => fixture("a", simulatedWeightProtocol, { minimumSamples: 1 })).toThrow("invalid_stability_policy")
    expect(() => fixture("a", simulatedWeightProtocol, { minimumSpanMs: 501 })).toThrow("invalid_stability_policy")
    expect(() => fixture("a", simulatedWeightProtocol, { toleranceKg: "-0.1" })).toThrow("invalid_tolerance")
    const mutable = { ...policy }
    const session = new WeightSession({ sessionId: "x", contextId: "y", protocol: simulatedWeightProtocol, policy: mutable })
    session.markConnected()
    mutable.validForMs = 0
    session.receive({ sessionId: "x", packetSequence: 1, bytes: encode(frame("0.350", "ST")) })
    expect(session.snapshot().usable).toBe(true)
    expect(Object.isFrozen(session.snapshot().reading?.mass)).toBe(true)
  })
})
