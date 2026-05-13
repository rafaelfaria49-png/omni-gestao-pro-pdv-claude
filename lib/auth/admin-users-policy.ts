import type { Session } from "next-auth"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"

export function canAccessAdminUsersApi(session: Session | null): boolean {
  if (!session?.user?.id) return false
  return getPermissionsFromSession(session).admin.configuracoes === true
}

export function assertActorMayAssignRole(actorRole: string | undefined, target: string): void {
  const t = String(target || "").toUpperCase()
  const a = String(actorRole || "").toUpperCase()
  if (t === "SUPER_ADMIN" && a !== "SUPER_ADMIN") {
    throw new Error("Apenas super administrador pode definir este papel.")
  }
  if (t === "ADMIN" && !["SUPER_ADMIN", "ADMIN"].includes(a)) {
    throw new Error("Sem permissão para definir papel de administrador.")
  }
  if (["SUPER_ADMIN", "ADMIN"].includes(t) && a === "GERENTE") {
    throw new Error("Gerentes não podem criar ou promover administradores.")
  }
}

/** Lojas que o ator pode atribuir a outros (restrito = subconjunto da sessão). */
export function normalizeAllowedStoreIdsForActor(
  session: Session,
  requested: string[] | undefined | null,
): string[] {
  const ids = [...new Set((requested ?? []).map((x) => String(x).trim()).filter(Boolean))]
  if (session.user.storeAccess !== "restricted") return ids
  const allowed = new Set(session.user.allowedStoreIds ?? [])
  if (allowed.size === 0) return []
  for (const id of ids) {
    if (!allowed.has(id)) throw new Error("Unidade não permitida para o seu utilizador.")
  }
  return ids
}

export function isElevatedRole(role: string): boolean {
  const r = String(role || "").toUpperCase()
  return r === "SUPER_ADMIN" || r === "ADMIN"
}
