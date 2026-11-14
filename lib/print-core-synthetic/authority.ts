import { canAccessStore, canUseModule, getPermissionsFromSession } from "../auth/enterprise-permissions"
import { isPlatformAuthority, resolveStoreModules } from "../auth/access-policy"
import { check, one, type Sql } from "./db"
export type Authority = { principalId: string; observedSessionVersion: number } | null
/** Trusted fixture session context, separate from command input; no public API accepts it. */
export async function authorize(sql: Sql, auth: Authority, storeId: string) {
  check(auth?.principalId, "UNAUTHENTICATED", 401)
  check(typeof storeId === "string" && storeId.trim() === storeId && storeId.length > 0, "STORE_REQUIRED", 400)
  const users = await sql.query('SELECT id,role::text,active,"mustChangePassword","accessScope","sessionVersion","lojaId" FROM public.admin_users WHERE id=$1', [auth.principalId])
  check(users.length === 1 && users[0].active && !users[0].mustChangePassword && users[0].sessionVersion === auth.observedSessionVersion, "SESSION_REVOKED", 401)
  const u = users[0]
  const memberships = await sql.query('SELECT "storeId" FROM public.admin_user_stores WHERE "adminUserId"=$1', [u.id])
  const store = await one(sql, 'SELECT id,"moduleAccess",name,cnpj,address FROM public.stores WHERE id=$1', [storeId])
  const session = {
    user: { id: u.id, role: u.role, accessScope: u.accessScope, mustChangePassword: u.mustChangePassword,
      platformAuthority: isPlatformAuthority(u), allowedStoreIds: memberships.length ? memberships.map(m => m.storeId) : u.lojaId ? [u.lojaId] : [],
      storeModules: { [storeId]: resolveStoreModules(store.moduleAccess) } },
    expires: new Date(Date.now() + 60000).toISOString(),
  } as NonNullable<Parameters<typeof canAccessStore>[0]>
  check(canAccessStore(session, storeId) && (canUseModule(session, "sales", storeId) || canUseModule(session, "pdv", storeId)) && getPermissionsFromSession(session, storeId).hubs.vendas, "FORBIDDEN", 403)
  return { principalId: auth.principalId, sessionVersion: u.sessionVersion as number, store }
}
