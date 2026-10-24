import { describe, expect, it } from "vitest"
import { manualProductNumberText, parseManualProductNumber } from "./manual-product-input"

describe("Números do cadastro manual", () => {
  it.each(["", "  "])("distingue vazio (%j) de zero", (raw) => {
    expect(parseManualProductNumber(raw, "money")).toEqual({ state: "empty" })
    expect(parseManualProductNumber(raw, "integer")).toEqual({ state: "empty" })
  })
  it.each([["0", 0], ["0,00", 0], ["12,50", 12.5], ["12.50", 12.5], ["1.234,56", 1234.56], ["1.234", 1234]])("dinheiro %s = %s", (raw, value) => {
    expect(parseManualProductNumber(raw as string, "money")).toEqual({ state: "valid", value })
  })
  it.each(["-1", "-0", "abc", "R$abc", "NaN", "Infinity", "1e2", "0x10", "1,234", "1.23,45", "1,2,3", "1.2345", "90071992547409920"])("recusa dinheiro %j sem coerção", (raw) => {
    expect(parseManualProductNumber(raw, "money")).toEqual({ state: "invalid" })
  })
  it.each(["0", "12", "2147483647"])("quantidade inteira %j", (raw) => {
    expect(parseManualProductNumber(raw, "integer")).toEqual({ state: "valid", value: Number(raw) })
  })
  it.each(["0,350", "1.5", "1,0", "1.000", "-1", "texto", "NaN", "Infinity", "1e2", "2147483648"])("recusa quantidade %j sem truncar", (raw) => {
    expect(parseManualProductNumber(raw, "integer")).toEqual({ state: "invalid" })
  })
  it("apresenta o valor histórico sem arredondá-lo", () => {
    expect(manualProductNumberText(1.2345)).toBe("1,2345")
    expect(manualProductNumberText(0)).toBe("0")
    expect(manualProductNumberText(undefined)).toBe("")
  })
})
