/**
 * Tipos e helpers para `payload` JSONB de títulos financeiros.
 * Extensível: campos específicos de integrações (ex.: OS) podem coexistir com o contrato base.
 */

import type { FinanceiroOrigem } from "./origem"

export type ContaReceberPayload = {
  origem?: FinanceiroOrigem | string
  referencia?: string
  clienteId?: string
  clienteNome?: string
  ordemServicoId?: string
  pedidoId?: string
  /** Integração OS legada — mantida para compatibilidade com adapter existente. */
  ordemNumero?: string
  faturamentoReferencia?: string
  orcamento?: unknown
  parcelas?: unknown
  historico?: unknown[]
  revisoes?: unknown[]
  createdFrom?: string
  metadata?: Record<string, unknown>
  /** Campos livres adicionais (status operacional, revisões, etc.). */
  [key: string]: unknown
}

export type ContaPagarPayload = {
  origem?: FinanceiroOrigem | string
  referencia?: string
  fornecedorId?: string
  fornecedorNome?: string
  numeroDocumento?: string
  parcelas?: unknown
  historico?: unknown[]
  createdFrom?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/**
 * Monta objeto de payload omitindo chaves `undefined` (não grava “buracos” semânticos no JSON).
 */
export function buildContaReceberPayload(input: Partial<ContaReceberPayload>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

export function buildContaPagarPayload(input: Partial<ContaPagarPayload>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

/**
 * Merge profundo raso: objetos aninhados são mesclados; arrays e escalares são substituídos pelo patch.
 */
export function mergeFinanceiroPayload(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!isRecord(base)) return isRecord(patch) ? { ...patch } : {}
  if (!isRecord(patch)) return { ...base }
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const prev = out[k]
    if (isRecord(prev) && isRecord(v)) {
      out[k] = mergeFinanceiroPayload(prev, v)
    } else {
      out[k] = v
    }
  }
  return out
}

export function appendFinanceiroHistorico(
  payload: Record<string, unknown>,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const prev = payload.historico
  const arr: unknown[] = Array.isArray(prev) ? [...prev] : []
  const ts = typeof entry.at === "string" ? entry.at : new Date().toISOString()
  arr.push({ ...entry, at: ts })
  return { ...payload, historico: arr }
}
