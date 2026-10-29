/** Manual KG protocol. Quantities use integer grams; money uses integer cents. */
import { toStockUnits, parseKgQuantityInput } from "@/lib/estoque/stock-quantity"

export const MANUAL_KG_SALE = "classic-manual-kg-v1" as const
export type ManualKgSale = typeof MANUAL_KG_SALE

export function moneyCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) ? cents : null
}

export function saleQuantityGrams(value: unknown): number | null {
  const grams = toStockUnits(value, "KG")
  return grams !== null && grams > 0 && grams <= 2_000_000_000_000 ? grams : null
}

/** Half-up once per item, including the exact half-cent case. */
export function saleLineTotalCents(quantity: number, price: number): number | null {
  const grams = saleQuantityGrams(quantity)
  const cents = moneyCents(price)
  if (grams === null || cents === null) return null
  const result = Number((BigInt(grams) * BigInt(cents) + BigInt(500)) / BigInt(1000))
  return Number.isSafeInteger(result) ? result : null
}

/** Percent precision is explicit; discount components never use double addition. */
export function manualKgDiscountCents(subtotalCents: number, percent: number, reais: number): number | null {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) return null
  const text = String(percent)
  if (!/^\d+(\.\d{1,4})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const percentUnits = Number(whole) * 10000 + Number(fraction.padEnd(4, "0"))
  const fixed = moneyCents(reais)
  if (fixed === null) return null
  const proportional = (BigInt(subtotalCents) * BigInt(percentUnits) + BigInt(500000)) / BigInt(1000000)
  const sum = proportional + BigInt(fixed)
  return Number(sum > BigInt(subtotalCents) ? BigInt(subtotalCents) : sum)
}

export function parseManualKg(text: string) {
  const parsed = parseKgQuantityInput(text)
  if (!parsed.ok) return parsed
  if (saleQuantityGrams(parsed.value) === null) return { ok: false as const, reason: "Informe um peso maior que zero, com até 3 casas decimais." }
  return parsed
}

export class ManualKgSaleError extends Error {
  readonly code = "MANUAL_KG_SALE_BLOCKED"
  constructor(message = "Venda manual em KG não liberada para esta loja. Nenhuma venda foi registrada.") {
    super(message)
    this.name = "ManualKgSaleError"
  }
}
