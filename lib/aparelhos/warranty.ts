/**
 * Garantias na venda de aparelho (OMNI-APARELHOS-ENDTOEND-001).
 *
 * Modelo jurídico adotado (ver docs/modules/APARELHOS.md — itens marcados
 * REQUER VALIDAÇÃO JURÍDICA):
 * - Garantia LEGAL (CDC art. 26, II): 90 dias para bem durável, inclusive usado vendido
 *   por fornecedor profissional. Contada da ENTREGA EFETIVA (art. 26, §1º); para vício
 *   oculto, do momento em que o defeito ficar evidenciado (art. 26, §3º). Nunca é
 *   reduzida nem substituída.
 * - Garantia CONTRATUAL (CDC art. 50): complementar, conferida por termo escrito.
 *   Adotamos a leitura mais favorável ao consumidor (entendimento do STJ): os prazos
 *   SOMAM — a contratual corre da entrega e a legal corre após o fim da contratual.
 * - Garantia do FABRICANTE: informativa, nunca presumida a partir da data da revenda.
 *
 * Datas são de calendário (America/Sao_Paulo). Contagem pelo CC art. 132: exclui o dia
 * do começo e inclui o do vencimento → fim = entrega + N dias.
 */

export const GARANTIA_LEGAL_DIAS = 90 as const

export const CONTRATUAL_PRESETS_PADRAO = [0, 30, 90, 180, 365] as const

export const CONTRATUAL_MAX_ABSOLUTO_DIAS = 1825

export type GarantiaCalculada = {
  dataEntrega: string // YYYY-MM-DD
  legalDias: number
  contratualDias: number
  contratualFim: string | null
  /** Fim da garantia legal na leitura somada (após a contratual). */
  legalFim: string
  /** Fim de toda a cobertura (contratual + legal). */
  coberturaFim: string
  totalDias: number
}

const TZ = "America/Sao_Paulo"

/** YYYY-MM-DD do instante no fuso da loja (pt-BR). */
export function localDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
  return parts // en-CA já formata YYYY-MM-DD
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Data de calendário persistida como meio-dia UTC (nunca muda de dia por fuso). */
export function dateKeyToDb(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`)
}

export function dbToDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null
  const dt = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

export function formatDateKeyBr(key: string | null | undefined): string {
  if (!key || !isDateKey(key)) return ""
  const [y, m, d] = key.split("-")
  return `${d}/${m}/${y}`
}

export type ContratualValidation =
  | { ok: true; dias: number }
  | { ok: false; code: "CONTRATUAL_INVALIDA" | "CONTRATUAL_ACIMA_DO_LIMITE"; message: string }

export function validateContratualDias(raw: unknown, maxDias: number): ContratualValidation {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, code: "CONTRATUAL_INVALIDA", message: "Prazo contratual deve ser um número inteiro de dias, zero ou maior." }
  }
  const limit = Math.min(Math.max(0, Math.floor(maxDias)), CONTRATUAL_MAX_ABSOLUTO_DIAS)
  if (n > limit) {
    return { ok: false, code: "CONTRATUAL_ACIMA_DO_LIMITE", message: `Prazo contratual acima do limite da loja (${limit} dias).` }
  }
  return { ok: true, dias: n }
}

export function calcularGarantia(dataEntrega: string, contratualDias: number): GarantiaCalculada {
  if (!isDateKey(dataEntrega)) throw new Error("dataEntrega inválida")
  if (!Number.isInteger(contratualDias) || contratualDias < 0) throw new Error("contratualDias inválido")
  const contratualFim = contratualDias > 0 ? addDaysKey(dataEntrega, contratualDias) : null
  const totalDias = contratualDias + GARANTIA_LEGAL_DIAS
  const coberturaFim = addDaysKey(dataEntrega, totalDias)
  return {
    dataEntrega,
    legalDias: GARANTIA_LEGAL_DIAS,
    contratualDias,
    contratualFim,
    legalFim: coberturaFim,
    coberturaFim,
    totalDias,
  }
}

export function rotuloPrazo(dias: number): string {
  if (dias === 0) return "Sem adicional"
  if (dias === 365) return "1 ano"
  if (dias === 730) return "2 anos"
  if (dias % 30 === 0 && dias < 365) {
    const meses = dias / 30
    return meses === 1 ? "30 dias" : meses === 3 ? "90 dias" : `${meses} meses`
  }
  return `${dias} dias`
}

export function normalizePresets(raw: unknown, maxDias: number): number[] {
  const arr = Array.isArray(raw) ? raw : [...CONTRATUAL_PRESETS_PADRAO]
  const out = new Set<number>()
  for (const v of arr) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= maxDias) out.add(v)
  }
  out.add(0)
  return [...out].sort((a, b) => a - b)
}
