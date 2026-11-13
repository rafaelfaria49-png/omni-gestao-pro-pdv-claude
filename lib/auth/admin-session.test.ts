import { describe, expect, it } from "vitest"
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  evaluateAdminSession,
  isSessionRevocationEnabled,
  isValidSessionIdShape,
  newAdminSessionId,
  resolveAdminSession,
  type AdminSessionRow,
  type AdminSessionStore,
} from "./admin-session"

const NOW = new Date("2026-11-13T12:00:00Z")
const later = (s: number) => new Date(NOW.getTime() + s * 1000)

function memoryStore() {
  const rows = new Map<string, AdminSessionRow & { revokedReason?: string }>()
  const store: AdminSessionStore = {
    async create({ id, userId, expiresAt }) {
      if (rows.has(id)) throw new Error("dup")
      rows.set(id, { userId, expiresAt, revokedAt: null })
    },
    async find(id) {
      return rows.get(id) ?? null
    },
    async revoke(id, reason) {
      const r = rows.get(id)
      if (r && !r.revokedAt) rows.set(id, { ...r, revokedAt: NOW, revokedReason: reason })
    },
  }
  return { rows, store }
}

describe("evaluateAdminSession", () => {
  const ok: AdminSessionRow = { userId: "u1", revokedAt: null, expiresAt: later(60) }
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
    const b = newAdminSessionId()
    expect(a).not.toBe(b)
    expect(isValidSessionIdShape(a)).toBe(true)
    for (const bad of ["", "abc", "x".repeat(200), "a b".repeat(20), 42, null, { id: a }]) expect(isValidSessionIdShape(bad)).toBe(false)
  })
})

describe("resolveAdminSession", () => {
  it("login novo cria sessão com a validade do JWT", async () => {
    const { rows, store } = memoryStore()
    const r = await resolveAdminSession(store, { sid: undefined, userId: "u1", isSignIn: true }, NOW)
    expect(r.ok && r.created).toBe(true)
    if (!r.ok) throw new Error()
    expect(rows.get(r.sid)?.expiresAt.getTime()).toBe(NOW.getTime() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000)
  })

  it("token antigo sem sid ganha sessão (sem logout em massa no deploy)", async () => {
    const { rows, store } = memoryStore()
    const r = await resolveAdminSession(store, { sid: undefined, userId: "u1", isSignIn: false }, NOW)
    expect(r.ok).toBe(true)
    expect(rows.size).toBe(1)
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

  it("sessão expirada não vale mesmo sem revogação", async () => {
    const { store } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    expect(await resolveAdminSession(store, { sid: a.sid, userId: "uA", isSignIn: false }, later(ADMIN_SESSION_MAX_AGE_SECONDS + 1))).toEqual({ ok: false, reason: "expired" })
  })

  it("revogação é idempotente e nunca desfeita", async () => {
    const { rows, store } = memoryStore()
    const a = await resolveAdminSession(store, { sid: undefined, userId: "uA", isSignIn: true }, NOW)
    if (!a.ok) throw new Error()
    await store.revoke(a.sid, "logout")
    await store.revoke(a.sid, "outra")
    expect(rows.get(a.sid)?.revokedReason).toBe("logout")
  })

  it("banco indisponível propaga erro (callback falha fechado)", async () => {
    const store: AdminSessionStore = {
      create: async () => { throw new Error("db down") },
      find: async () => { throw new Error("db down") },
      revoke: async () => { throw new Error("db down") },
    }
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
