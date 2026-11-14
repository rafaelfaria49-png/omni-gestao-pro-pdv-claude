import type { Session } from "next-auth"
import { canAccessStore, canUseModule, getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { isPlatformAuthority, resolveStoreModules } from "@/lib/auth/access-policy"
import { check, type Row, type Sql } from "./db"

export type Principal = { principalId: string; observedSessionVersion: number }
export type Operation = "ISSUE" | "CONFIGURE"

/**
 * Re-derives authority from the database inside the ledger transaction (never from request bodies):
 * active user, password not pending, unchanged sessionVersion, store membership (A01 platform or STORE),
 * store module access and the effective permission for the operation.
 */
export async function authorize(sql: Sql, auth: Principal | null, storeId: string, op: Operation = "ISSUE") {
  check(auth?.principalId, "UNAUTHENTICATED", 401)
  check(typeof storeId === "string" && storeId.trim() === storeId && storeId.length > 0 && storeId.length <= 160, "STORE_REQUIRED", 400)
  const users = await sql.query('SELECT id,role::text,active,"mustChangePassword","accessScope","sessionVersion","lojaId" FROM public.admin_users WHERE id=$1', [auth.principalId])
  check(users.length === 1 && users[0].active && !users[0].mustChangePassword && Number(users[0].sessionVersion) === auth.observedSessionVersion, "SESSION_REVOKED", 401)
  const u = users[0]
  const memberships = await sql.query('SELECT "storeId" FROM public.admin_user_stores WHERE "adminUserId"=$1', [u.id])
  const stores = await sql.query('SELECT id,"moduleAccess",name,cnpj,address FROM public.stores WHERE id=$1', [storeId])
  check(stores.length === 1, "FORBIDDEN", 403)
  const store = stores[0] as Row
  const session = {
    user: { id: u.id, role: u.role, accessScope: u.accessScope, mustChangePassword: u.mustChangePassword,
      platformAuthority: isPlatformAuthority(u), allowedStoreIds: memberships.length ? memberships.map(m => m.storeId) : u.lojaId ? [u.lojaId] : [],
      storeModules: { [storeId]: resolveStoreModules(store.moduleAccess) } },
    expires: new Date(Date.now() + 60000).toISOString(),
  } as unknown as Session
  check(canAccessStore(session, storeId), "FORBIDDEN", 403)
  const permissions = getPermissionsFromSession(session, storeId)
  const allowed = op === "CONFIGURE"
    ? canUseModule(session, "settings", storeId) && permissions.admin.configuracoes
    : (canUseModule(session, "sales", storeId) || canUseModule(session, "pdv", storeId)) && permissions.hubs.vendas
  check(allowed, "FORBIDDEN", 403)
  return { principalId: auth.principalId, sessionVersion: Number(u.sessionVersion), store }
}

/** Trusted NextAuth session → principal. The session is the only identity source for browser routes. */
export function principalFromSession(session: Session | null): Principal | null {
  const user = session?.user as { id?: string; sessionVersion?: number } | undefined
  if (!user?.id) return null
  return { principalId: user.id, observedSessionVersion: typeof user.sessionVersion === "number" ? user.sessionVersion : 0 }
}

