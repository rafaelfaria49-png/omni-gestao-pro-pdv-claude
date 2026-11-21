import { toStockUnits } from "@/lib/estoque/stock-quantity"
import { ManualKgSaleError, saleQuantityGrams } from "./manual-kg-contract"

export type CommercialQuantityRow = { quantidade: number | null; quantidadeKg?: unknown }

/** Sole adapter for database quantities; never coerce a NULL KG sentinel into zero. */
export function itemCommercialQuantity(item: CommercialQuantityRow): number {
  if (item.quantidadeKg !== null && item.quantidadeKg !== undefined) {
    const text = String(item.quantidadeKg)
    if (item.quantidade !== null || !/^\d+(\.\d{1,3})?$/.test(text)) throw new ManualKgSaleError("Contrato da quantidade KG inválido. Operação bloqueada.")
    const value = Number(text)
    if (saleQuantityGrams(value) === null || toStockUnits(value, "KG") === null) throw new ManualKgSaleError("Quantidade KG persistida fora do contrato.")
    return value
  }
  if (typeof item.quantidade !== "number" || !Number.isInteger(item.quantidade)) throw new ManualKgSaleError("Quantidade ausente ou incompatível. Atualize o leitor da venda.")
  return item.quantidade
}

export function itemQuantityWrite(quantity: number, kg: boolean) {
  if (kg) {
    if (saleQuantityGrams(quantity) === null) throw new ManualKgSaleError("Peso inválido: use até três casas decimais.")
    return { quantidade: null, quantidadeKg: String(quantity) }
  }
  if (!Number.isInteger(quantity)) throw new ManualKgSaleError("Produto UN exige quantidade inteira.")
  return { quantidade: quantity }
}

export function isKgItem(item: { quantidadeKg?: unknown }): boolean {
  return item.quantidadeKg !== undefined && item.quantidadeKg !== null
}
