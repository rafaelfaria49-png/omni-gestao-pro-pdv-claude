import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { getPermissionsFromSession } from "./enterprise-permissions"
import {
  canUseStoreSwitcher,
  countPendingSalesInOpsBlob,
  isStoreSwitchBlockedPath,
  switchableStores,
} from "./store-switcher-policy"

function session(opts: { role?: string; platform?: boolean; stores?: string[]; mustChange?: boolean } = {}): Session {
  const stores = opts.stores ?? ["loja-a", "loja-b"]
  return {
    user: {
      id: "u1",
      email: "u@x.invalid",
      name: "U",
      role: opts.role ?? "ADMIN",
      accessScope: opts.platform ? "PLATFORM" : "STORE",
      lojaId: stores[0],
      platformAuthority: opts.platform === true,
      storeAccess: opts.platform ? "all" : "restricted",
      allowedStoreIds: stores,
      storeModules: Object.fromEntries(stores.map((id) => [id, ["home", "pdv"]])),
      mustChangePassword: opts.mustChange === true,
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as unknown as Session
}

const LOJAS = [{ id: "loja-a" }, { id: "loja-b" }]

describe("canUseStoreSwitcher", () => {
  it("ADMIN e GERENTE de escopo STORE com 2+ lojas autorizadas veem o seletor", () => {
    expect(canUseStoreSwitcher(session({ role: "ADMIN" }), LOJAS)).toBe(true)
    expect(canUseStoreSwitcher(session({ role: "GERENTE" }), LOJAS)).toBe(true)
  })

  it("uma loja só, ou lista com lojas fora da sessão: sem seletor", () => {
    expect(canUseStoreSwitcher(session({ stores: ["loja-a"] }), LOJAS)).toBe(false)
    // Lista do cliente com loja que a sessão não autoriza não conta para o mínimo de 2.
    expect(canUseStoreSwitcher(session({ stores: ["loja-a"] }), [{ id: "loja-a" }, { id: "loja-x" }])).toBe(false)
  })

  it("papéis operacionais não trocam de loja", () => {
    for (const role of ["CAIXA", "TECNICO", "VENDEDOR", "OPERADOR"]) {
      expect(canUseStoreSwitcher(session({ role }), LOJAS)).toBe(false)
    }
  })

  it("plataforma (usa Gestão da Rede), troca de senha pendente e sem sessão: sem seletor", () => {
    expect(canUseStoreSwitcher(session({ platform: true }), LOJAS)).toBe(false)
    expect(canUseStoreSwitcher(session({ mustChange: true }), LOJAS)).toBe(false)
    expect(canUseStoreSwitcher(null, LOJAS)).toBe(false)
  })

  it("liberar o seletor não abre Master Console nem Gestão da Rede", () => {
    const s = session({ role: "ADMIN" })
    expect(canUseStoreSwitcher(s, LOJAS)).toBe(true)
    for (const id of ["loja-a", "loja-b"]) {
      const p = getPermissionsFromSession(s, id)
      expect(p.admin.masterConsole).toBe(false)
      expect(p.admin.unidades).toBe(false)
      expect(p.platformAuthority).toBe(false)
    }
  })
})

describe("switchableStores", () => {
  it("oferece só lojas autorizadas, sem duplicatas nem id vazio, e ignora id forjado", () => {
    const s = session({ stores: ["loja-a", "loja-b"] })
    const out = switchableStores(s, [{ id: "loja-b" }, { id: "loja-x" }, { id: "" }, { id: "loja-a" }, { id: "loja-b" }, { id: "../loja-a" }])
    expect(out.map((l) => l.id)).toEqual(["loja-b", "loja-a"])
  })
})

describe("isStoreSwitchBlockedPath", () => {
  it("bloqueia telas do PDV (carrinho aberto) e libera o resto", () => {
    for (const p of ["/dashboard/pdv", "/dashboard/pdv/", "/dashboard/pdv-next", "/dashboard/vendas", "/dashboard/vendas/mesas", "/dashboard/vendas/venda-completa?x=1"]) {
      expect(isStoreSwitchBlockedPath(p)).toBe(true)
    }
    for (const p of ["/dashboard", "/dashboard/estoque", "/dashboard/vendas-hub", "/dashboard/caixa/historico", "", null]) {
      expect(isStoreSwitchBlockedPath(p)).toBe(false)
    }
  })
})

describe("countPendingSalesInOpsBlob", () => {
  it("conta só vendas com syncPending=true", () => {
    const raw = JSON.stringify({ sales: [{ id: "1", syncPending: true }, { id: "2", syncPending: false }, { id: "3" }, null, { id: "4", syncPending: true }] })
    expect(countPendingSalesInOpsBlob(raw)).toBe(2)
  })
  it("sem blob ou sem vendas: zero; blob ilegível: trata como pendência (pede confirmação)", () => {
    expect(countPendingSalesInOpsBlob(null)).toBe(0)
    expect(countPendingSalesInOpsBlob(JSON.stringify({}))).toBe(0)
    expect(countPendingSalesInOpsBlob("{quebrado")).toBe(1)
  })
})
