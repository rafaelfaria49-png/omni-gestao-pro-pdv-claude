import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import {
  cadastrosStoreScope,
  canAuthorizeCadastrosStore,
  canSeeCadastrosStoreRecord,
  hasCadastrosHub,
  isCadastrosAdminPrincipal,
} from "@/lib/cadastros/cadastros-api-access"

function session(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
  id?: string | null
}): Session {
  return {
    user: {
      id: opts.id === undefined ? "user-1" : (opts.id as string),
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

describe("canAuthorizeCadastrosStore — fail-closed Cadastros REST", () => {
  it("nega sem sessão ou sem user.id", () => {
    expect(canAuthorizeCadastrosStore(null, "loja-a")).toBe(false)
    expect(canAuthorizeCadastrosStore(session({ id: "" }), "loja-a")).toBe(false)
  })

  it("nega storeId vazio — nunca default-allow", () => {
    const s = session({ role: "ADMIN", storeAccess: "all" })
    expect(canAuthorizeCadastrosStore(s, null)).toBe(false)
    expect(canAuthorizeCadastrosStore(s, "")).toBe(false)
    expect(canAuthorizeCadastrosStore(s, "   ")).toBe(false)
  })

  it("ADMIN/SUPER_ADMIN com loja explícita: permite qualquer storeId (global atual)", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
      const s = session({ role, storeAccess: "all" })
      expect(canAuthorizeCadastrosStore(s, "loja-a")).toBe(true)
      expect(canAuthorizeCadastrosStore(s, "loja-z")).toBe(true)
    }
  })

  it("não-admin restricted: só allowedStoreIds", () => {
    const s = session({
      role: "VENDEDOR",
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
    })
    expect(canAuthorizeCadastrosStore(s, "loja-a")).toBe(true)
    expect(canAuthorizeCadastrosStore(s, "loja-b")).toBe(false)
  })

  it("não-admin sem membership (storeAccess=all) NÃO ganha global", () => {
    const s = session({ role: "GERENTE", storeAccess: "all" })
    expect(canAuthorizeCadastrosStore(s, "loja-a")).toBe(false)
  })

  it("restricted com allowedStoreIds vazio: nega", () => {
    const s = session({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: [] })
    expect(canAuthorizeCadastrosStore(s, "loja-a")).toBe(false)
  })
})

describe("hasCadastrosHub / isCadastrosAdminPrincipal", () => {
  it("CAIXA não tem hubs.cadastros; VENDEDOR/TECNICO/ADMIN têm", () => {
    expect(hasCadastrosHub(session({ role: "CAIXA" }))).toBe(false)
    expect(hasCadastrosHub(session({ role: "VENDEDOR" }))).toBe(true)
    expect(hasCadastrosHub(session({ role: "TECNICO" }))).toBe(true)
    expect(hasCadastrosHub(session({ role: "ADMIN" }))).toBe(true)
    expect(hasCadastrosHub(null)).toBe(false)
  })

  it("cadastrosStoreScope: admin=all, restricted=ids, non-admin all=vazio", () => {
    expect(cadastrosStoreScope(session({ role: "ADMIN", storeAccess: "all" }))).toBe("all")
    expect(
      cadastrosStoreScope(session({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })),
    ).toEqual(["loja-a"])
    expect(cadastrosStoreScope(session({ role: "GERENTE", storeAccess: "all" }))).toEqual([])
    expect(canSeeCadastrosStoreRecord(session({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }), "loja-b")).toBe(false)
    expect(canSeeCadastrosStoreRecord(session({ role: "ADMIN", storeAccess: "all" }), "loja-z")).toBe(true)
  })

  it("somente ADMIN/SUPER_ADMIN são principal admin de Cadastros", () => {
    expect(isCadastrosAdminPrincipal(session({ role: "ADMIN" }))).toBe(true)
    expect(isCadastrosAdminPrincipal(session({ role: "SUPER_ADMIN" }))).toBe(true)
    expect(isCadastrosAdminPrincipal(session({ role: "GERENTE" }))).toBe(false)
    expect(isCadastrosAdminPrincipal(session({ role: "CAIXA" }))).toBe(false)
    expect(isCadastrosAdminPrincipal(null)).toBe(false)
  })
})
