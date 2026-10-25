/**
 * ESTOQUE-MANUAL-KG-001 — Quantidade de estoque por unidade comercial.
 *
 * Módulo PURO (sem I/O). As colunas de saldo são `double precision`; a aritmética
 * de saldo NUNCA acontece em ponto flutuante: o boundary converte para unidades
 * mínimas inteiras (UN/G = 1, KG = milésimo), soma/compara inteiros e só grava
 * `unidades / escala`. Ler de volta é exato: `String(x)` de um double é o decimal
 * mais curto que o reproduz, e todo valor com até 15 dígitos significativos volta
 * ao mesmo decimal. Sem tolerância: valor com mais casas do que a unidade admite
 * é rejeitado, nunca arredondado.
 */
import { productCommercialFromMetadata } from "@/lib/cadastros/product-commercial-contract"

export type StockUnit = "UN" | "KG" | "G"

/** Casas decimais aceitas por unidade. G é contado em gramas inteiros. */
export function stockDecimals(unit: StockUnit): 0 | 3 {
  return unit === "KG" ? 3 : 0
}

export function stockScale(unit: StockUnit): 1 | 1000 {
  return unit === "KG" ? 1000 : 1
}

/** Unidade de saldo do produto, pela declaração comercial canônica. */
export function stockUnitFromMetadata(metadata: unknown): StockUnit {
  return productCommercialFromMetadata(metadata).unidade
}

/** Teto de unidades mínimas: 15 dígitos garantem ida e volta exata pelo double. */
export const MAX_STOCK_UNITS = 999_999_999_999_999

/**
 * Converte um saldo/quantidade para unidades mínimas inteiras.
 * `null` = não finito, fora do domínio ou com mais casas que a unidade admite.
 */
export function toStockUnits(value: unknown, unit: StockUnit): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const text = String(Math.abs(value))
  // Notação exponencial = abaixo de 1e-6 ou acima de 1e21: fora do domínio de estoque.
  if (/e/i.test(text)) return null
  const [inteiro, fracao = ""] = text.split(".")
  const casas = stockDecimals(unit)
  if (fracao.length > casas) return null
  const unidades = Number(inteiro) * stockScale(unit) + (casas ? Number(fracao.padEnd(casas, "0")) : 0)
  if (!Number.isSafeInteger(unidades) || unidades > MAX_STOCK_UNITS) return null
  return value < 0 && unidades !== 0 ? -unidades : unidades
}

/** Inverso de `toStockUnits`: o double mais próximo do decimal exato. */
export function fromStockUnits(units: number, unit: StockUnit): number {
  return units / stockScale(unit)
}

/** Texto pt-BR do saldo. KG sempre com 3 casas ("3,250"); UN/G como inteiro. */
export function formatStockQuantity(value: number, unit: StockUnit): string {
  if (unit !== "KG") return String(value)
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false })
}

export type StockQuantityInput = { ok: true; value: number } | { ok: false; reason: string }

/**
 * Leitura do campo de quantidade em KG. Vírgula é o único separador decimal;
 * ponto é recusado (em pt-BR "2.500" pode ser milhar ou decimal — não adivinhar).
 */
export function parseKgQuantityInput(text: string): StockQuantityInput {
  const t = (text ?? "").trim()
  if (!t) return { ok: false, reason: "Informe a quantidade em kg." }
  if (t.includes(".")) return { ok: false, reason: "Use vírgula para os decimais (ex.: 2,500 kg)." }
  if (!/^\d+(,\d+)?$/.test(t)) return { ok: false, reason: "Quantidade inválida. Use somente números e vírgula (ex.: 0,750)." }
  const [inteiro, fracao = ""] = t.split(",")
  if (fracao.length > 3) return { ok: false, reason: "Use no máximo 3 casas decimais (gramas)." }
  const value = Number(`${inteiro}.${fracao || "0"}`)
  if (toStockUnits(value, "KG") === null) return { ok: false, reason: "Quantidade fora do limite permitido." }
  return { ok: true, value }
}
