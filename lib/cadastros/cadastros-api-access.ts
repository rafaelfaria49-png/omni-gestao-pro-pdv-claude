import type { Session } from "next-auth"
import { isElevatedRole } from "@/lib/auth/admin-users-policy"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"

/**
 * Boundary de loja específico de Cadastros REST.
 *
 * Não usa `canAccessStore` (default-allow global). Fail-closed:
 * sem sessão, sem storeId, ou não-admin sem membership explícita → false.
 * ADMIN/SUPER_ADMIN preservam o acesso global atual a uma loja explícita.
 */
export function canAuthorizeCadastrosStore(
  session: Session | null,
  storeId: string | null | undefined,
): boolean {
  if (!session?.user?.id) return false
  const sid = (storeId ?? "").trim()
  if (!sid) return false
  if (isElevatedRole(String(session.user.role ?? ""))) return true
  if (session.user.storeAccess !== "restricted") return false
  const ids = session.user.allowedStoreIds ?? []
  return ids.includes(sid)
}

export function hasCadastrosHub(session: Session | null): boolean {
  if (!session?.user?.id) return false
  return getEnterprisePermissions(session.user.role).hubs.cadastros === true
}

export function isCadastrosAdminPrincipal(session: Session | null): boolean {
  if (!session?.user?.id) return false
  return isElevatedRole(String(session.user.role ?? ""))
}

/** Lojas visíveis para dumps globais (auditoria / lista de lojas). */
export function cadastrosStoreScope(session: Session | null): "all" | string[] {
  if (!session?.user?.id) return []
  if (isCadastrosAdminPrincipal(session)) return "all"
  if (session.user.storeAccess !== "restricted") return []
  return (session.user.allowedStoreIds ?? []).map((id) => id.trim()).filter(Boolean)
}

export function canSeeCadastrosStoreRecord(
  session: Session | null,
  recordStoreId: string | null | undefined,
): boolean {
  const scope = cadastrosStoreScope(session)
  if (scope === "all") return true
  const sid = (recordStoreId ?? "").trim()
  if (!sid) return false
  return scope.includes(sid)
}
