import type { Session } from "next-auth"
import { auth } from "@/auth"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { requireAdmin } from "@/lib/require-admin"
import type { ConfigAuditActor } from "./types"

export function actorFromSession(session: Session): ConfigAuditActor {
  const name = session.user.name?.trim() || session.user.email?.trim() || "utilizador"
  const email = session.user.email?.trim() || null
  const label = email && email !== name ? `${name} (${email})` : name
  return {
    userId: session.user.id,
    userLabel: label,
    userEmail: email,
  }
}

/** Resolve quem alterou: NextAuth admin/gerente ou dono via assinatura válida. */
export async function resolveConfigAuditActor(): Promise<ConfigAuditActor | null> {
  const adminGate = await requireAdmin()
  if (adminGate.ok) {
    return actorFromSession(adminGate.session)
  }

  const session = await auth()
  if (session?.user?.id) {
    return actorFromSession(session)
  }

  const sub = await getVerifiedSubscriptionFromCookies()
  if (sub.ok) {
    return {
      userId: null,
      userLabel: `assinatura:${sub.plano} (${sub.status})`,
      userEmail: null,
    }
  }

  return null
}

export function clientInfoFromRequest(req: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers.get("x-forwarded-for")
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    null
  const ua = req.headers.get("user-agent")
  const userAgent = ua ? ua.slice(0, 500) : null
  return { ip, userAgent }
}
