import { saleFromDbRow } from "./sale-from-db-row"
import { describe, it, expect } from "vitest"
import { itemCommercialQuantity, itemQuantityWrite } from "./item-quantity"
import { manualKgTaxSnapshot } from "./manual-kg-tax"
import { planKgWeightCorrection } from "./manual-kg-correction-plan"
import { classifyQuarantineCandidate, QUARANTINE_RECOVERY_CLASS } from "./quarantine-recovery-planner"
const item = { id: "line", inventoryId: "product", nome: "KG", quantidade: .35, quantityUnit: "KG", precoUnitario: 20, lineTotal: 7 }
const draft = { ...item, inventoryId: "product", quantidade: .3 }
const tax = manualKgTaxSnapshot(700, {})
const plan = (change: Record<string, unknown> = {}) => planKgWeightCorrection({ oldLines: [item], newLines: [draft], oldTotal: 7, oldBreakdown: { dinheiro: 7 }, discount: 0, tax, ...change })
describe("additive KG operational contract", () => {
  it("reads exact KG including integer weights without treating NULL as zero", () => {
    expect(itemCommercialQuantity(itemQuantityWrite(.35, true))).toBe(.35)
    expect(itemCommercialQuantity(itemQuantityWrite(1, true))).toBe(1)
    expect(itemCommercialQuantity(itemQuantityWrite(2, false))).toBe(2)
    for (const row of [{ quantidade: null }, { quantidade: .35 }, { quantidade: 1, quantidadeKg: "1" }, { quantidade: null, quantidadeKg: "0.3501" }]) expect(() => itemCommercialQuantity(row)).toThrow()
  })
  it("calculates estimated surcharge in cents before discount, half-up", () => {
    expect(manualKgTaxSnapshot(18, { incluirImpostoEstimadoNoPdv: true, aliquotaImpostoEstimadoPdv: 25 })).toMatchObject({ baseCents: 18, taxCents: 5 })
    expect(manualKgTaxSnapshot(700, { incluirImpostoEstimadoNoPdv: true })).toMatchObject({ ratePercent: 8, taxCents: 56 })
    for (const rate of [-1, 101, .00001, NaN, "20"]) expect(() => manualKgTaxSnapshot(700, { incluirImpostoEstimadoNoPdv: true, aliquotaImpostoEstimadoPdv: rate })).toThrow()
  })
  it("plans exact weight delta and cash reconciliation with original frozen rate", () => {
    expect(plan()).toMatchObject({ ok: true, newTotal: 6, deltaTotal: -1, stockDeltas: [{ deltaQty: -.05 }], newBreakdown: { dinheiro: 6 } })
    const taxed = manualKgTaxSnapshot(700, { incluirImpostoEstimadoNoPdv: true, aliquotaImpostoEstimadoPdv: 20 })
    expect(plan({ oldTotal: 8.4, oldBreakdown: { dinheiro: 8.4 }, tax: taxed })).toMatchObject({ ok: true, newTotal: 7.2, tax: { ratePercent: 20, baseCents: 600, taxCents: 120 } })
  })
  it("blocks product/price changes, ambiguous lines, fractional precision and noncash domains", () => {
    for (const patch of [{ discount: 1 }, { newLines: [{ ...draft, id: "another" }] }, { newLines: [{ ...draft, precoUnitario: 21 }] }, { newLines: [{ ...draft, quantidade: .3501 }] }, { oldLines: [item, item] }, { oldBreakdown: { pix: 7 } }, { tax: null }]) expect(plan(patch).ok).toBe(false)
  })
  it("weight can change while monetary total stays the same", () => {
    const old = { ...item, precoUnitario: 1, lineTotal: .35 }
    expect(plan({ oldLines: [old], newLines: [{ ...old, quantidade: .351 }], oldTotal: .35, oldBreakdown: { dinheiro: .35 }, tax: manualKgTaxSnapshot(35, {}) })).toMatchObject({ ok: true, newTotal: .35, stockDeltas: [{ deltaQty: .001 }] })
  })
  it.each([.35, 1])("historical KG %s is blocked before integer planning; confirmed reconciliation remains read-only", (quantity) => {
    const candidate = { id: "VDA-2026-01", manualKgSale: "classic-manual-kg-v1", lines: [{ quantity }], total: 7 }
    const facts = { occupantExists: false, originalSessionStatus: "NO_SESSION_ID" as const }
    expect(classifyQuarantineCandidate({ storeId: "store", candidate, facts }).klass).toBe(QUARANTINE_RECOVERY_CLASS.MANUAL_KG_HISTORICAL_BLOCKED)
    expect(classifyQuarantineCandidate({ storeId: "store", candidate, facts: { ...facts, alreadyRecoveredPedidoId: "VDA-2026-02" } }).klass).toBe(QUARANTINE_RECOVERY_CLASS.ALREADY_RECOVERED)
  })
})


it("KG read-model always supplies database time when an API sale omitted payload.at", () => {
 const at = new Date("2026-10-29T12:34:56Z")
 const sale = saleFromDbRow({ pedidoId: "KG-API", total: 7, at, clienteNome: null, status: "concluida", payload: { id: "KG-API", manualKgSale: "classic-manual-kg-v1", lines: [{ quantity: .35 }], paymentBreakdown: { dinheiro: 7 } }, itens: [{ nome: "KG", inventoryId: "kg", quantidade: null, quantidadeKg: "0.35", precoUnitario: 20, lineTotal: 7 }] })
 expect(sale.at).toBe("2026-10-29T12:34:56.000Z")
 expect(sale.paymentBreakdown).toMatchObject({ dinheiro: 7, creditoVale: 0, aPrazo: 0 })
})
