/**
 * Resolvedor CENTRAL do direito de uso comercial (SAAS-ADR-02 · arquitetura §4/§6).
 *
 * Função pura e determinística: recebe a loja (só `organizationId`), a assinatura da organização
 * e o instante `agora` (relógio injetado pelo servidor — nunca o do navegador). Sem I/O.
 *
 * Prioridade das regras (primeira que casa vence):
 *   1. `organizationId = NULL`               → pleno · legado (SAAS-ADR-07, sem limite de usuários)
 *   2. organização sem assinatura            → bloqueado · sem_assinatura (ausência não concede acesso)
 *   3. assinatura de outra organização       → bloqueado · inconsistente (isolamento multi-tenant)
 *   4. `agora` inválido                      → bloqueado · inconsistente
 *   5. `suspended`                           → `suspendedMode` (limitado por padrão; bloqueado se pedido)
 *   6. `cortesiaAte > agora`                 → pleno · cortesia (sobrepõe os demais estados)
 *   7. estado da assinatura (tabela abaixo)
 *
 * | status          | condição                         | modo     | motivo             |
 * |-----------------|----------------------------------|----------|--------------------|
 * | trialing        | agora <  trialEndsAt             | pleno    | teste              |
 * | trialing        | agora >= trialEndsAt             | limitado | teste_vencido      |
 * | trial_expired   | —                                | limitado | teste_vencido      |
 * | pending_payment | —                                | limitado | pagamento_pendente |
 * | active          | —                                | pleno    | ok                 |
 * | past_due        | agora <  graceEndsAt             | pleno    | carencia           |
 * | past_due        | agora >= graceEndsAt / sem data  | limitado | inadimplente       |
 * | canceled        | agora <  currentPeriodEnd        | pleno    | cancelado          |
 * | canceled        | agora >= currentPeriodEnd / sem  | limitado | cancelado          |
 * | desconhecido / trialing sem trialEndsAt           | limitado | inconsistente      |
 *
 * Fronteiras são semiabertas: no instante EXATO de `trialEndsAt`/`graceEndsAt`/`currentPeriodEnd`
 * o acesso já é limitado (mesma regra do cron: `now() >= trialEndsAt`).
 *
 * Regra comercial APROVADA pelo proprietário (2026-11-24): suspensão administrativa prevalece sobre
 * cortesia e sobre extensão do teste (ajusta a arquitetura §6.1, que dizia "cortesia sobrepõe
 * qualquer estado").
 *
 * SAAS-001A: o resultado é só OBSERVADO (modo sombra). Nada aqui recusa acesso.
 */

export type ModoAcesso = "pleno" | "limitado" | "bloqueado"

export type MotivoEntitlement =
  | "legado"
  | "ok"
  | "teste"
  | "teste_vencido"
  | "carencia"
  | "inadimplente"
  | "pagamento_pendente"
  | "cancelado"
  | "suspenso"
  | "cortesia"
  | "sem_assinatura"
  | "inconsistente"

export const STATUS_ASSINATURA = [
  "trialing",
  "trial_expired",
  "pending_payment",
  "active",
  "past_due",
  "canceled",
  "suspended",
] as const
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number]

/** Subconjunto da linha `Subscription` que o resolvedor lê. */
export type AssinaturaEntitlementInput = {
  organizationId: string
  planoId: string
  status: string
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  graceEndsAt: Date | null
  suspendedMode: string | null
  limitedSince: Date | null
  limiteUsuariosPorLoja: number
  cortesiaAte: Date | null
}

export type Entitlement = {
  modo: ModoAcesso
  origem: "legado" | "assinatura"
  motivo: MotivoEntitlement
  planoId: string | null
  /** null = sem limite (legado). */
  limiteUsuariosPorLoja: number | null
  /** ISO, para o contador do teste. */
  trialEndsAt: string | null
  /** ISO; instante a partir do qual escrita nova seria recusada. null quando pleno. */
  limitedSince: string | null
}

const iso = (d: Date | null | undefined): string | null =>
  d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null

const valida = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime())

export function resolverEntitlement(
  loja: { organizationId: string | null },
  sub: AssinaturaEntitlementInput | null,
  agora: Date,
): Entitlement {
  if (loja.organizationId === null) {
    return { modo: "pleno", origem: "legado", motivo: "legado", planoId: null, limiteUsuariosPorLoja: null, trialEndsAt: null, limitedSince: null }
  }

  const base = (modo: ModoAcesso, motivo: MotivoEntitlement, limitedSince: Date | null = null): Entitlement => ({
    modo,
    origem: "assinatura",
    motivo,
    planoId: sub?.planoId ?? null,
    limiteUsuariosPorLoja: sub?.limiteUsuariosPorLoja ?? null,
    trialEndsAt: iso(sub?.trialEndsAt),
    limitedSince: modo === "pleno" ? null : iso(limitedSince),
  })

  if (!sub) return { ...base("bloqueado", "sem_assinatura"), limiteUsuariosPorLoja: null }
  if (sub.organizationId !== loja.organizationId) {
    return { modo: "bloqueado", origem: "assinatura", motivo: "inconsistente", planoId: null, limiteUsuariosPorLoja: null, trialEndsAt: null, limitedSince: null }
  }
  if (!valida(agora)) return base("bloqueado", "inconsistente")

  const t = agora.getTime()
  const antes = (d: Date | null) => valida(d) && t < d.getTime()
  const limitadoDesde = (derivado: Date | null) => sub.limitedSince ?? derivado ?? null

  if (sub.status === "suspended") {
    return base(sub.suspendedMode === "bloqueado" ? "bloqueado" : "limitado", "suspenso", limitadoDesde(null))
  }
  if (antes(sub.cortesiaAte)) return base("pleno", "cortesia")

  switch (sub.status) {
    case "trialing":
      if (!valida(sub.trialEndsAt)) return base("limitado", "inconsistente", limitadoDesde(null))
      return antes(sub.trialEndsAt) ? base("pleno", "teste") : base("limitado", "teste_vencido", limitadoDesde(sub.trialEndsAt))
    case "trial_expired":
      return base("limitado", "teste_vencido", limitadoDesde(sub.trialEndsAt))
    case "pending_payment":
      return base("limitado", "pagamento_pendente", limitadoDesde(sub.trialEndsAt))
    case "active":
      return base("pleno", "ok")
    case "past_due":
      return antes(sub.graceEndsAt) ? base("pleno", "carencia") : base("limitado", "inadimplente", limitadoDesde(sub.graceEndsAt))
    case "canceled":
      return antes(sub.currentPeriodEnd) ? base("pleno", "cancelado") : base("limitado", "cancelado", limitadoDesde(sub.currentPeriodEnd))
    default:
      return base("limitado", "inconsistente", limitadoDesde(null))
  }
}

/** Forma compacta gravada no JWT (`token.storeEntitlements[storeId]`). */
export type StoreEntitlementClaim = { modo: ModoAcesso; motivo: MotivoEntitlement; limitedSince?: string }

export function paraClaim(e: Entitlement): StoreEntitlementClaim {
  return e.limitedSince ? { modo: e.modo, motivo: e.motivo, limitedSince: e.limitedSince } : { modo: e.modo, motivo: e.motivo }
}
