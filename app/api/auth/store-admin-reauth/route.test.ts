/**
 * GOAL PADARIA-STORE-ADMIN-CASH-AUTH-001 — reautenticação da ADMIN STORE.
 *
 * Reais: `requireModuleApi`/`canAccessStore`, rate limit em memória, bcrypt e o token.
 * Mockados: `auth()`, Prisma e `next/headers`. Senhas e hashes são sintéticos.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"

vi.setConfig({ testTimeout: 30_000 })
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import {
  CAIXA_SEGURO_ACTION,
  STORE_ADMIN_REAUTH_COOKIE,
  verifyStoreAdminReauthToken,
} from "@/lib/auth/store-admin-reauth"
import { __resetContadorRateLimitForTests } from "@/lib/contador/auth/rate-limit"

const LOJA_A = "loja-a"
const LOJA_B = "loja-b"
const SESSAO_A = "sessao-a"
const SENHA = "Senha-Sintetica-Da-Admin-42"
const SECRET = "segredo-sintetico-store-admin-route"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  accountFind: vi.fn(async (_args: unknown): Promise<unknown> => null),
  sessaoFind: vi.fn(async (_args: unknown): Promise<unknown> => null),
  auditCreate: vi.fn(async (_args: unknown): Promise<unknown> => ({})),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.accountFind },
    sessaoCaixa: { findFirst: h.sessaoFind },
    logsAuditoria: { create: h.auditCreate },
  },
  prismaEnsureConnected: async () => undefined,
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined }),
}))

import { DELETE, POST } from "./route"

type Role = "ADMIN" | "CAIXA" | "OPERADOR"
function storeSession(id: string, role: Role = "ADMIN", stores = [LOJA_A], sessionVersion = 0) {
  return {
    user: {
      id, name: "Admin Sintética", role, accessScope: "STORE", platformAuthority: false,
      storeAccess: "restricted", allowedStoreIds: stores, sessionVersion,
      storeModules: Object.fromEntries(stores.map((s) => [s, ["pdv", "cash"]])),
    },
  }
}
const legacySession = {
  user: { id: "interno-1", role: "ADMIN", accessScope: null, platformAuthority: true, storeAccess: "all", sessionVersion: 0 },
}

let hashSenha = ""
function account(over: Record<string, unknown> = {}) {
  return {
    password: hashSenha, active: true, mustChangePassword: false, sessionVersion: 0,
    role: "ADMIN", accessScope: "STORE", lojaId: LOJA_A, adminUserStores: [{ storeId: LOJA_A }], ...over,
  }
}

function req(body: unknown, store: string | null = LOJA_A): Request {
  return new Request("http://local/api/auth/store-admin-reauth", {
    method: "POST",
    headers: { "content-type": "application/json", ...(store ? { [ASSISTEC_LOJA_HEADER]: store } : {}) },
    body: JSON.stringify(body),
  })
}
const ok = (password = SENHA, sessaoId = SESSAO_A) => req({ password, sessaoId })

function issuedToken(res: Response): string {
  const m = new RegExp(`${STORE_ADMIN_REAUTH_COOKIE}=([^;]*)`).exec(res.headers.get("set-cookie") ?? "")
  return decodeURIComponent(m?.[1] ?? "")
}

let logSpy: ReturnType<typeof vi.spyOn>
beforeAll(async () => {
  hashSenha = await bcrypt.hash(SENHA, 4)
})
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET)
  vi.stubEnv("PIN_AUTHORIZATION_SECRET", SECRET)
  __resetContadorRateLimitForTests()
  h.auth.mockReset().mockResolvedValue(storeSession("adm-a"))
  h.accountFind.mockReset().mockImplementation(async () => account())
  h.sessaoFind.mockReset().mockImplementation(async (args: unknown) => {
    const where = (args as { where: { id: string; storeId: string; status: string } }).where
    return where.id === SESSAO_A && where.storeId === LOJA_A && where.status === "ABERTA" ? { id: SESSAO_A } : null
  })
  h.auditCreate.mockReset().mockResolvedValue({})
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => {
  logSpy.mockRestore()
  vi.unstubAllEnvs()
})

describe("POST /api/auth/store-admin-reauth", () => {
  it("ADMIN STORE com a própria senha recebe autorização vinculada a ela, à loja e à sessão de caixa", async () => {
    const res = await POST(ok())
    expect(res.status).toBe(200)
    const token = issuedToken(res)
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=strict/i)
    const expected = { userId: "adm-a", storeId: LOJA_A, action: CAIXA_SEGURO_ACTION, resource: SESSAO_A, sessionVersion: 0 }
    expect((await verifyStoreAdminReauthToken(token, SECRET, expected)).ok).toBe(true)
    expect((await verifyStoreAdminReauthToken(token, SECRET, { ...expected, storeId: LOJA_B })).ok).toBe(false)
    expect((await verifyStoreAdminReauthToken(token, SECRET, { ...expected, resource: "sessao-x" })).ok).toBe(false)
    expect(h.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CAIXA_SEGURO_ADMIN_LOJA_AUTORIZADO" }),
    }))
  })

  it("funcionário CAIXA STORE e conta interna legada não recebem a autorização", async () => {
    h.auth.mockResolvedValue(storeSession("caixa-a", "CAIXA"))
    expect((await POST(ok())).status).toBe(403)
    h.auth.mockResolvedValue(legacySession)
    expect((await POST(ok())).status).toBe(403)
    expect(h.accountFind).not.toHaveBeenCalled()
  })

  it("sem sessão: 401 sem consultar conta", async () => {
    h.auth.mockResolvedValue(null)
    expect((await POST(ok())).status).toBe(401)
    expect(h.accountFind).not.toHaveBeenCalled()
  })

  it("isolamento entre lojas: ADMIN da loja A não aprova a loja B nem a sessão de outra loja", async () => {
    expect((await POST(req({ password: SENHA, sessaoId: SESSAO_A }, LOJA_B))).status).toBe(403)
    h.auth.mockResolvedValue(storeSession("adm-a", "ADMIN", [LOJA_A, LOJA_B]))
    h.accountFind.mockImplementation(async () => account({ adminUserStores: [{ storeId: LOJA_A }, { storeId: LOJA_B }] }))
    expect((await POST(req({ password: SENHA, sessaoId: SESSAO_A }, LOJA_B))).status).toBe(409)
  })

  it("vínculo removido no banco recusa mesmo com JWT antigo apontando a loja", async () => {
    h.accountFind.mockImplementation(async () => account({ adminUserStores: [{ storeId: LOJA_B }] }))
    const res = await POST(ok())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "invalid_credentials" })
  })

  it("senha errada, conta inativa, troca pendente e sessão revogada respondem igual (sem enumeração)", async () => {
    const respostas: unknown[] = []
    respostas.push(await (await POST(ok("senha-errada"))).json())
    __resetContadorRateLimitForTests()
    for (const over of [{ active: false }, { mustChangePassword: true }, { sessionVersion: 7 }, { role: "CAIXA" }]) {
      h.accountFind.mockImplementation(async () => account(over))
      const res = await POST(ok())
      expect(res.status).toBe(401)
      expect(res.headers.get("set-cookie") ?? "").not.toContain(STORE_ADMIN_REAUTH_COOKIE)
      respostas.push(await res.json())
    }
    expect(new Set(respostas.map((r) => JSON.stringify(r)))).toEqual(new Set([JSON.stringify({ error: "invalid_credentials" })]))
  })

  it("rate limit por usuário: a 6ª tentativa é bloqueada mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(ok(`errada-${i}`))).status).toBe(401)
    const bloqueada = await POST(ok())
    expect(bloqueada.status).toBe(429)
    expect(bloqueada.headers.get("retry-after")).toBeTruthy()
    h.auth.mockResolvedValue(storeSession("adm-outra"))
    expect((await POST(ok())).status).toBe(200)
  })

  it("rajada paralela não fura o limite: no máximo 5 senhas chegam a ser testadas", async () => {
    const compare = vi.spyOn(bcrypt, "compare")
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => POST(ok(`paralela-${i}`))))
    const status = res.map((r) => r.status)
    expect(status.filter((s) => s === 401).length).toBeLessThanOrEqual(5)
    expect(status.filter((s) => s === 429).length).toBeGreaterThanOrEqual(7)
    expect(compare.mock.calls.length).toBeLessThanOrEqual(5)
    compare.mockRestore()
  })

  it("caixa já fechado ou sessão de caixa inválida não emitem autorização", async () => {
    expect((await POST(ok(SENHA, "sessao-fechada"))).status).toBe(409)
    expect((await POST(req({ password: SENHA }))).status).toBe(400)
    expect((await POST(req({ password: SENHA, sessaoId: "x y" }))).status).toBe(400)
  })

  it("sem segredo do servidor falha fechado", async () => {
    vi.stubEnv("PIN_AUTHORIZATION_SECRET", "")
    vi.stubEnv("AUTH_SECRET", "")
    expect((await POST(ok())).status).toBe(503)
  })

  it("a senha nunca aparece em resposta, log ou auditoria", async () => {
    await POST(ok("senha-errada-unica-123"))
    await POST(ok())
    const tudo = JSON.stringify([logSpy.mock.calls, h.auditCreate.mock.calls])
    expect(tudo).not.toContain("senha-errada-unica-123")
    expect(tudo).not.toContain(SENHA)
    expect(tudo).not.toContain(hashSenha)
  })
})

describe("DELETE /api/auth/store-admin-reauth", () => {
  it("revoga apagando o cookie", async () => {
    const res = await DELETE()
    expect(res.headers.get("set-cookie") ?? "").toMatch(new RegExp(`${STORE_ADMIN_REAUTH_COOKIE}=;.*Max-Age=0`, "i"))
  })
})
