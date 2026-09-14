import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({
  getSessionEntitlement: h.getSessionEntitlement,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: vi.fn() } },
}))

import {
  CADASTROS_ACTION_ADMIN_FORBIDDEN,
  CADASTROS_ACTION_HUB_FORBIDDEN,
  CADASTROS_ACTION_NO_STORE,
  CADASTROS_ACTION_STORE_FORBIDDEN,
  CADASTROS_ACTION_UNAUTHENTICATED,
  requireCadastrosActionAccess,
  requireCadastrosActionSession,
  requireCadastrosStoreAccess,
} from "@/lib/cadastros/cadastros-action-access"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
}): Session {
  return {
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds ?? ["loja-a"],
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function sessionAtiva(opts?: Parameters<typeof makeSession>[0]) {
  const s = makeSession(opts ?? {})
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue(s)
  return s
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
})

describe("requireCadastrosActionAccess", () => {
  it("sem sessão → rejeita", async () => {
    await expect(requireCadastrosActionAccess("loja-a", "shared")).rejects.toThrow(
      CADASTROS_ACTION_UNAUTHENTICATED,
    )
  })

  it("store vazio → rejeita sem consultar sessão de loja", async () => {
    await expect(requireCadastrosActionAccess("  ", "hub")).rejects.toThrow(CADASTROS_ACTION_NO_STORE)
  })

  it("própria loja shared → ALLOW", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const r = await requireCadastrosActionAccess("loja-a", "shared")
    expect(r.storeId).toBe("loja-a")
  })

  it("outra loja → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(requireCadastrosActionAccess("loja-b", "shared")).rejects.toThrow(
      CADASTROS_ACTION_STORE_FORBIDDEN,
    )
  })

  it("não-admin sem membership → rejeita", async () => {
    sessionAtiva({ role: "GERENTE", storeAccess: "all" })
    await expect(requireCadastrosActionAccess("loja-a", "hub")).rejects.toThrow(
      CADASTROS_ACTION_STORE_FORBIDDEN,
    )
  })

  it("CAIXA hub write → rejeita hubs.cadastros", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(requireCadastrosActionAccess("loja-a", "hub")).rejects.toThrow(
      CADASTROS_ACTION_HUB_FORBIDDEN,
    )
  })

  it("ADMIN global + loja explícita → ALLOW", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const r = await requireCadastrosActionAccess("loja-z", "hub")
    expect(r.storeId).toBe("loja-z")
  })

  it("VENDEDOR não passa no perfil admin", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(requireCadastrosActionAccess("loja-a", "admin")).rejects.toThrow(
      CADASTROS_ACTION_ADMIN_FORBIDDEN,
    )
  })

  it("requireCadastrosStoreAccess é o perfil hub", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(requireCadastrosStoreAccess(" loja-a ")).resolves.toBe("loja-a")
  })
})

describe("requireCadastrosActionSession", () => {
  it("sem sessão → rejeita", async () => {
    await expect(requireCadastrosActionSession("hub")).rejects.toThrow(CADASTROS_ACTION_UNAUTHENTICATED)
  })

  it("restricted devolve storeScope das lojas", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const r = await requireCadastrosActionSession("hub")
    expect(r.storeScope).toEqual(["loja-a"])
  })

  it("ADMIN storeScope=all", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const r = await requireCadastrosActionSession("shared")
    expect(r.storeScope).toBe("all")
  })
})

describe("cadastros.ts — toda action tenant-scoped chama o boundary", () => {
  const TENANT = [
    "getCadastrosDashboardStats",
    "listFornecedores",
    "upsertFornecedor",
    "listCategorias",
    "upsertCategoria",
    "listMarcas",
    "upsertMarca",
    "listCategoriasMarcasUsadasEmProduto",
    "listTecnicos",
    "upsertTecnico",
    "listEquipamentosModelos",
    "upsertEquipamentoModelo",
    "countProdutoImagens",
    "countMarketplaceListings",
    "listClientes",
    "createCliente",
    "updateCliente",
    "listProdutos",
    "getUltimoBatchProdutos",
    "listProdutosPaginado",
    "lookupProdutoPorBarcodeLocal",
    "upsertProduto",
    "getConferenciaLote",
    "aplicarConferenciaLote",
    "deleteProduto",
    "listServicos",
    "upsertServico",
    "resolverCodigoBarras",
  ]
  const SESSION_SCOPED = [
    "listImportacoesAuditoria",
    "listLogsAuditoriaCadastros",
    "listLojasCadastros",
  ]

  const src = readFileSync(resolve(process.cwd(), "app/actions/cadastros.ts"), "utf8")

  it.each(TENANT)("%s autoriza store antes do Prisma", (action) => {
    const start = src.indexOf(`export async function ${action}`)
    expect(start, action).toBeGreaterThanOrEqual(0)
    const bodyStart = src.indexOf("{", start)
    const prismaCall = Math.min(
      ...["prisma.", "withPrismaSafe", "resolverUltimoBatchProdutos", "consultarProdutosSql"].map((n) => {
        const i = src.indexOf(n, bodyStart)
        return i < 0 ? Number.POSITIVE_INFINITY : i
      }),
    )
    const guardA = src.indexOf("requireCadastrosActionAccess(", bodyStart)
    const guardB = src.indexOf("requireCadastrosStoreAccess(", bodyStart)
    const guard = Math.min(guardA < 0 ? Infinity : guardA, guardB < 0 ? Infinity : guardB)
    expect(guard, `${action} deve chamar o guard`).toBeGreaterThan(bodyStart)
    expect(guard, `${action} deve autorizar antes do Prisma`).toBeLessThan(prismaCall)
  })

  it.each(SESSION_SCOPED)("%s exige sessão", (action) => {
    const start = src.indexOf(`export async function ${action}`)
    expect(start, action).toBeGreaterThanOrEqual(0)
    const bodyStart = src.indexOf("{", start)
    const guard = src.indexOf("requireCadastrosActionSession(", bodyStart)
    const prismaCall = src.indexOf("prisma.", bodyStart)
    expect(guard).toBeGreaterThan(bodyStart)
    expect(guard).toBeLessThan(prismaCall)
  })
})
