import { cookies } from "next/headers"
import { auth } from "@/auth"

const isProduction = process.env.NODE_ENV === "production"

/** Lançada quando não há `session.user.id` em produção. */
export class CreditsUserIdError extends Error {
  readonly code = "auth_required" as const

  constructor(message = "Faça login para continuar.") {
    super(message)
    this.name = "CreditsUserIdError"
  }
}

/**
 * Identificador do titular de `User.credits` / `Usage`.
 *
 * Produção: exclusivamente `session.user.id` (NextAuth / `AdminUser.id`).
 * Desenvolvimento: fallback cookie legado `assistec_admin_session`, depois `mock-admin`.
 */
export async function resolveCreditsUserId(): Promise<string> {
  const session = await auth()
  const sessionId = typeof session?.user?.id === "string" ? session.user.id.trim() : ""
  if (sessionId) return sessionId

  if (isProduction) {
    throw new CreditsUserIdError("Faça login para acessar seus créditos.")
  }

  const cookieStore = await cookies()
  const legacy = cookieStore.get("assistec_admin_session")?.value?.trim()
  if (legacy) return legacy

  return "mock-admin"
}

/** Alias histórico — preferir `resolveCreditsUserId`. */
export async function getUserId(): Promise<string> {
  return resolveCreditsUserId()
}
