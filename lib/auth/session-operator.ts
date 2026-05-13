/**
 * Rótulo de operador a partir da sessão NextAuth (Fase 1 — uso incremental em APIs/server actions).
 * O PDV cliente continua usando `getOrCreatePdvOperatorId` até migração completa.
 */
import type { Session } from "next-auth"

export function getOperatorLabelFromSession(session: Session | null): string {
  const name = session?.user?.name?.trim()
  if (name) return name
  const email = session?.user?.email?.trim()
  if (email) return email.split("@")[0] || email
  return "Operador"
}
