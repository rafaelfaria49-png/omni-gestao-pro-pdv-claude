import type { Session } from "next-auth"

/**
 * Identidade canônica de auditoria de Cadastros.
 *
 * Somente dados que já existem no principal autenticado (002/003).
 * O caller não escolhe quem aparece como executor.
 */
export type CadastrosAuditPrincipal = {
  userId: string
  email?: string
  role?: string
  displayLabel: string
}

export type CadastrosAuditLogAdapter = {
  /** Coluna existente `LogsAuditoria.userLabel`. Vazio quando não há principal humano. */
  userLabel: string
  /** Campos aditivos para `metadata` JSON. Não substituem o ator oficial. */
  actorMeta: {
    actor: { userId: string; email?: string; role?: string } | null
    operatorNote?: string
  }
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t || undefined
}

/**
 * Deriva o ator oficial a partir da sessão já validada.
 * Sem `user.id` → `null`. Não inventa "Operador" / "Admin" / "System".
 */
export function cadastrosAuditPrincipalFromSession(
  session: Session | null | undefined,
): CadastrosAuditPrincipal | null {
  const userId = trimOrUndef(session?.user?.id)
  if (!userId) return null
  const email = trimOrUndef(session?.user?.email)
  const name = trimOrUndef(session?.user?.name)
  const role = trimOrUndef(session?.user?.role)
  return {
    userId,
    ...(email ? { email } : {}),
    ...(role ? { role } : {}),
    displayLabel: name || email || userId,
  }
}

/** String persistível do ator oficial. `""` = sem principal humano (não inventar rótulo). */
export function cadastrosAuditActorLabel(principal: CadastrosAuditPrincipal | null): string {
  return principal?.displayLabel ?? ""
}

/**
 * Adapta o principal ao payload já existente de `LogsAuditoria`.
 * `operatorNote` é contexto do caller — nunca autoridade de identidade.
 */
export function cadastrosAuditLogFields(
  principal: CadastrosAuditPrincipal | null,
  opts?: { operatorNote?: string | null },
): CadastrosAuditLogAdapter {
  const operatorNote = trimOrUndef(opts?.operatorNote)?.slice(0, 200)
  return {
    userLabel: cadastrosAuditActorLabel(principal).slice(0, 500),
    actorMeta: {
      actor: principal
        ? {
            userId: principal.userId,
            ...(principal.email ? { email: principal.email } : {}),
            ...(principal.role ? { role: principal.role } : {}),
          }
        : null,
      ...(operatorNote ? { operatorNote } : {}),
    },
  }
}
