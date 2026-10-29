import { describe, expect, it } from "vitest"
import {
  formatStockQuantity,
  fromStockUnits,
  MAX_STOCK_UNITS,
  parseKgQuantityInput,
  stockUnitFromMetadata,
  toStockUnits,
} from "@/lib/estoque/stock-quantity"

describe("toStockUnits / fromStockUnits — exato, sem tolerância", () => {
  it.each([
    [2.5, 2500],
    [0.75, 750],
    [3.25, 3250],
    [0.001, 1],
    [1234.567, 1234567],
    [0, 0],
    [-0.05, -50],
  ])("KG %s → %s milésimos e volta", (kg, units) => {
    expect(toStockUnits(kg, "KG")).toBe(units)
    expect(fromStockUnits(units, "KG")).toBe(kg)
  })

  it("todo milésimo de 0 a 100 kg faz ida e volta exata pelo double", () => {
    for (let m = 0; m <= 100_000; m++) expect(toStockUnits(fromStockUnits(m, "KG"), "KG")).toBe(m)
  })

  it.each([0.0005, 1.2345, 1e-7, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY, "2.5", null])(
    "KG recusa %s (precisão acima de 3 casas ou não numérico)",
    (value) => expect(toStockUnits(value, "KG")).toBeNull(),
  )

  it("UN e G só aceitam inteiros; saldos inteiros antigos ficam idênticos", () => {
    expect(toStockUnits(10, "UN")).toBe(10)
    expect(toStockUnits(10, "KG")).toBe(10_000)
    expect(fromStockUnits(10_000, "KG")).toBe(10)
    expect(toStockUnits(2.5, "UN")).toBeNull()
    expect(toStockUnits(350, "G")).toBe(350)
    expect(toStockUnits(0.5, "G")).toBeNull()
  })

  it("limite de 15 dígitos", () => {
    expect(toStockUnits(fromStockUnits(MAX_STOCK_UNITS, "KG"), "KG")).toBe(MAX_STOCK_UNITS)
    expect(toStockUnits(1e15, "UN")).toBeNull()
  })

  it("unidade vem da declaração comercial canônica (legado vendaPorPeso = KG)", () => {
    expect(stockUnitFromMetadata(null)).toBe("UN")
    expect(stockUnitFromMetadata({ vendaPorPeso: true })).toBe("KG")
    expect(stockUnitFromMetadata({ comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } })).toBe("G")
  })
})

describe("formatStockQuantity / parseKgQuantityInput", () => {
  it("KG sempre com 3 casas e vírgula; UN como inteiro", () => {
    expect(formatStockQuantity(3.25, "KG")).toBe("3,250")
    expect(formatStockQuantity(1234.5, "KG")).toBe("1234,500")
    expect(formatStockQuantity(7, "UN")).toBe("7")
  })

  it.each([
    ["2,500", 2.5],
    ["0,750", 0.75],
    ["3", 3],
    [" 0,001 ", 0.001],
  ])("lê %j", (text, value) => expect(parseKgQuantityInput(text)).toEqual({ ok: true, value }))

  it.each([
    ["", /Informe/],
    ["2.500", /vírgula/],
    ["1.234,5", /vírgula/],
    ["0,7505", /3 casas/],
    ["-1", /inválida/],
    ["1,", /inválida/],
    ["abc", /inválida/],
  ])("recusa %j", (text, reason) => {
    const r = parseKgQuantityInput(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(reason)
  })
})
