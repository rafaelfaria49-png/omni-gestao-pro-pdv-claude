import { lerSaasFlags } from "@/lib/saas/flags"
import { criarAdaptadorRegistro } from "@/lib/saas/email/registro"
import { criarAdaptadorResend } from "@/lib/saas/email/resend"
import type { AdaptadorEmail } from "@/lib/saas/email/tipos"

/**
 * Escolha do adaptador de email (falha FECHADA para envio real).
 *
 * Envio real exige TODOS:
 *   1. `SAAS_EMAIL_ENVIO=on`;
 *   2. `RESEND_API_KEY` (só env da Vercel, nunca `NEXT_PUBLIC_*`, nunca no banco);
 *   3. `SAAS_EMAIL_REMETENTE` (endereço do domínio verificado no Resend com SPF/DKIM/DMARC);
 *   4. `SAAS_EMAIL_DESTINOS_TESTE` — lista de emails/domínios (`@dominio`) de TESTE.
 *
 * Trava do SAAS-001A: mesmo com 1–4, só destinos da lista de teste recebem email real; os
 * demais caem no modo registro. Nenhum cliente recebe email por esta etapa. Remover a trava
 * é decisão do SAAS-005 (réguas), com autorização própria.
 */

type Env = Record<string, string | undefined>

export type ModoEmail = "registro" | "real_restrito"

export type ConfiguracaoEmail = {
  modo: ModoEmail
  motivo: "flag_desligada" | "config_incompleta" | "configurado"
  adaptador: AdaptadorEmail
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export function remetenteValido(valor: string): boolean {
  const m = /^(?:[^<>]*<)?([^<>\s]+)>?$/.exec(valor.trim())
  return Boolean(m && EMAIL.test(m[1]))
}

export function lerDestinosTeste(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => (d.startsWith("@") ? /^@[^\s@]+\.[^\s@]+$/.test(d) : EMAIL.test(d)))
}

export function destinoPermitido(destino: string, lista: readonly string[]): boolean {
  const d = destino.trim().toLowerCase()
  if (!EMAIL.test(d)) return false
  const dominio = d.slice(d.lastIndexOf("@"))
  return lista.some((item) => item === d || (item.startsWith("@") && item === dominio))
}

export function resolverConfiguracaoEmail(env: Env = process.env, deps: { fetchImpl?: Parameters<typeof criarAdaptadorResend>[0]["fetchImpl"] } = {}): ConfiguracaoEmail {
  const registro = criarAdaptadorRegistro()
  if (!lerSaasFlags(env).emailEnvio) return { modo: "registro", motivo: "flag_desligada", adaptador: registro }

  const apiKey = (env.RESEND_API_KEY ?? "").trim()
  const remetente = (env.SAAS_EMAIL_REMETENTE ?? "").trim()
  const destinos = lerDestinosTeste(env.SAAS_EMAIL_DESTINOS_TESTE)
  if (!apiKey || !remetenteValido(remetente) || destinos.length === 0) {
    return { modo: "registro", motivo: "config_incompleta", adaptador: registro }
  }

  const resend = criarAdaptadorResend({ apiKey, remetente, fetchImpl: deps.fetchImpl })
  return {
    modo: "real_restrito",
    motivo: "configurado",
    adaptador: {
      nome: "resend_restrito",
      enviar: (m) => (destinoPermitido(m.para, destinos) ? resend.enviar(m) : registro.enviar(m)),
    },
  }
}
