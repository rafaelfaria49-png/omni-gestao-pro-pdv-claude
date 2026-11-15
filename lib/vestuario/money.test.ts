import { describe, expect, it } from "vitest"
import { decimalToUnits, lineTotalCents, weightedAverageCostMicros, PRICE_SCALE, COST_SCALE } from "./money"

describe("precisão monetária do contrato novo", () => {
  it.each([
    ["0", 0], ["0.004999999999", 0], ["0.005", 1], ["1.005", 101],
    ["2.675", 268], ["39.90", 3990], ["999.999", 100000], ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("BRL %s → %i centavos HALF_UP decimal", (input, cents) => {
    expect(decimalToUnits(input, PRICE_SCALE)).toBe(cents)
  })
  it("arredonda custo apenas na sexta casa", () => {
    expect(decimalToUnits("1.0000004", COST_SCALE)).toBe(1000000)
    expect(decimalToUnits("1.0000005", COST_SCALE)).toBe(1000001)
  })
  it.each(["-1", "+1", "1,00", "1e2", "NaN", "Infinity", "01.00", "1.", " 1", "90071992547409.92"])("recusa formato/overflow %s", (input) => {
    expect(() => decimalToUnits(input, PRICE_SCALE)).toThrow()
  })
  it("não recebe Float nem aplica conversão implícita do legado", () => {
    expect(() => decimalToUnits(1.005 as unknown as string, PRICE_SCALE)).toThrow(TypeError)
  })
  it("calcula desconto em centavos e recusa negativo, fração e overflow", () => {
    expect(lineTotalCents(3, 3990, 101)).toBe(11869)
    expect(() => lineTotalCents(1, 100, 101)).toThrow(RangeError)
    expect(() => lineTotalCents(0.5, 100)).toThrow(RangeError)
    expect(() => lineTotalCents(2, Number.MAX_SAFE_INTEGER)).toThrow(RangeError)
  })
  it("média de custo mantém precisão e trata entrada com custo zero como fato explícito", () => {
    expect(weightedAverageCostMicros(2, 1000000, 1, 2000000)).toBe(1333333)
    expect(weightedAverageCostMicros(1, 1000000, 1, 1000001)).toBe(1000001)
    expect(weightedAverageCostMicros(0, 7000000, 1, 2500000)).toBe(2500000)
    expect(weightedAverageCostMicros(1, 2000000, 1, 0)).toBe(1000000)
    expect(() => weightedAverageCostMicros(1, 1, 0, 1)).toThrow(RangeError)
  })
})
