import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { JWT } from "next-auth/jwt"

// OMNI-SAAS-001A — o callback jwt real de auth.ts com o entitlement em MODO SOMBRA.
// Prova que nenhuma decisão de autenticação/autorização muda: só o claim novo aparece.
type Captured = { callbacks: { jwt(args: { token: JWT; user?: unknown }): Promise<JWT | null> } }
const h = vi.hoisted(() => ({
  config: null as unknown,
  db: {
    adminUser: { findUnique: vi.fn(), updateMany: vi.fn() },
    store: { findMany: vi.fn() },
    adminSession: { create: vi.fn(), createMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: h.db }))
vi.mock("next-auth", () => ({ default: (config: unknown) => { h.config = config; return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() } } }))
import "../../auth"
import { reiniciarObservabilidadeSombra } from "@/lib/saas/entitlement-sombra"

const jwt = (token: JWT) => (h.config as Captured).callbacks.jwt({ token })
const usuario = (p: Record<string, unknown> = {}) => ({
  id: "u1", name: "Sintético", email: "u1@example.invalid", active: true, sessionVersion: 0, role: "GERENTE",
  accessScope: "STORE", lojaId: "loja-1", mustChangePassword: false, stripeCustomerId: null, stripeSubscriptionId: null,
  adminUserStores: [{ storeId: "loja-1" }, { storeId: "nova" }], ...p,
})
const lojasBase = [
  { id: "loja-1", moduleAccess: null },
  { id: "nova", moduleAccess: { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings"] } },
]
const vencida = [{ id: "nova", organizationId: "org-1", organization: { subscription: {
  organizationId: "org-1", planoId: "vendas-e-estoque", status: "trialing", trialEndsAt: new Date("2020-01-01T00:00:00Z"),
  currentPeriodEnd: null, graceEndsAt: null, suspendedMode: null, limitedSince: null, limiteUsuariosPorLoja: 2, cortesiaAte: null,
} } }]

beforeEach(() => {
  vi.clearAllMocks()
  reiniciarObservabilidadeSombra()
  vi.stubEnv("AUTH_SESSION_REVOCATION", "off")
  vi.spyOn(console, "info").mockImplementation(() => {})
  h.db.adminUser.findUnique.mockResolvedValue(usuario())
  // 1ª chamada = consulta existente de módulos; 2ª = consulta sombra (lojas com organização).
  h.db.store.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => ("organizationId" in args.where ? [] : lojasBase))
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("lojas legadas — comportamento idêntico", () => {
  it("token mantém todos os campos de autorização; lojas legadas não entram no claim (mapa vazio)", async () => {
    const t = await jwt({ sub: "u1", sessionVersion: 0 })
    expect(t).not.toBeNull()
    expect(t).toMatchObject({
      role: "GERENTE", accessScope: "STORE", platformAuthority: false, storeAccess: "restricted", lojaId: "loja-1",
      allowedStoreIdsJson: JSON.stringify(["loja-1", "nova"]), mustChangePassword: false,
      storeEntitlements: {},
    })
    expect(Object.keys(t?.storeModules ?? {})).toEqual(["loja-1", "nova"])
  })
  it("custo: exatamente uma consulta a mais (stores com organização), sem N+1", async () => {
    await jwt({ sub: "u1", sessionVersion: 0 })
    expect(h.db.adminUser.findUnique).toHaveBeenCalledTimes(1)
    expect(h.db.store.findMany).toHaveBeenCalledTimes(2)
    expect(h.db.store.findMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["loja-1", "nova"] } }, select: { id: true, moduleAccess: true } })
  })
})

describe("modo sombra nunca restringe", () => {
  it("teste vencido: token válido, módulos e lojas intactos; decisão só no claim", async () => {
    h.db.store.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => ("organizationId" in args.where ? vencida : lojasBase))
    const t = await jwt({ sub: "u1", sessionVersion: 0 })
    expect(t).not.toBeNull()
    expect(t?.storeModules?.nova).toEqual(["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings"])
    expect(t?.allowedStoreIdsJson).toBe(JSON.stringify(["loja-1", "nova"]))
    expect(t?.storeEntitlements?.nova).toMatchObject({ modo: "limitado", motivo: "teste_vencido" })
  })
  it("mesmo com SAAS_ENTITLEMENT_ENFORCE=on, nada muda", async () => {
    vi.stubEnv("SAAS_ENTITLEMENT_ENFORCE", "on")
    h.db.store.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => ("organizationId" in args.where ? vencida : lojasBase))
    const t = await jwt({ sub: "u1", sessionVersion: 0 })
    expect(t).not.toBeNull()
    expect(t?.storeModules?.nova).toHaveLength(8)
  })
  it("falha da consulta sombra não derruba o login e remove claim antigo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    h.db.store.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("organizationId" in args.where) throw new Error('column "organizationId" does not exist')
      return lojasBase
    })
    const t = await jwt({ sub: "u1", sessionVersion: 0, storeEntitlements: { velho: { modo: "pleno", motivo: "legado" } } })
    expect(t).not.toBeNull()
    expect(t?.role).toBe("GERENTE")
    expect(t?.storeEntitlements).toBeUndefined()
  })
})

describe("autenticação e revogação preservadas", () => {
  it("sessionVersion diferente → sessão revogada (null) e nenhuma consulta comercial", async () => {
    expect(await jwt({ sub: "u1", sessionVersion: 1 })).toBeNull()
    expect(h.db.store.findMany).not.toHaveBeenCalled()
  })
  it("usuário desativado → null", async () => {
    h.db.adminUser.findUnique.mockResolvedValue(usuario({ active: false }))
    expect(await jwt({ sub: "u1", sessionVersion: 0 })).toBeNull()
  })
  it("usuário inexistente → null", async () => {
    h.db.adminUser.findUnique.mockResolvedValue(null)
    expect(await jwt({ sub: "u1", sessionVersion: 0 })).toBeNull()
  })
  it("token sem sub → null", async () => {
    expect(await jwt({})).toBeNull()
  })
  it("troca obrigatória de senha continua propagada", async () => {
    h.db.adminUser.findUnique.mockResolvedValue(usuario({ mustChangePassword: true }))
    expect((await jwt({ sub: "u1", sessionVersion: 0 }))?.mustChangePassword).toBe(true)
  })
  it("plataforma: nenhuma consulta de loja nem claim comercial", async () => {
    h.db.adminUser.findUnique.mockResolvedValue(usuario({ accessScope: "PLATFORM", role: "ADMIN" }))
    const t = await jwt({ sub: "u1", sessionVersion: 0 })
    expect(t?.storeAccess).toBe("all")
    expect(t?.storeEntitlements).toBeUndefined()
    expect(h.db.store.findMany).not.toHaveBeenCalled()
  })
})
