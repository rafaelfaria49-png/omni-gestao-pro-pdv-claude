import { describe, expect, it } from "vitest"
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  evaluateAdminSession,
  isSessionRevocationEnabled,
  isValidSessionIdShape,
  legacyAdminSessionId,
  newAdminSessionId,
  resolveAdminSession,
  shouldExtend,
  type AdminSessionRow,
  type AdminSessionStore,
} from "./admin-session"

const NOW = new Date("2026-11-13T12:00:00Z")
const at = (s: number) => new Date(NOW.getTime() + s * 1000)
const DAY = 24 * 60 * 60

function memoryStore() {
  const rows = new Map<string, AdminSessionRow & { revokedReason?: string }>()
  let writes = 0
  const store: AdminSessionStore = {
    async create({ id, userId, expiresAt }) {
      if (rows.has(id)) throw new Error("dup")
      rows.set(id, { userId, expiresAt, revokedAt: null })
      writes++
    },
    async ensure({ id, userId, expiresAt }) {
      if (!rows.has(id)) {
        rows.set(id, { userId, expiresAt, revokedAt: null })
        writes++
      }
    },
    async find(id) {
      return rows.get(id) ?? null
    },
    async extend(id, expiresAt) {
      const r = rows.get(id)
      if (r && !r.revokedAt) {
        rows.set(id, { ...r, expiresAt })
        writes++
      }
    },
    async revoke(id, reason) {
      const r = rows.get(id)
      if (r && !r.revokedAt) rows.set(id, { ...r, revokedAt: NOW, revokedReason: reason })
    },
    async purgeExpired(userId, before) {
      for (const [id, r] of rows) if (r.userId === userId && r.expiresAt < before) rows.delete(id)
    },
  }
  return { rows, store, writes: () => writes }
}

describe("evaluateAdminSession", () => {
  const ok: AdminSessionRow = { userId: "u1", revokedAt: null, expiresAt: at(60) }
  it("aceita sessão viva do mesmo usuário", () => {
    expect(evaluateAdminSession(ok, "u1", NOW)).toEqual({ ok: true })
  })
  it("recusa ausente, revogada, expirada, de outro usuário e data inválida", () => {
    expect(evaluateAdminSession(null, "u1", NOW)).toEqual({ ok: false, reason: "missing" })
    expect(evaluateAdminSession({ ...ok, revokedAt: NOW }, "u1", NOW)).toEqual({ ok: false, reason: "revoked" })
    expect(evaluateAdminSession({ ...ok, expiresAt: NOW }, "u1", NOW)).toEqual({ ok: false, reason: "expired" })
    expect(evaluateAdminSession(ok, "u2", NOW)).toEqual({ ok: false, reason: "user_mismatch" })
    expect(evaluateAdminSession({ ...ok, expiresAt: new Date("x") }, "u1", NOW)).toEqual({ ok: false, reason: "expired" })
  })
})

describe("ids de sessão", () => {
  it("são opacos, únicos e com formato validado", () => {
    const a = newAdminSessionId()
    expect(a).not.toBe(newAdminSessionId())
    expect(isValidSessionIdShape(a)).toBe(true)
    expect(isValidSessionIdShape(legacyAdminSessionId("jti-123456"))).toBe(true)
    for (const bad of ["", "abc", "x".repeat(200), "a b".repeat(20), 42, null, { id: a }]) expect(isValidSessionIdShape(bad)).toBe(false)
  })
  it("sid legado é determinístico pelo jti", () => {
    expect(legacyAdminSessionId("jti-123456")).toBe(legacyAdminSessionId("jti-123456"))
    expect(legacyAdminSessionId("jti-123456")).not.toBe(legacyAdminSessionId("jti-654321"))
  })
})

