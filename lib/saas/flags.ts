/**
 * Flags do programa SaaS (OMNI-SAAS-001A). Contrato: valor ausente ou diferente de `on`
 * (após trim, sem diferenciar maiúsculas) = DESLIGADO.
 *
 * - `SAAS_ENTITLEMENT_ENFORCE`: nesta etapa é só lido e registrado. O enforcement funcional
 *   NÃO existe no SAAS-001A: `enforcementEfetivo` é sempre `false`, mesmo com a flag `on`.
 *   Só o SAAS-002 (com autorização própria) pode trocar isso.
 * - `SAAS_EMAIL_ENVIO`: liga o adaptador real de email (Resend) — e, ainda assim, só para os
 *   destinos de teste de `SAAS_EMAIL_DESTINOS_TESTE` (ver lib/saas/email/config.ts).
 * - `SAAS_CADASTRO_PUBLICO`: não existe cadastro público no SAAS-001A; reservado ao 001B/006.
 */

type Env = Record<string, string | undefined>

export function flagLigada(valor: string | undefined): boolean {
  return (valor ?? "").trim().toLowerCase() === "on"
}

export type SaasFlags = {
  /** A flag de enforcement foi configurada como `on` (só para observabilidade). */
  readonly entitlementEnforceSolicitado: boolean
  /** Sempre false no SAAS-001A: nenhuma decisão comercial é aplicada à autorização. */
  readonly entitlementEnforceEfetivo: false
  readonly emailEnvio: boolean
  /** Sempre false no SAAS-001A. */
  readonly cadastroPublico: false
}

export function lerSaasFlags(env: Env = process.env): SaasFlags {
  return {
    entitlementEnforceSolicitado: flagLigada(env.SAAS_ENTITLEMENT_ENFORCE),
    entitlementEnforceEfetivo: false,
    emailEnvio: flagLigada(env.SAAS_EMAIL_ENVIO),
    cadastroPublico: false,
  }
}
