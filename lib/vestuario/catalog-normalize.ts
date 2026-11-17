/**
 * P02 — normalização e validação PURAS do catálogo de grade (sem I/O; usável no cliente e no servidor).
 * As mesmas regras estão nos CHECKs da migration 20261115120000: o banco é a autoridade final.
 */
import { decimalToUnits, PRICE_SCALE, COST_SCALE } from "./money"

export const GRADE_NOME_MAX = 60
export const TAMANHO_ROTULO_MAX = 20
export const COR_NOME_MAX = 60
export const SKU_MAX = 60
export const BARCODE_INTERNO_MAX = 48
export const MAX_TAMANHOS_POR_GRADE = 60
export const MAX_VARIANTES_POR_OPERACAO = 400
export const ORDEM_MAX = 10_000

const CONTROL = /[\u0000-\u001f\u007f]/

/** Texto exibível: NFC, espaços internos colapsados, sem controle. null = inválido/vazio. */
export function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const v = value.normalize("NFC").replace(/\s+/g, " ").trim()
  if (!v || v.length > max || CONTROL.test(v)) return null
  return v
}

/**
 * Chave de duplicidade de nomes (grade/cor/tamanho): sem diferença de caixa, acento ou espaço.
 * "Azul Marinho" ≡ "azul  marinho" ≡ "AZUL MARINHO"; "Azul" e "Azul Royal" continuam distintos.
 */
export function labelKey(label: string): string {
  return label.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase()
}

export type IdentifierResult = { ok: true; value: string | null } | { ok: false; message: string }

/**
 * SKU da variante: maiúsculas, sem espaço, [A-Z0-9._/-], começa por letra/dígito. Vazio = sem SKU (rascunho).
 * Comparação com SKU/barcode de produto simples é por upper(btrim()) — mesmo critério do trigger.
 */
export function normalizeVariantSku(value: unknown): IdentifierResult {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false, message: "SKU inválido." }
  const v = value.normalize("NFKC").trim().toUpperCase()
  if (!v) return { ok: true, value: null }
  if (/\s/.test(v)) return { ok: false, message: "SKU não pode ter espaços." }
  if (v.length > SKU_MAX || !/^[A-Z0-9][A-Z0-9._/-]*$/.test(v)) {
    return { ok: false, message: `SKU: use até ${SKU_MAX} letras sem acento, números, ponto, hífen, barra ou sublinhado.` }
  }
  return { ok: true, value: v }
}

/**
 * Código interno (Code 128) — reservado para a P03. Não é GTIN e nunca é fabricado aqui:
 * a P02 só aceita/valida um valor informado; ausência mantém a variante em rascunho.
 */
export function normalizeBarcodeInterno(value: unknown): IdentifierResult {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false, message: "Código interno inválido." }
  const v = value.normalize("NFKC").trim().toUpperCase()
  if (!v) return { ok: true, value: null }
  if (v.length > BARCODE_INTERNO_MAX || !/^[!-~]+$/.test(v)) {
    return { ok: false, message: `Código interno: até ${BARCODE_INTERNO_MAX} caracteres ASCII visíveis, sem espaço.` }
  }
  return { ok: true, value: v }
}

/** HEX opcional (#RRGGBB). Cor estampada/multicor pode não ter HEX. */
export function normalizeHex(value: unknown): IdentifierResult {
  if (value === undefined || value === null || value === "") return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false, message: "Cor visual inválida." }
  let v = value.trim().toUpperCase()
  if (/^[0-9A-F]{6}$/.test(v)) v = `#${v}`
  if (!/^#[0-9A-F]{6}$/.test(v)) return { ok: false, message: "Cor visual: use o formato #RRGGBB." }
  return { ok: true, value: v }
}

export type MoneyResult = { ok: true; value: number | null } | { ok: false; message: string }

/** "49,90" | "49.90" → centavos; vazio → null (herda o preço do produto). */
export function parseOptionalMoney(value: unknown, scale: typeof PRICE_SCALE | typeof COST_SCALE, label: string): MoneyResult {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false, message: `${label} inválido.` }
  const raw = value.trim().replace(/^R\$\s*/i, "")
  if (!raw) return { ok: true, value: null }
  // "1.005" é ambíguo em pt-BR (milhar ou decimal?): recusa em vez de adivinhar.
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return { ok: false, message: `${label}: use vírgula para os centavos, ex.: 1.005,00 ou 1,01.` }
  const canonical = /^\d{1,3}(\.\d{3})+,\d+$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".")
  try {
    return { ok: true, value: decimalToUnits(canonical, scale) }
  } catch {
    return { ok: false, message: `${label}: informe um valor não negativo, ex.: 49,90.` }
  }
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type VariantSituacao = "INATIVA" | "RASCUNHO" | "COMPLETA"

/**
 * Situação de CADASTRO (nunca de estoque/venda): completa só com SKU e código interno.
 * Mesmo "COMPLETA", nada é vendável ou movimentável na P02.
 */
export function variantSituacao(v: { ativo: boolean; sku: string | null; barcodeInterno: string | null }): VariantSituacao {
  if (!v.ativo) return "INATIVA"
  return v.sku && v.barcodeInterno ? "COMPLETA" : "RASCUNHO"
}

/** Par cor×tamanho serializado sem ambiguidade (IDs nunca são derivados disso). */
export function comboKey(corId: string, tamanhoId: string): string {
  return JSON.stringify([corId, tamanhoId])
}
