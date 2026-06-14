/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 5. Classificação operacional da fila de reconciliação. PURO.
 *
 * A reconciliação NÃO cadastra produto nesta fase — apenas CLASSIFICA o código bipado sem
 * cadastro, para o operador organizar o trabalho posterior. O estado vive no `payload` da
 * `InventarioContagem` (sem schema novo), espelhando o padrão da F4 (ajuste).
 */

export const CLASSIFICACAO_RECONCILIACAO = {
  PENDENTE: "pendente",
  LOCALIZADO: "localizado",
  IGNORADO: "ignorado",
  CADASTRAR_DEPOIS: "cadastrar_depois",
} as const

export type ClassificacaoReconciliacao =
  (typeof CLASSIFICACAO_RECONCILIACAO)[keyof typeof CLASSIFICACAO_RECONCILIACAO]

const VALIDAS: ReadonlySet<string> = new Set(Object.values(CLASSIFICACAO_RECONCILIACAO))

/** Valida e normaliza um valor de classificação (default = pendente). PURO. */
export function normalizarClassificacao(value: string | null | undefined): ClassificacaoReconciliacao {
  const v = (value ?? "").trim()
  return (VALIDAS.has(v) ? v : CLASSIFICACAO_RECONCILIACAO.PENDENTE) as ClassificacaoReconciliacao
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Lê a classificação gravada no `payload` da contagem (default = pendente). PURO. */
export function lerClassificacaoReconciliacao(payload: unknown): ClassificacaoReconciliacao {
  const p = asRecord(payload)
  return normalizarClassificacao(p ? (p.reconciliacaoClass as string | undefined) : undefined)
}

/** Mescla a classificação no `payload` da contagem (imutável). PURO. */
export function marcarClassificacaoReconciliacao(
  payloadAtual: unknown,
  classificacao: ClassificacaoReconciliacao,
  meta?: { em?: string; operador?: string | null }
): Record<string, unknown> {
  const base = asRecord(payloadAtual) ? { ...(payloadAtual as Record<string, unknown>) } : {}
  base.reconciliacaoClass = normalizarClassificacao(classificacao)
  base.reconciliacaoClassEm = meta?.em ?? new Date().toISOString()
  if (meta?.operador !== undefined) base.reconciliacaoClassOperador = meta.operador
  return base
}
