import { MODULES } from "./access-policy"
/**
 * Testes-baseline para o gate de loja ativa do proxy.
 *
 * Cobertura: F-03 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 *
 * A funÃ§Ã£o enterpriseStoreCookieRedirect Ã© correta isoladamente â€” ela bloqueia
 * cookie de loja que o usuÃ¡rio nÃ£o tem acesso. O bug estÃ¡ em proxy.ts:132 que lÃª o
 * cookie usando string literal errada (`"assistec_active_store"` com underscores) em vez
 * de importar `ASSISTEC_ACTIVE_STORE_COOKIE`. Resultado: a funÃ§Ã£o abaixo sempre recebe
 * `undefined` em produÃ§Ã£o e retorna `null` â†’ redirect nunca dispara.
 *
 * Estes testes garantem o **contrato isolado** da funÃ§Ã£o. Um teste de integraÃ§Ã£o futuro
 * deverÃ¡ cobrir proxy.ts diretamente (precisa de mock de NextRequest â€” fora do escopo
 * desta sprint de baseline, Ã¡rea protegida).
 *
 * TambÃ©m testamos `enterpriseDashboardRedirect` (matriz de permissÃµes por rota).
 */
import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import {
  enterpriseDashboardRedirect,
  enterpriseStoreCookieRedirect,
} from "./proxy-enterprise-dashboard"

const ORIGIN = "https://omni.test"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
}): Session {
  return {
    user: {
      id: "u1",
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "ADMIN",
      lojaId: "loja-a",
      platformAuthority: (opts.role ?? "ADMIN") === "ADMIN" && opts.storeAccess !== "restricted",
      storeModules: { "loja-a": [...MODULES] },
      storeAccess: opts.storeAccess ?? "all",
      allowedStoreIds: Object.hasOwn(opts, "allowedStoreIds") ? opts.allowedStoreIds : ["loja-a"],
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

describe("enterpriseStoreCookieRedirect â€” bloqueio por cookie de loja ativa", () => {
  it("retorna null quando cookie ausente (undefined)", () => {
    const session = makeSession({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
    })
    const r = enterpriseStoreCookieRedirect(ORIGIN, session, undefined)
    expect(r).toBeNull()
  })

  it("retorna null quando cookie vazio", () => {
    const session = makeSession({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
    })
    expect(enterpriseStoreCookieRedirect(ORIGIN, session, "")).toBeNull()
    expect(enterpriseStoreCookieRedirect(ORIGIN, session, "   ")).toBeNull()
  })

  it("retorna null quando usuÃ¡rio tem acesso 'all' (independente do cookie)", () => {
    const session = makeSession({ storeAccess: "all" })
    expect(enterpriseStoreCookieRedirect(ORIGIN, session, "qualquer-loja")).toBeNull()
  })

  it("retorna null quando cookie aponta para loja permitida", () => {
    const session = makeSession({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a", "loja-b"],
    })
    expect(enterpriseStoreCookieRedirect(ORIGIN, session, "loja-a")).toBeNull()
    expect(enterpriseStoreCookieRedirect(ORIGIN, session, "loja-b")).toBeNull()
  })

  it("redireciona para /dashboard?storeAccess=denied quando cookie aponta para loja proibida", () => {
    const session = makeSession({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
    })
    const r = enterpriseStoreCookieRedirect(ORIGIN, session, "loja-b")
    expect(r).not.toBeNull()
    expect(r!.pathname).toBe("/dashboard")
    expect(r!.searchParams.get("storeAccess")).toBe("denied")
  })
})

describe("enterpriseDashboardRedirect â€” matriz de permissÃµes por rota", () => {
  it("bloqueia /dashboard/ia-mestre para CAIXA (sem permissÃ£o workspace.iaMestre)", () => {
    const session = makeSession({ role: "CAIXA" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/ia-mestre", session)
    expect(r).not.toBeNull()
    expect(r!.pathname).toBe("/dashboard")
    expect(r!.searchParams.get("access")).toBe("denied")
  })

  it("permite /dashboard/ia-mestre para ADMIN", () => {
    const session = makeSession({ role: "ADMIN" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/ia-mestre", session)
    expect(r).toBeNull()
  })

  it("bloqueia rotas legadas /dashboard/clientes para CAIXA (sem cadastros)", () => {
    const session = makeSession({ role: "CAIXA" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/clientes", session)
    expect(r).not.toBeNull()
  })

  it("permite /dashboard/relatorios para VENDEDOR", () => {
    const session = makeSession({ role: "VENDEDOR" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/relatorios", session)
    expect(r).toBeNull()
  })

  it("bloqueia /dashboard/financeiro-v2 para CAIXA (sem financeiro)", () => {
    const session = makeSession({ role: "CAIXA" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/financeiro-v2", session)
    expect(r).not.toBeNull()
  })

  it("bloqueia /dashboard/marketplace para CAIXA (sem marketplace)", () => {
    const session = makeSession({ role: "CAIXA" })
    const r = enterpriseDashboardRedirect(ORIGIN, "/dashboard/marketplace", session)
    expect(r).not.toBeNull()
  })
})


describe("Pessoas: consumidor real da passagem externa para STORE", () => {
  it.each(["/dashboard/pessoas", "/dashboard/pessoas/funcionarios", "/dashboard/pessoas/funcionarios/qa-vinculo", "/dashboard/pessoas/configuracoes"])("nao substitui guards DP por permissoes Enterprise em %s", pathname => {
    const session = makeSession({ role: "OPERADOR", storeAccess: "restricted", allowedStoreIds: ["loja-a", "loja-b"] })
    expect(enterpriseDashboardRedirect(ORIGIN, pathname, session, "loja-a")).toBeNull()
  })
  it.each(["/dashboard/unidades", "/dashboard/plataforma", "/dashboard/master-console", "/dashboard/financeiro", "/dashboard/pessoas-extra"])("preserva negacao de %s para STORE", pathname => {
    const session = makeSession({ role: "OPERADOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    expect(enterpriseDashboardRedirect(ORIGIN, pathname, session, "loja-a")).not.toBeNull()
  })
})