describe("resolveAdminSession", () => {
  it("login novo cria sessão com a validade do JWT e apaga só as vencidas há mais de 7 dias do usuário", async () => {
    const { rows, store } = memoryStore()
    const velha = "velha-vencida-" + "x".repeat(30)
    const recente = "recente-vencida-" + "x".repeat(30)
    const alheia = "outro-usuario-" + "x".repeat(30)
    rows.set(velha, { userId: "u1", revokedAt: null, expiresAt: at(-8 * DAY) })
    rows.set(recente, { userId: "u1", revokedAt: null, expiresAt: at(-1 * DAY) })
    rows.set(alheia, { userId: "u2", revokedAt: null, expiresAt: at(-30 * DAY) })
    const r = await resolveAdminSession(store, { sid: undefined, userId: "u1", isSignIn: true }, NOW)
    if (!r.ok) throw new Error()
    expect(rows.get(r.sid)?.expiresAt.getTime()).toBe(NOW.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000)
    expect(rows.has(velha)).toBe(false)
    expect(rows.has(recente)).toBe(true)
    expect(rows.has(alheia)).toBe(true)
  })

  it("token antigo sem sid: requisições paralelas e cópias caem na MESMA sessão; logout mata todas", async () => {
    const { rows, store } = memoryStore()
    const rs = await Promise.all([1, 2, 3].map(() => resolveAdminSession(store, { sid: undefined, jti: "jti-original-1", userId: "u1", isSignIn: false }, NOW)))
    const sids = rs.map((r) => (r.ok ? r.sid : "erro"))
    expect(new Set(sids).size).toBe(1)
    expect(rows.size).toBe(1)
    await store.revoke(sids[0], "logout")
    // Cópia do token antigo (mesmo jti) reapresentada depois do logout: recusada.
    expect(await resolveAdminSession(store, { sid: undefined, jti: "jti-original-1", userId: "u1", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "revoked" })
  })

  it("token antigo sem sid e sem jti não é aceito", async () => {
    const { store } = memoryStore()
    expect(await resolveAdminSession(store, { sid: undefined, userId: "u1", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "legacy_without_jti" })
  })

  it("logout revoga só aquela sessão: o mesmo token reapresentado depois é recusado", async () => {
    const { store } = memoryStore()
    const a1 = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    const a2 = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW) // outro dispositivo
    const b = await resolveAdminSession(store, { sid: undefined, userId: "uB", isSignIn: true }, NOW)
    if (!a1.ok || !a2.ok || !b.ok) throw new Error()
    await store.revoke(a1.sid, "logout")
    expect(await resolveAdminSession(store, { sid: a1.sid, userId: "uA", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "revoked" })
    expect((await resolveAdminSession(store, { sid: a2.sid, userId: "uA", isSignIn: false }, NOW)).ok).toBe(true)
    expect((await resolveAdminSession(store, { sid: b.sid, userId: "uB", isSignIn: false }, NOW)).ok).toBe(true)
  })

  it("sid de outro usuário, inventado ou malformado não vale", async () => {
    const { store } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    expect(await resolveAdminSession(store, { sid: a.sid, userId: "uB", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "user_mismatch" })
    expect(await resolveAdminSession(store, { sid: newAdminSessionId(), userId: "uA", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "missing" })
    expect(await resolveAdminSession(store, { sid: "../../etc", userId: "uA", isSignIn: false }, NOW)).toEqual({ ok: false, reason: "malformed" })
  })

  it("validade desliza com o uso (sem derrubar o caixa no 30º dia), no máximo 1 escrita por dia", async () => {
    const { rows, store, writes } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    const w0 = writes()
    for (let h = 1; h < 24; h++) await resolveAdminSession(store, { sid: a.sid, userId: "uA", isSignIn: false }, at(h * 3600))
    expect(writes()).toBe(w0) // no mesmo dia: nenhuma escrita
    for (let d = 1; d <= 45; d++) {
      expect((await resolveAdminSession(store, { sid: a.sid, userId: "uA", isSignIn: false }, at(d * DAY + 60))).ok).toBe(true)
    }
    expect(rows.get(a.sid)!.expiresAt.getTime()).toBeGreaterThan(at(45 * DAY).getTime())
    expect(shouldExtend(at(ADMIN_SESSION_MAX_AGE_SECONDS), NOW)).toBe(false)
    expect(shouldExtend(at(ADMIN_SESSION_MAX_AGE_SECONDS - DAY - 1), NOW)).toBe(true)
  })

  it("sessão sem uso por mais de 30 dias expira", async () => {
    const { store } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    expect(await resolveAdminSession(store, { sid: a.sid, userId: "uA", isSignIn: false }, at(ADMIN_SESSION_MAX_AGE_SECONDS + 1))).toEqual({ ok: false, reason: "expired" })
  })

  it("revogação é idempotente e sessão revogada não desliza", async () => {
    const { rows, store } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    await store.revoke(a.sid, "logout")
    await store.revoke(a.sid, "outra")
    await store.extend(a.sid, at(99 * DAY))
    expect(rows.get(a.sid)?.revokedReason).toBe("logout")
    expect(rows.get(a.sid)!.expiresAt.getTime()).toBe(at(ADMIN_SESSION_MAX_AGE_SECONDS).getTime())
  })

  it("banco indisponível propaga erro (callback falha fechado)", async () => {
    const fail = async () => {
      throw new Error("db down")
    }
    const store: AdminSessionStore = { create: fail, ensure: fail, find: fail, extend: fail, revoke: fail, purgeExpired: fail }
    await expect(resolveAdminSession(store, { sid: newAdminSessionId(), userId: "u", isSignIn: false })).rejects.toThrow("db down")
    await expect(resolveAdminSession(store, { sid: undefined, userId: "u", isSignIn: true })).rejects.toThrow("db down")
  })
})

describe("flag de ativação", () => {
  it("só liga com AUTH_SESSION_REVOCATION=on (padrão desligado = comportamento anterior)", () => {
    expect(isSessionRevocationEnabled({})).toBe(false)
    expect(isSessionRevocationEnabled({ AUTH_SESSION_REVOCATION: "true" })).toBe(false)
    expect(isSessionRevocationEnabled({ AUTH_SESSION_REVOCATION: "on" })).toBe(true)
  })
})
