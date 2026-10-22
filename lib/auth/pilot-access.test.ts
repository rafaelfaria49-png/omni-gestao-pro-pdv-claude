import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { BASIC_MODULE_ACCESS, MODULES, isPlatformAuthority, parseModuleAccess, resolveStoreModules } from "./access-policy"
import { canAccessStore, canUseModule, getPermissionsFromSession } from "./enterprise-permissions"
import { canAccessPage, canAccessSettingsSection } from "./page-access"
import { actorMayManageUser, assertActorMayAssignRole, normalizeAllowedStoreIdsForActor } from "./admin-users-policy"
import { newPasswordSchema } from "./password-policy"

function session(role = "ADMIN", extra: Partial<Session["user"]> = {}): Session {
  return { expires: "2099-01-01", user: { id: "actor-a", role, lojaId: "a", storeAccess: "restricted", accessScope: "STORE", platformAuthority: false,
    allowedStoreIds: ["a"], storeModules: { a: BASIC_MODULE_ACCESS.modules }, ...extra } }
}

describe("política única de acesso piloto", () => {
  it("mantém autoridade legada persistida sem inferir proprietário por nome/email/loja", () => {
    expect(isPlatformAuthority({ role: "ADMIN", accessScope: null })).toBe(true)
    expect(isPlatformAuthority({ role: "SUPER_ADMIN", accessScope: null })).toBe(true)
    expect(isPlatformAuthority({ role: "ADMIN", accessScope: "STORE" })).toBe(false)
    expect(isPlatformAuthority({ role: "SUPER_ADMIN", accessScope: "STORE" })).toBe(false)
    expect(isPlatformAuthority({ role: "ADMIN" })).toBe(false)
  })
  it("preserva módulos internos completos por autoridade explícita", () => {
    const p = getPermissionsFromSession(session("SUPER_ADMIN", { platformAuthority: true, accessScope: "PLATFORM" }))
    expect(p.workspace).toEqual({ iaMestre: true, omniAgent: true })
    expect(p.admin).toEqual({ masterConsole: true, unidades: true, configuracoes: true })
    expect(canAccessPage(p, "/dashboard/landing-preview")).toBe(true)
  })
  it("ADMIN da loja recebe operações básicas, sem poder global", () => {
    const s = session(), p = getPermissionsFromSession(s, "a")
    for (const m of ["pdv", "sales", "cash", "catalog", "stock", "reports", "settings"] as const) expect(canUseModule(s, m, "a")).toBe(true)
    for (const m of ["ai", "agent", "finance", "fiscal", "service", "deviceCatalog", "marketplace", "whatsapp", "accountant"] as const) expect(canUseModule(s, m, "a")).toBe(false)
    expect(p.admin.masterConsole).toBe(false)
    expect(p.admin.unidades).toBe(false)
    expect(canAccessStore(s, "b")).toBe(false)
    expect(canAccessStore(null, "a")).toBe(false)
    expect(canAccessStore(s, null)).toBe(false)
  })
  it("a política da unidade solicitada não herda a liberação da loja principal", () => {
    const s = session("ADMIN", { allowedStoreIds: ["a", "b"], storeModules: { a: [...MODULES], b: BASIC_MODULE_ACCESS.modules } })
    expect(canUseModule(s, "accountant", "a")).toBe(true)
    expect(canUseModule(s, "accountant", "b")).toBe(false)
  })
  it("caixa e vendedor são interseções do papel com os módulos da loja", () => {
    expect(canUseModule(session("CAIXA"), "catalog", "a")).toBe(false)
    expect(canUseModule(session("CAIXA"), "pdv", "a")).toBe(true)
    expect(canUseModule(session("VENDEDOR"), "settings", "a")).toBe(false)
    expect(canUseModule(session("VENDEDOR"), "sales", "a")).toBe(true)
    expect(canUseModule(session("TECNICO"), "pdv", "a")).toBe(false)
  })
  it("URLs diretas e configurações seguem a mesma decisão sem planos/preferências", () => {
    const p = getPermissionsFromSession(session())
    for (const path of ["/dashboard/ia-mestre", "/dashboard/omni-agent", "/dashboard/operacoes-v3", "/dashboard/catalogo-aparelhos", "/dashboard/finance", "/dashboard/pdv-next", "/dashboard/operacoes-v2", "/dashboard/configuracoes-v2", "/dashboard/master-console"]) expect(canAccessPage(p, path)).toBe(false)
    expect(canAccessPage(p, "/dashboard/vendas")).toBe(true)
    expect(canAccessSettingsSection(p, "fiscal")).toBe(false)
    expect(canAccessSettingsSection(p, "ia")).toBe(false)
    expect(canAccessSettingsSection(p, "geral")).toBe(true)
  })
  it("sem sessão e durante troca obrigatória nada operacional é autorizado", () => {
    expect(canAccessPage(null, "/dashboard/vendas")).toBe(false)
    expect(canUseModule(session("ADMIN", { mustChangePassword: true }), "pdv", "a")).toBe(false)
  })
  it("gestor não promove papéis, atribui B ou administra conta interna/multiloja parcial", () => {
    const s = session("GERENTE")
    expect(() => assertActorMayAssignRole(s, "ADMIN")).toThrow()
    expect(() => assertActorMayAssignRole(s, "SUPER_ADMIN")).toThrow()
    expect(() => normalizeAllowedStoreIdsForActor(s, ["a", "b"])).toThrow()
    const target = { id: "employee", role: "VENDEDOR", accessScope: "STORE", lojaId: "a", adminUserStores: [{ storeId: "a" }] }
    expect(actorMayManageUser(s, target)).toBe(true)
    expect(actorMayManageUser(s, { ...target, adminUserStores: [{ storeId: "a" }, { storeId: "b" }] })).toBe(false)
    expect(actorMayManageUser(s, { ...target, role: "ADMIN", accessScope: null })).toBe(false)
  })
  it("recusa liberação inválida e mantém NULL somente como compatibilidade da migration", () => {
    expect(parseModuleAccess({ version: 1, modules: ["ai", "arbitrary"] })).toBeNull()
    expect(resolveStoreModules({ plan: "DIAMANTE", branch: "assistencia" })).toEqual([])
    expect(resolveStoreModules(null)).toEqual([...MODULES])
  })
  it("valida senha nova forte e não permite truncamento bcrypt em UTF-8", () => {
    expect(newPasswordSchema.safeParse("senha123").success).toBe(false)
    expect(newPasswordSchema.safeParse("SenhaIndividual123!").success).toBe(true)
    expect(newPasswordSchema.safeParse("Aa1" + "á".repeat(36)).success).toBe(false)
  })
})
