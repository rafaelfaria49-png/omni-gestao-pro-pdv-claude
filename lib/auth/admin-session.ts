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
import { createHash, randomBytes } from "node:crypto"

/**
 * Liga a revogação por sessão. Desligada (padrão), o comportamento é idêntico ao anterior e
 * nenhuma consulta a `admin_sessions` acontece — o código pode ser publicado antes da migration.
 * Ordem segura: aplicar a migration 20261113120000_admin_session_revocation, depois ligar a flag.
 * Flag ligada SEM a migration = toda requisição autenticada falha fechado (todos deslogados).
 */
export function isSessionRevocationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_SESSION_REVOCATION === "on"
}

/**
 * Mesma validade do JWT do NextAuth (padrão 30 dias, DESLIZANTE: o NextAuth renova o cookie a
 * cada requisição). A sessão desliza junto — no máximo uma escrita por dia por sessão.
 */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const ADMIN_SESSION_EXTEND_AFTER_SECONDS = 24 * 60 * 60
/** Sessões vencidas há mais que isto são apagadas no próximo login do usuário. */
export const ADMIN_SESSION_PURGE_AFTER_SECONDS = 7 * 24 * 60 * 60

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

/** Precisa empurrar o vencimento? (só quando já passou 1 dia desde a última renovação) */
export function shouldExtend(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < (ADMIN_SESSION_MAX_AGE_SECONDS - ADMIN_SESSION_EXTEND_AFTER_SECONDS) * 1000
}

/** Identificador opaco de sessão (não derivável, não sequencial). */
export function newAdminSessionId(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * `sid` de um token emitido antes da revogação existir: derivado do `jti` do próprio token.
 * Requisições paralelas e CÓPIAS desse token caem na MESMA sessão — o logout mata todas.
 */
export function legacyAdminSessionId(jti: string): string {
  return createHash("sha256").update(`legacy:${jti}`, "utf8").digest("base64url")
}

export function isValidSessionIdShape(sid: unknown): sid is string {
  return typeof sid === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(sid)
}

/** Acesso mínimo ao banco que o fluxo usa (permite teste sem Prisma real). */
export interface AdminSessionStore {
  create(data: { id: string; userId: string; expiresAt: Date }): Promise<unknown>
  /** Cria se não existir (nunca altera uma existente — revogada continua revogada). */
  ensure(data: { id: string; userId: string; expiresAt: Date }): Promise<unknown>
  find(id: string): Promise<AdminSessionRow | null>
  extend(id: string, expiresAt: Date): Promise<unknown>
  revoke(id: string, reason: string): Promise<unknown>
  purgeExpired(userId: string, before: Date): Promise<unknown>
}

type SessionData = { id: string; userId: string; expiresAt: Date }
export function prismaAdminSessionStore(prisma: {
  adminSession: {
    create(args: { data: SessionData }): Promise<unknown>
    createMany(args: { data: SessionData[]; skipDuplicates: true }): Promise<unknown>
    findUnique(args: { where: { id: string }; select: { userId: true; revokedAt: true; expiresAt: true } }): Promise<AdminSessionRow | null>
    updateMany(args: { where: { id: string; revokedAt: null }; data: { revokedAt?: Date; revokedReason?: string; expiresAt?: Date } }): Promise<unknown>
    deleteMany(args: { where: { userId: string; expiresAt: { lt: Date } } }): Promise<unknown>
  }
}): AdminSessionStore {
  return {
    create: (data) => prisma.adminSession.create({ data }),
    ensure: (data) => prisma.adminSession.createMany({ data: [data], skipDuplicates: true }),
    find: (id) => prisma.adminSession.findUnique({ where: { id }, select: { userId: true, revokedAt: true, expiresAt: true } }),
    // Só sessões não revogadas deslizam; revogação é idempotente e nunca "desrevoga".
    extend: (id, expiresAt) => prisma.adminSession.updateMany({ where: { id, revokedAt: null }, data: { expiresAt } }),
    revoke: (id, reason) => prisma.adminSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }),
    purgeExpired: (userId, before) => prisma.adminSession.deleteMany({ where: { userId, expiresAt: { lt: before } } }),
  }
}

/**
 * Garante que o token tenha uma sessão válida.
 * - Login novo (`isSignIn`): cria a sessão (e apaga as vencidas há > 7 dias do usuário).
 * - Token sem `sid` (emitido antes desta mudança): adota a sessão derivada do `jti` — sem
 *   logout em massa no deploy, e cópias do mesmo token compartilham a sessão.
 * - Token com `sid`: só vale se `evaluateAdminSession` aprovar; o vencimento desliza 1×/dia.
 * Erro de banco propaga (o callback falha fechado, como a leitura do usuário já faz).
 */
export async function resolveAdminSession(
  store: AdminSessionStore,
  input: { sid: unknown; jti?: unknown; userId: string; isSignIn: boolean },
  now: Date = new Date(),
): Promise<{ ok: true; sid: string; created: boolean } | { ok: false; reason: string }> {
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000)
  if (input.isSignIn) {
    const sid = newAdminSessionId()
    await store.create({ id: sid, userId: input.userId, expiresAt })
    await store.purgeExpired(input.userId, new Date(now.getTime() - ADMIN_SESSION_PURGE_AFTER_SECONDS * 1000))
    return { ok: true, sid, created: true }
  }
  let sid: string
  let created = false
  if (input.sid === undefined || input.sid === null) {
    if (typeof input.jti !== "string" || input.jti.length < 8) return { ok: false, reason: "legacy_without_jti" }
    sid = legacyAdminSessionId(input.jti)
    await store.ensure({ id: sid, userId: input.userId, expiresAt })
    created = true
  } else {
    if (!isValidSessionIdShape(input.sid)) return { ok: false, reason: "malformed" }
    sid = input.sid
  }
  const row = await store.find(sid)
  const decision = evaluateAdminSession(row, input.userId, now)
  if (!decision.ok) return decision
  if (row && shouldExtend(row.expiresAt, now)) await store.extend(sid, expiresAt)
  return { ok: true, sid, created }
}
