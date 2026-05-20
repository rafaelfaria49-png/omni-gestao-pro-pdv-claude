/**
 * Auditoria — extração de "actor" (usuário + ip) a partir de Session + Request.
 *
 * Helper compartilhado pelas rotas mutantes do financeiro para registrar
 * `AuditoriaFinanceira` com user e IP corretos sem repetir boilerplate.
 *
 * Princípio: nunca lançar — em caso de falha, usa fallback "Operador" e ip null.
 */

import type { Session } from "next-auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import {
  registrarAuditoriaFinanceira,
  type EntidadeAuditoria,
  type AcaoAuditoria,
} from "@/lib/financeiro/services/auditoria-financeira-service"

export type AuditoriaActor = {
  usuarioId?: string
  usuarioNome?: string
  ip?: string
  userAgent?: string
}

/** Extrai usuário (id + nome) da Session NextAuth + IP/User-Agent do Request. */
export function extractAuditoriaActor(session: Session | null, req: Request): AuditoriaActor {
  const usuarioId = session?.user?.id?.trim() || undefined
  const usuarioNome = getOperatorLabelFromSession(session)

  // IP: primeiro tenta x-forwarded-for (proxy), depois x-real-ip
  let ip: string | undefined
  try {
    const xff = req.headers.get("x-forwarded-for")
    if (xff) ip = xff.split(",")[0]?.trim() || undefined
    if (!ip) ip = req.headers.get("x-real-ip")?.trim() || undefined
  } catch {
    /* sem ip */
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 240) || undefined

  return { usuarioId, usuarioNome, ip, userAgent }
}

/**
 * Wrapper conveniente — registra auditoria sem lançar erro caso a sessão
 * esteja ausente ou o write falhe. Pode ser chamado em `void` paralelo.
 */
export async function logAuditoriaFinanceira(params: {
  storeId: string
  entidade: EntidadeAuditoria
  entidadeId?: string
  acao: AcaoAuditoria
  actor: AuditoriaActor
  antes?: unknown
  depois?: unknown
}): Promise<void> {
  await registrarAuditoriaFinanceira({
    storeId: params.storeId,
    entidade: params.entidade,
    entidadeId: params.entidadeId,
    acao: params.acao,
    antes: params.antes,
    depois: params.depois,
    usuarioId: params.actor.usuarioId,
    usuarioNome: params.actor.usuarioNome,
    ip: params.actor.ip,
    userAgent: params.actor.userAgent,
  })
}
