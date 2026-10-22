import type { Session } from "next-auth"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { isPlatformAuthority, isPlatformSession } from "@/lib/auth/access-policy"

export function canAccessAdminUsersApi(session: Session | null): boolean {
  if (!session?.user?.id) return false
  if (isPlatformSession(session)) return !session.user.mustChangePassword
  return (session.user.allowedStoreIds ?? []).some((sid) => getPermissionsFromSession(session, sid).admin.configuracoes)
}

export function assertActorMayAssignRole(actor: Session, target: string): void {
  const t = String(target || "").toUpperCase()
  if (isPlatformSession(actor)) return
  if (t === "SUPER_ADMIN" || t === "ADMIN" || t === "GERENTE") throw new Error("Sem permissão para promover administradores ou gestores.")
}

/** Lojas que o ator pode atribuir a outros (restrito = subconjunto da sessão). */
export function normalizeAllowedStoreIdsForActor(
  session: Session,
  requested: string[] | undefined | null,
): string[] {
  const ids = [...new Set((requested ?? []).map((x) => String(x).trim()).filter(Boolean))]
  if (isPlatformSession(session)) return ids
  const allowed = new Set(session.user.allowedStoreIds ?? [])
  if (allowed.size === 0) return []
  for (const id of ids) {
    if (!allowed.has(id)) throw new Error("Unidade não permitida para o seu utilizador.")
  }
  return ids
}

export function actorMayManageUser(session: Session, target: { id: string; role: string; accessScope: string | null; lojaId: string | null; adminUserStores: { storeId: string }[] }): boolean {
  if (isPlatformSession(session)) return true
  if (target.id === session.user.id || isPlatformAuthority(target)) return false
  const allowed = new Set(session.user.allowedStoreIds ?? [])
  const ids = [...target.adminUserStores.map((s) => s.storeId), ...(target.lojaId ? [target.lojaId] : [])]
  return ids.length > 0 && ids.every((id) => allowed.has(id)) && !["ADMIN", "GERENTE", "SUPER_ADMIN"].includes(target.role)
}

export function isElevatedRole(role: string): boolean {
  const r = String(role || "").toUpperCase()
  return r === "SUPER_ADMIN" || r === "ADMIN"
}
