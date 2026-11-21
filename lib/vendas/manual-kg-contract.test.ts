import { describe, expect, it } from "vitest"
import { parseManualKg, moneyCents, saleLineTotalCents, MANUAL_KG_SALE, manualKgDiscountCents } from "./manual-kg-contract"
import { buildLegacySaleFingerprint } from "./legacy-sale-fingerprint"
import { manualKgStoreApproved, isManualKgProduct } from "./manual-kg-server"
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
describe("manual KG commercial contract", () => {
  it.each([["0,350", .35], ["1,250", 1.25], ["10", 10], ["0,001", .001]])("parses %s as %s kg", (text, value) => expect(parseManualKg(text)).toEqual({ ok: true, value }))
  it.each(["", "0", "0,000", "-1", "0.350", "0,3501", "1,2x", "NaN", "Infinity", "1e2", "1,2,3"])("rejects %s without conversion", (text) => expect(parseManualKg(text).ok).toBe(false))
  it("uses exact cents including ties and multiple item rounding", () => {
    expect(saleLineTotalCents(.35, 20)).toBe(700)
    expect(saleLineTotalCents(1.25, 20)).toBe(2500)
    expect(saleLineTotalCents(.025, 1)).toBe(3)
    expect(saleLineTotalCents(.001, 5)).toBe(1)
    expect(saleLineTotalCents(.333, 19.99)).toBe(666)
    expect(saleLineTotalCents(.3501, 20)).toBeNull()
    expect(moneyCents(20.001)).toBeNull()
  })
  it("combines discounts in exact cents, including percentage ties", () => {
    expect(manualKgDiscountCents(200, 10, .1)).toBe(30)
    expect(manualKgDiscountCents(700, 10, 0)).toBe(70)
    expect(manualKgDiscountCents(25, 10, 0)).toBe(3)
    expect(manualKgDiscountCents(700, 100, 100)).toBe(700)
    expect(manualKgDiscountCents(700, 10.00001, 0)).toBeNull()
  })
  it("fingerprints distinguish grams even when prices round to the same cent", () => {
    const sale = (quantity: number) => ({ manualKgSale: MANUAL_KG_SALE, total: .01, lines: [{ inventoryId: "p", name: "Pão", quantity, unitPrice: 1, lineTotal: .01 }] })
    expect(buildLegacySaleFingerprint(sale(.010))).not.toBe(buildLegacySaleFingerprint(sale(.011)))
  })
  it("never enables G or an invalid declaration", () => {
    expect(isManualKgProduct(KG)).toBe(true)
    expect(isManualKgProduct({ comercial: { ...KG.comercial, unidade: "G", basePreco: "G" } })).toBe(false)
    expect(isManualKgProduct({ comercial: { ...KG.comercial, version: 7 } })).toBe(false)
    expect(manualKgStoreApproved("unapproved-store")).toBe(false)
  })
})
