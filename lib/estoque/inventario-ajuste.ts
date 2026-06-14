/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 4 (Revisão e ajuste seguro). Núcleo PURO e testável.
 *
 * Toda decisão de "já ajustado / qual novo saldo / qual motivo / é divergente pendente" vive aqui,
 * em funções puras sobre `payload` (JSON) — sem Prisma, sem rede. As Server Actions (F4) apenas
 * orquestram: leem/escrevem estes campos no `payload` e chamam `registrarAjusteEstoque` (motor já
 * existente). NUNCA há ajuste automático nem escrita direta em `Produto.stock` aqui.
 *
 * Anti-duplo-ajuste SEM schema novo (Gate #1 / proibição de migration):
 *  - Divergência (tem `InventarioContagem`): marca em `InventarioContagem.payload`.
 *  - Não bipado (não tem contagem): marca em `InventarioSessao.payload.ajustesNaoBipados[produtoId]`.
 */

export type AjusteContagemInfo = {
  aplicado: boolean
  aplicadoEm: string | null
  movimentacaoId: string | null
  operador: string | null
}

const AJUSTE_VAZIO: AjusteContagemInfo = {
  aplicado: false,
  aplicadoEm: null,
  movimentacaoId: null,
  operador: null,
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** Lê o estado de ajuste gravado no `payload` de uma `InventarioContagem`. PURO. */
export function lerAjusteContagem(payload: unknown): AjusteContagemInfo {
  const p = asRecord(payload)
  if (!p || p.ajusteAplicado !== true) return AJUSTE_VAZIO
  return {
    aplicado: true,
    aplicadoEm: asStringOrNull(p.ajusteAplicadoEm),
    movimentacaoId: asStringOrNull(p.ajusteMovimentacaoId),
    operador: asStringOrNull(p.ajusteOperador),
  }
}

/** Mescla a marca de ajuste no `payload` da contagem (imutável). PURO. */
export function marcarAjusteContagemPayload(
  payloadAtual: unknown,
  dados: { aplicadoEm: string; movimentacaoId: string | null; operador: string | null }
): Record<string, unknown> {
  const base = asRecord(payloadAtual) ? { ...(payloadAtual as Record<string, unknown>) } : {}
  base.ajusteAplicado = true
  base.ajusteAplicadoEm = dados.aplicadoEm
  base.ajusteMovimentacaoId = dados.movimentacaoId
  base.ajusteOperador = dados.operador
  return base
}

export type AjusteNaoBipado = {
  aplicadoEm: string
  movimentacaoId: string | null
  operador: string | null
}

/** Lê o mapa `ajustesNaoBipados` do `payload` da `InventarioSessao`. PURO. */
export function lerAjustesNaoBipados(sessionPayload: unknown): Record<string, AjusteNaoBipado> {
  const p = asRecord(sessionPayload)
  const raw = p ? asRecord(p.ajustesNaoBipados) : null
  if (!raw) return {}
  const out: Record<string, AjusteNaoBipado> = {}
  for (const [k, v] of Object.entries(raw)) {
    const o = asRecord(v)
    if (!o) continue
    out[k] = {
      aplicadoEm: typeof o.aplicadoEm === "string" ? o.aplicadoEm : "",
      movimentacaoId: asStringOrNull(o.movimentacaoId),
      operador: asStringOrNull(o.operador),
    }
  }
  return out
}

/** `true` se o produto não-bipado já foi zerado por ausência nesta sessão. PURO. */
export function naoBipadoAjustado(sessionPayload: unknown, produtoId: string): boolean {
  return Object.prototype.hasOwnProperty.call(lerAjustesNaoBipados(sessionPayload), produtoId)
}

/** Mescla a marca de zeragem por ausência no `payload` da sessão (imutável). PURO. */
export function marcarAjusteNaoBipadoPayload(
  sessionPayload: unknown,
  produtoId: string,
  dados: AjusteNaoBipado
): Record<string, unknown> {
  const base = asRecord(sessionPayload) ? { ...(sessionPayload as Record<string, unknown>) } : {}
  base.ajustesNaoBipados = { ...lerAjustesNaoBipados(sessionPayload), [produtoId]: dados }
  return base
}

/** Novo saldo de uma divergência = quantidade contada (inteiro ≥ 0). PURO. */
export function novoSaldoParaContagem(quantidadeContada: number): number {
  const v = Math.trunc(Number(quantidadeContada))
  return Number.isFinite(v) && v >= 0 ? v : 0
}

/** Novo saldo de "confirmar ausência e zerar" é sempre 0. */
export const NOVO_SALDO_NAO_BIPADO = 0

/** Motivo padrão e auditável do ajuste por inventário. PURO. */
export function montarMotivoInventario(
  sessao: { id: string; nome?: string | null },
  tipo: "divergencia" | "ausencia" = "divergencia"
): string {
  const rotulo = (sessao.nome ?? "").trim() || sessao.id
  return tipo === "ausencia"
    ? `Ausência confirmada no inventário — sessão ${rotulo}`
    : `Inventário físico — sessão ${rotulo}`
}

/** Divergente que ainda precisa de ajuste humano (contado ≠ sistema e não ajustado). PURO. */
export function isDivergentePendente(linha: { diferenca: number; ajusteAplicado?: boolean }): boolean {
  return linha.diferenca !== 0 && linha.ajusteAplicado !== true
}
