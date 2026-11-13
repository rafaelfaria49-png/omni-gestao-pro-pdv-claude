/**
 * Revogação de sessão no SERVIDOR (por sessão, não por usuário).
 *
 * Cada login cria uma linha em `admin_sessions`; o JWT carrega só o id (`sid`). O callback `jwt`
 * do NextAuth (auth.ts) roda em toda requisição protegida — proxy, páginas, APIs e Server
 * Actions — e recusa o token quando a sessão não existe, foi revogada, expirou ou pertence a
 * outro usuário. O logout revoga só aquela sessão: outros dispositivos e usuários seguem ativos.
 *
 * Com isso, uma resposta atrasada que regrave o cookie depois do logout (corrida #342/#345) ou
 * um token copiado de outro lugar deixam de valer no servidor, sem depender do navegador/app
 * apagar o cookie.
 */
import { randomBytes } from "node:crypto"

/**
 * Liga a revogação por sessão. Desligada (padrão), o comportamento é idêntico ao anterior e
 * nenhuma consulta a `admin_sessions` acontece — o código pode ser publicado antes da migration.
 * Ordem segura: aplicar a migration 20261113120000_admin_session_revocation, depois ligar a flag.
 */
export function isSessionRevocationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_SESSION_REVOCATION === "on"
}

/** Mesma validade do JWT do NextAuth (padrão 30 dias). */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export interface AdminSessionRow {
  userId: string
  revokedAt: Date | null
  expiresAt: Date
}

export type AdminSessionDecision =
  | { ok: true }
  | { ok: false; reason: "missing" | "revoked" | "expired" | "user_mismatch" }

/** Decisão pura: o token com este `sid` ainda vale? */
export function evaluateAdminSession(
  row: AdminSessionRow | null,
  expectedUserId: string,
  now: Date = new Date(),
): AdminSessionDecision {
  if (!row) return { ok: false, reason: "missing" }
  if (row.userId !== expectedUserId) return { ok: false, reason: "user_mismatch" }
  if (row.revokedAt) return { ok: false, reason: "revoked" }
  if (!(row.expiresAt instanceof Date) || Number.isNaN(row.expiresAt.getTime())) return { ok: false, reason: "expired" }
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" }
  return { ok: true }
}

/** Identificador opaco de sessão (não derivável, não sequencial). */
export function newAdminSessionId(): string {
  return randomBytes(32).toString("base64url")
}

export function isValidSessionIdShape(sid: unknown): sid is string {
  return typeof sid === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(sid)
}

/** Acesso mínimo ao banco que o fluxo usa (permite teste sem Prisma real). */
export interface AdminSessionStore {
  create(data: { id: string; userId: string; expiresAt: Date }): Promise<unknown>
  find(id: string): Promise<AdminSessionRow | null>
  revoke(id: string, reason: string): Promise<unknown>
}

export function prismaAdminSessionStore(prisma: {
  adminSession: {
    create(args: { data: { id: string; userId: string; expiresAt: Date } }): Promise<unknown>
    findUnique(args: { where: { id: string }; select: { userId: true; revokedAt: true; expiresAt: true } }): Promise<AdminSessionRow | null>
    updateMany(args: { where: { id: string; revokedAt: null }; data: { revokedAt: Date; revokedReason: string } }): Promise<unknown>
  }
}): AdminSessionStore {
  return {
    create: (data) => prisma.adminSession.create({ data }),
    find: (id) => prisma.adminSession.findUnique({ where: { id }, select: { userId: true, revokedAt: true, expiresAt: true } }),
    // updateMany com revokedAt null: idempotente e nunca "desrevoga".
    revoke: (id, reason) => prisma.adminSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
  }
}

/**
 * Garante que o token tenha uma sessão válida.
 * - Login novo (`isSignIn`): cria a sessão e devolve o `sid`.
 * - Token sem `sid` (emitido antes desta mudança): cria a sessão na primeira requisição —
 *   ninguém é deslogado no deploy, e daí em diante o token passa a ser revogável.
 * - Token com `sid`: só vale se `evaluateAdminSession` aprovar.
 * Erro de banco propaga (o callback falha fechado, como já acontece com a leitura do usuário).
 */
export async function resolveAdminSession(
  store: AdminSessionStore,
  input: { sid: unknown; userId: string; isSignIn: boolean },
  now: Date = new Date(),
): Promise<{ ok: true; sid: string; created: boolean } | { ok: false; reason: string }> {
  if (input.isSignIn || input.sid === undefined || input.sid === null) {
    const sid = newAdminSessionId()
    await store.create({ id: sid, userId: input.userId, expiresAt: new Date(now.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000) })
    return { ok: true, sid, created: true }
  }
  if (!isValidSessionIdShape(input.sid)) return { ok: false, reason: "malformed" }
  const decision = evaluateAdminSession(await store.find(input.sid), input.userId, now)
  return decision.ok ? { ok: true, sid: input.sid, created: false } : decision
}
