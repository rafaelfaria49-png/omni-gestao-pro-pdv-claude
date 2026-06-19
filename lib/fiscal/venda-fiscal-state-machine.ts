/**
 * Máquina de estados fiscal da venda (GOAL_003 — Venda Fiscal State Machine).
 *
 * Camada PURA e DORMENTE que decide, a partir de `Venda.fiscalStatus`, se uma venda
 * pode ser corrigida/cancelada operacionalmente (e, no futuro, emitida/cancelada
 * fiscalmente). Não emite nada, não toca banco, não conhece provider.
 *
 * Invariante de compatibilidade: enquanto `fiscalEnabled = false` (GOAL_002) toda venda
 * nasce e permanece `NAO_FISCAL` → todos os gates abaixo retornam "liberado", e as rotas
 * `corrigir*`/`cancelar` se comportam EXATAMENTE como antes. Estados fiscais só existirão
 * quando a emissão for ligada (fases futuras).
 *
 * Regras (resumo do blueprint NFCE_ARCHITECTURE §17/§18):
 *   NAO_FISCAL       → tudo como hoje (editar ✓, cancelar operacional ✓)
 *   PENDENTE         → editar ✓, cancelar operacional ✓ (ainda não emitiu)
 *   EMITINDO         → bloqueia edição e cancelamento operacional (XML em trânsito)
 *   AUTORIZADA       → bloqueia edição/cancelamento operacional (só cancelamento FISCAL)
 *   REJEITADA        → editar ✓ (corrigir dados/snapshot e reenviar), cancelar operacional ✓
 *   EM_CONTINGENCIA  → bloqueia alterações críticas (resolver a transmissão antes)
 *   CANCELADA_FISCAL → bloqueia tudo operacional
 *   BLOQUEADA_FISCAL → bloqueia tudo
 */
import { FiscalStatusVenda } from "@/generated/prisma"

const S = FiscalStatusVenda

/** Resultado de gate compatível com o padrão das rotas (early-return de JSON). */
export type FiscalGateResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code: string }

/**
 * Normaliza o status fiscal. Ausente/desconhecido → NAO_FISCAL (fail-open seguro:
 * nunca bloqueia o comportamento atual por falta/ruído de dado).
 */
export function normalizeFiscalStatus(raw: string | null | undefined): FiscalStatusVenda {
  const v = String(raw ?? "").trim().toUpperCase()
  if ((Object.values(S) as string[]).includes(v)) return v as FiscalStatusVenda
  return S.NAO_FISCAL
}

// ── Conjuntos canônicos de permissão por estado ────────────────────────────────
const EDITAVEL = new Set<string>([S.NAO_FISCAL, S.PENDENTE, S.REJEITADA])
const CANCELAVEL_OPERACIONAL = new Set<string>([S.NAO_FISCAL, S.PENDENTE, S.REJEITADA])
/** Estados a partir dos quais (no futuro) é possível emitir/transmitir um documento. */
const EMITIVEL = new Set<string>([S.PENDENTE, S.REJEITADA, S.EM_CONTINGENCIA])
/** Cancelamento FISCAL (evento) só faz sentido sobre nota autorizada. */
const CANCELAVEL_FISCAL = new Set<string>([S.AUTORIZADA])

export function canEditarVendaFiscal(fiscalStatus: string | null | undefined): boolean {
  return EDITAVEL.has(normalizeFiscalStatus(fiscalStatus))
}

export function canCancelarOperacionalmente(fiscalStatus: string | null | undefined): boolean {
  return CANCELAVEL_OPERACIONAL.has(normalizeFiscalStatus(fiscalStatus))
}

export function canEmitirFiscalmente(fiscalStatus: string | null | undefined): boolean {
  return EMITIVEL.has(normalizeFiscalStatus(fiscalStatus))
}

export function canCancelarFiscalmente(fiscalStatus: string | null | undefined): boolean {
  return CANCELAVEL_FISCAL.has(normalizeFiscalStatus(fiscalStatus))
}

// ── Mensagens claras por estado bloqueado ──────────────────────────────────────
const MOTIVO_BLOQUEIO_EDICAO: Partial<Record<FiscalStatusVenda, string>> = {
  [S.EMITINDO]: "Nota fiscal em emissão — aguarde concluir antes de corrigir a venda.",
  [S.AUTORIZADA]: "Nota fiscal autorizada — a venda não pode ser corrigida (use cancelamento/evento fiscal).",
  [S.EM_CONTINGENCIA]: "Nota fiscal em contingência — resolva a transmissão antes de corrigir.",
  [S.CANCELADA_FISCAL]: "Venda com nota fiscal cancelada — correção bloqueada.",
  [S.BLOQUEADA_FISCAL]: "Venda bloqueada fiscalmente — correção indisponível.",
}

const MOTIVO_BLOQUEIO_CANCELAMENTO: Partial<Record<FiscalStatusVenda, string>> = {
  [S.EMITINDO]: "Nota fiscal em emissão — aguarde concluir antes de cancelar a venda.",
  [S.AUTORIZADA]: "Nota fiscal autorizada — use o cancelamento fiscal (evento) em vez do cancelamento operacional.",
  [S.EM_CONTINGENCIA]: "Nota fiscal em contingência — resolva a transmissão antes de cancelar.",
  [S.CANCELADA_FISCAL]: "Venda com nota fiscal já cancelada — cancelamento operacional bloqueado.",
  [S.BLOQUEADA_FISCAL]: "Venda bloqueada fiscalmente — cancelamento indisponível.",
}

/** Entrada mínima — funciona com objetos `Venda` do Prisma e com fixtures de teste. */
export type VendaFiscalLike = { fiscalStatus?: string | null }

/**
 * Verifica se a venda pode ser CORRIGIDA conforme o estado fiscal.
 * Retorna `{ ok: true }` para NAO_FISCAL/PENDENTE/REJEITADA (comportamento atual);
 * `409` com mensagem clara nos estados bloqueados.
 */
export function assertVendaFiscalEditavel(venda: VendaFiscalLike): FiscalGateResult {
  const st = normalizeFiscalStatus(venda?.fiscalStatus)
  if (canEditarVendaFiscal(st)) return { ok: true }
  return {
    ok: false,
    status: 409,
    error: MOTIVO_BLOQUEIO_EDICAO[st] ?? "Venda bloqueada fiscalmente para correção.",
    code: `fiscal_bloqueio_${st.toLowerCase()}`,
  }
}

/**
 * Verifica se a venda pode ser CANCELADA operacionalmente conforme o estado fiscal.
 * Retorna `{ ok: true }` para NAO_FISCAL/PENDENTE/REJEITADA; `409` nos bloqueados.
 */
export function assertVendaFiscalCancelavel(venda: VendaFiscalLike): FiscalGateResult {
  const st = normalizeFiscalStatus(venda?.fiscalStatus)
  if (canCancelarOperacionalmente(st)) return { ok: true }
  return {
    ok: false,
    status: 409,
    error: MOTIVO_BLOQUEIO_CANCELAMENTO[st] ?? "Venda bloqueada fiscalmente para cancelamento.",
    code: `fiscal_bloqueio_${st.toLowerCase()}`,
  }
}
