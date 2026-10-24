import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { BASIC_MODULE_ACCESS, MODULES, type AccessModule } from "@/lib/auth/access-policy"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { canAccessPage } from "@/lib/auth/page-access"
import { usesClientExperience } from "./client-experience"
import { filterDashboardNav, hubsNavItems } from "./dashboard-nav-items"

/** Sessões sintéticas no formato que auth.ts entrega; a decisão vem do motor real. */
function session(user: {
  role: string
  accessScope: "PLATFORM" | "STORE" | null
  platformAuthority?: boolean
  stores?: Record<string, readonly AccessModule[]>
}): Session {
  const stores = user.stores ?? {}
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: "synthetic-" + user.role, role: user.role, accessScope: user.accessScope,
      platformAuthority: user.platformAuthority === true, mustChangePassword: false,
      allowedStoreIds: Object.keys(stores),
      storeModules: Object.fromEntries(Object.entries(stores).map(([id, m]) => [id, [...m]])),
    },
  } as unknown as Session
}

const owner = session({ role: "ADMIN", accessScope: null, platformAuthority: true })
const legacyCashier = session({ role: "CAIXA", accessScope: null, stores: { legada: MODULES } })
const legacySeller = session({ role: "VENDEDOR", accessScope: null, stores: { legada: MODULES } })
const bakeryAdmin = session({ role: "ADMIN", accessScope: "STORE", stores: { padaria: BASIC_MODULE_ACCESS.modules } })
const bakeryCashier = session({ role: "CAIXA", accessScope: "STORE", stores: { padaria: BASIC_MODULE_ACCESS.modules } })
const assistance = session({ role: "ADMIN", accessScope: "STORE", stores: { assist: [...BASIC_MODULE_ACCESS.modules, "service", "deviceCatalog"] } })

const perms = (s: Session, store?: string) => getPermissionsFromSession(s, store)
const navTargets = (s: Session, store?: string) => filterDashboardNav(hubsNavItems, perms(s, store)).map((i) => i.to)

describe("experiência do cliente é apresentação derivada da liberação, não autoridade", () => {
  it("plataforma e lojas legadas (todos os módulos) mantêm as telas históricas", () => {
    expect(usesClientExperience(perms(owner, "padaria"))).toBe(false)
    expect(usesClientExperience(perms(legacyCashier, "legada"))).toBe(false)
    expect(usesClientExperience(perms(legacySeller, "legada"))).toBe(false)
  })

  it("STORE com pacote explícito recebe a experiência do cliente, inclusive com assistência liberada", () => {
    expect(usesClientExperience(perms(bakeryAdmin, "padaria"))).toBe(true)
    expect(usesClientExperience(perms(bakeryCashier, "padaria"))).toBe(true)
    expect(usesClientExperience(perms(assistance, "assist"))).toBe(true)
  })

  it("sem sessão resolvida não decide (o chamador aguarda em vez de mostrar controles internos)", () => {
    expect(usesClientExperience(null)).toBeNull()
  })

  it("não concede nada: a projeção não altera canAccessPage nem os módulos", () => {
    const p = perms(bakeryAdmin, "padaria")
    expect(canAccessPage(p, "/dashboard/operacoes-v3")).toBe(false)
    expect(canAccessPage(p, "/dashboard/catalogo-aparelhos")).toBe(false)
    expect(canAccessPage(p, "/dashboard/estoque")).toBe(true)
    expect(p.modules?.ai).toBe(false)
  })
})

describe("navegação", () => {
  it("cliente básico ganha Estoque e não vê assistência, IA ou rotas internas", () => {
    const targets = navTargets(bakeryAdmin, "padaria")
    expect(targets).toContain("/dashboard/estoque")
    expect(targets).toContain("/dashboard/estoque/inventario")
    for (const hidden of ["/dashboard/operacoes-v3", "/dashboard/catalogo-aparelhos", "/dashboard/whatsapp", "/dashboard/marketplace", "/dashboard/contador"]) {
      expect(targets).not.toContain(hidden)
    }
  })

  it("navegação do proprietário e de contas internas não recebe a entrada nova", () => {
    expect(navTargets(owner, "padaria")).not.toContain("/dashboard/estoque")
    expect(navTargets(legacySeller, "legada")).not.toContain("/dashboard/estoque")
    // CAIXA sem Cadastros continua sem estoque em qualquer experiência.
    expect(navTargets(legacyCashier, "legada")).not.toContain("/dashboard/estoque/inventario")
    expect(navTargets(bakeryCashier, "padaria")).not.toContain("/dashboard/estoque")
  })

  it("assistência STORE liberada vê Operações e catálogo de aparelhos", () => {
    const targets = navTargets(assistance, "assist")
    expect(targets).toContain("/dashboard/operacoes-v3")
    expect(targets).toContain("/dashboard/catalogo-aparelhos")
  })
})
