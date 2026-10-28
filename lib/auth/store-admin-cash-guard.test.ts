import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  CAIXA_SEGURO_ACTION,
  createStoreAdminReauthToken,
  STORE_ADMIN_REAUTH_COOKIE,
  STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
} from "./store-admin-reauth"
import { ADMIN_AUTHORIZATION_COOKIE, createPinAuthorizationToken } from "./pin-authorization"

const SECRET = "segredo-sintetico-guard-caixa"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  jar: new Map<string, string>(),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
  }),
}))

import { storeAdminCashApprovalDenied } from "./store-admin-cash-guard"

const store = (id: string, role = "ADMIN", sessionVersion = 0) => ({
  user: { id, role, accessScope: "STORE", platformAuthority: false, sessionVersion },
})
const alvo = { storeId: "loja-a", sessaoId: "sessao-a" }
const emitir = (over: Partial<{ userId: string; storeId: string; resource: string; sessionVersion: number }> = {}, nowMs?: number) =>
  createStoreAdminReauthToken(
    { userId: "adm-a", storeId: "loja-a", action: CAIXA_SEGURO_ACTION, resource: "sessao-a", sessionVersion: 0, ...over },
    SECRET,
    nowMs,
  )

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET)
  vi.stubEnv("PIN_AUTHORIZATION_SECRET", SECRET)
  h.jar.clear()
  h.auth.mockReset().mockResolvedValue(store("adm-a"))
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function status(): Promise<number | null> {
  const res = await storeAdminCashApprovalDenied(alvo)
  return res ? res.status : null
}

describe("proteção do Caixa Seguro no servidor (fechar, sangria, suprimento)", () => {
  it("contas internas legadas seguem como antes; sem sessão NextAuth falha fechado", async () => {
    h.auth.mockResolvedValue({ user: { id: "interno", role: "ADMIN", accessScope: null, platformAuthority: true } })
    expect(await status()).toBeNull()
    h.auth.mockResolvedValue({ user: { id: "op-legado", role: "CAIXA", accessScope: null, platformAuthority: false } })
    expect(await status()).toBeNull()
    h.auth.mockResolvedValue(null)
    expect(await status()).toBe(401)
  })

  it("fechar direto sem aprovação: ADMIN STORE sem cookie é recusada", async () => {
    const res = await storeAdminCashApprovalDenied(alvo)
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ code: "store_admin_reauth_required" })
  })

  it("funcionário CAIXA STORE é recusado mesmo carregando um token válido da administradora", async () => {
    h.jar.set(STORE_ADMIN_REAUTH_COOKIE, await emitir())
    h.auth.mockResolvedValue(store("caixa-a", "CAIXA"))
    const res = await storeAdminCashApprovalDenied(alvo)
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ code: "store_admin_required" })
  })

  it("aprovação da própria ADMIN para esta loja e esta sessão libera", async () => {
    h.jar.set(STORE_ADMIN_REAUTH_COOKIE, await emitir())
    expect(await status()).toBeNull()
  })

  it("aprovação de outra loja, outra sessão de caixa ou outra ADMIN não serve", async () => {
    for (const over of [{ storeId: "loja-b" }, { resource: "sessao-b" }, { userId: "adm-b" }]) {
      h.jar.set(STORE_ADMIN_REAUTH_COOKIE, await emitir(over))
      expect(await status()).toBe(403)
    }
  })

  it("autorização expirada é recusada", async () => {
    h.jar.set(STORE_ADMIN_REAUTH_COOKIE, await emitir({}, Date.now() - (STORE_ADMIN_REAUTH_MAX_AGE_SECONDS + 1) * 1000))
    expect(await status()).toBe(403)
  })

  it("sessão revogada (sessionVersion avançou) mata a autorização", async () => {
    h.jar.set(STORE_ADMIN_REAUTH_COOKIE, await emitir())
    h.auth.mockResolvedValue(store("adm-a", "ADMIN", 1))
    expect(await status()).toBe(403)
  })

  it("o PIN global de supervisor não é credencial alternativa na experiência STORE", async () => {
    const pinToken = await createPinAuthorizationToken(
      { userId: "adm-a", storeId: "loja-a", supervisorId: "sup-1", action: CAIXA_SEGURO_ACTION, resource: "sessao-a" },
      SECRET,
    )
    h.jar.set(ADMIN_AUTHORIZATION_COOKIE, pinToken)
    expect(await status()).toBe(403)
    h.jar.set(STORE_ADMIN_REAUTH_COOKIE, pinToken)
    expect(await status()).toBe(403)
  })
})
