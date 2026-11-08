import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import { moneyCents, saleLineTotalCents, saleQuantityGrams } from "./manual-kg-contract"
import { manualKgTaxSnapshot, type ManualKgTaxSnapshot } from "./manual-kg-tax"

export type KgCorrectionLine = { id: string; inventoryId: string | null; nome: string; quantidade: number; precoUnitario: number; lineTotal: number; quantityUnit?: string }
export type KgCorrectionDraft = { id?: string; inventoryId: string; quantidade: number; precoUnitario: number; nome: string; desconto?: number; isAvulso?: boolean }
const zero: PaymentBreakdownFull = { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 }

/** Deliberately narrow: one KG item, weight only, original price, cash and no discount. */
export function planKgWeightCorrection(input: { oldLines: KgCorrectionLine[]; newLines: KgCorrectionDraft[]; oldTotal: number; oldBreakdown: Partial<PaymentBreakdownFull> | null; discount: number; tax: unknown }) {
  const oldBreakdown = { ...zero, ...input.oldBreakdown }
  const base = { ok: false, errorCode: "kg_restrito", error: "Correção KG permite somente o peso de uma venda com um item KG, sem desconto e paga integralmente em dinheiro.", oldTotal: input.oldTotal, newTotal: input.oldTotal, deltaTotal: 0, oldBreakdown, newBreakdown: oldBreakdown, stockDeltas: [] as Array<{ inventoryId: string; nome: string; deltaQty: number }>, tax: null as ManualKgTaxSnapshot | null, lineTotal: 0 }
  const [old] = input.oldLines, [next] = input.newLines
  const totalCents = moneyCents(input.oldTotal)
  if (input.oldLines.length !== 1 || input.newLines.length !== 1 || !old || !next || old.quantityUnit !== "KG" || !old.inventoryId || input.discount !== 0 || moneyCents(oldBreakdown.dinheiro) !== totalCents || Object.entries(oldBreakdown).some(([key, value]) => key !== "dinheiro" && value !== 0)) return base
  if (next.id !== old.id || next.inventoryId !== old.inventoryId || next.precoUnitario !== old.precoUnitario || next.nome !== old.nome || next.isAvulso || (next.desconto ?? 0) !== 0) return { ...base, error: "Altere somente o peso do item original. Produto e preço permanecem os da venda." }
  const before = saleQuantityGrams(old.quantidade), after = saleQuantityGrams(next.quantidade)
  const oldLine = saleLineTotalCents(old.quantidade, old.precoUnitario), newLine = saleLineTotalCents(next.quantidade, old.precoUnitario)
  if (before === null || after === null || oldLine === null || newLine === null || moneyCents(old.lineTotal) !== oldLine) return { ...base, error: "Peso inválido. Informe valor positivo com até três casas decimais." }
  const frozen = input.tax as ManualKgTaxSnapshot | null
  if (!frozen || frozen.version !== 1 || typeof frozen.enabled !== "boolean") return { ...base, error: "Venda sem snapshot do imposto estimado. Correção bloqueada." }
  try {
    const config = { incluirImpostoEstimadoNoPdv: frozen.enabled, aliquotaImpostoEstimadoPdv: frozen.ratePercent }
    const previousTax = manualKgTaxSnapshot(oldLine, config), tax = manualKgTaxSnapshot(newLine, config)
    if (frozen.baseCents !== oldLine || frozen.taxCents !== previousTax.taxCents || totalCents !== oldLine + previousTax.taxCents) return { ...base, error: "Snapshot monetário divergente. Correção bloqueada." }
    if (before === after) return { ...base, errorCode: "no_change", error: "Nenhuma alteração no peso." }
    const newTotal = (newLine + tax.taxCents) / 100
    if (moneyCents(newTotal) === null) return { ...base, error: "Total fora do limite permitido." }
    return { ...base, ok: true, errorCode: undefined, error: undefined, newTotal, deltaTotal: ((newLine + tax.taxCents) - totalCents!) / 100, lineTotal: newLine / 100, tax, newBreakdown: { ...zero, dinheiro: newTotal }, stockDeltas: [{ inventoryId: old.inventoryId, nome: old.nome, deltaQty: (after - before) / 1000 }] }
  } catch { return { ...base, error: "Snapshot do imposto estimado inválido. Correção bloqueada." } }
}
