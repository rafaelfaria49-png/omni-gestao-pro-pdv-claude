import { describe, expect, it } from "vitest"
import { parseMass, explicitUnitAsciiProtocol, simulatedWeightProtocol } from "../../lib/pesagem"
import { AsciiLineFramer } from "../../lib/pesagem/framing"
import { encode } from "./helpers"

describe("medição exata e protocolos documentados", () => {
  it.each([
    ["350", "g", "0.350", 0], ["350.00", "g", "0.35000", 2],
    ["0,350", "kg", "0.350", 3], ["+02.3500", "kg", "2.3500", 4],
    ["0.000000001", "g", "0.000000000001", 9], ["-350", "g", "-0.350", 0],
    ["-0.000", "kg", "0.000", 3],
  ])("preserva %s %s como %s kg", (value, unit, kilograms, decimalPlaces) => {
    const result = parseMass(value, unit)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mass).toMatchObject({ unit, kilograms, decimalPlaces })
  })

  it.each(["0.1234567891", "1234567890123456789012345"]) ("rejeita excesso de precisão: %s", (value) => {
    expect(parseMass(value, "kg")).toEqual({ ok: false, code: "precision_exceeded" })
  })

  it.each(["1e3", "NaN", "Infinity", "1,000.00", "1.", "", "1 2"]) ("rejeita número ambíguo: %s", (value) => {
    expect(parseMass(value, "kg")).toEqual({ ok: false, code: "invalid_number" })
  })

  it("não presume unidade, decimal implícito ou protocolo", () => {
    const parser = explicitUnitAsciiProtocol()
    expect(parser.parse("1234")).toMatchObject({ kind: "unknown_unit" })
    expect(parser.parse("350 lb")).toMatchObject({ kind: "unknown_unit" })
    expect(parser.parse("ST,NT,0,   1,234 kg")).toMatchObject({ kind: "invalid" })
    expect(parser.parse("etiqueta 2035000070001")).toMatchObject({ kind: "invalid" })
  })

  it.each(["02.350kg", "+1234 g"]) ("consome apenas o exemplo explícito %s", (line) => {
    const value = explicitUnitAsciiProtocol().parse(line)
    expect(value).toMatchObject({ kind: "measurement", basis: "unknown", stable: undefined })
  })

  it("distingue estados simulados sem prometer compatibilidade física", () => {
    expect(simulatedWeightProtocol.simulated).toBe(true)
    expect(simulatedWeightProtocol.parse("SIM|ST|NET|350|g")).toMatchObject({ kind: "measurement", stable: true, basis: "net" })
    expect(simulatedWeightProtocol.parse("SIM|US|GROSS|350|g")).toMatchObject({ kind: "measurement", stable: false, basis: "gross" })
    expect(simulatedWeightProtocol.parse("SIM|ERR|E01")).toEqual({ kind: "device_error", detail: "E01" })
    expect(simulatedWeightProtocol.parse("SIM|OL")).toMatchObject({ kind: "overload" })
    expect(simulatedWeightProtocol.parse("SIM|ST|toString|350|g")).toMatchObject({ kind: "invalid" })
  })

  it("enquadra CRLF fragmentado e várias mensagens sem ler duas vezes o buffer", () => {
    const framer = new AsciiLineFramer()
    expect(framer.push(encode("350 g\r"))).toEqual([])
    expect(framer.push(encode("\n0.350 kg\n"))).toEqual([
      { kind: "line", line: "350 g" }, { kind: "line", line: "0.350 kg" },
    ])
    expect(framer.push(new Uint8Array())).toEqual([])
  })

  it("limita memória e descarta a linha inteira após corrupção", () => {
    const framer = new AsciiLineFramer(8)
    expect(framer.push(encode("x".repeat(10000) + "350 g\n350 g\n"))).toEqual([
      { kind: "invalid", detail: "line_too_long" }, { kind: "line", line: "350 g" },
    ])
    expect(framer.push(new Uint8Array([255, ...encode("350 g\n")]))).toEqual([
      { kind: "invalid", detail: "non_ascii_or_control_byte" },
    ])
  })
})
