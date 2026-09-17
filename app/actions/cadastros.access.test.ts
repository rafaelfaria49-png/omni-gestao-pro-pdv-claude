/**
 * CAD-R2-003 — Server Actions de Cadastros com o helper REAL.
 * Mock: auth/entitlement + Prisma. Não mocka requireCadastrosActionAccess.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
  produtoFindFirst: vi.fn(async (_args?: unknown) => null),
  produtoFindUnique: vi.fn(async (_args?: unknown) => null),
  logsCreate: vi.fn(async (_args?: unknown) => ({})),
  txRunner: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  produtoFindMany: vi.fn(
    async (): Promise<
      Array<{
        id: string
        name: string
        category: string | null
        price: number
        active: boolean
        sku: string | null
        barcode: string | null
        metadata: unknown
      }>
    > => [],
  ),
  produtoDelete: vi.fn(async () => ({})),
  produtoCreate: vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: "p-1",
    name: args.data.name,
    sku: args.data.sku ?? null,
    barcode: args.data.barcode ?? null,
    stock: args.data.stock ?? 0,
  })),
  produtoUpdate: vi.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({})),
  clienteFindMany: vi.fn(async () => []),
  clienteFindFirst: vi.fn(async () => null),
  clienteCreate: vi.fn(async (args: { data: { storeId: string; name: string } }) => ({ id: "cli-1" })),
  clienteUpdate: vi.fn(async () => ({})),
  storeFindMany: vi.fn(async ({ where }: { where?: { id?: { in?: string[] } } } = {}) => {
    const all = [
      { id: "loja-a", name: "A", cnpj: "111", address: { cidade: "SP" } },
      { id: "loja-b", name: "B", cnpj: "222", address: { cidade: "RJ" } },
    ]
    const ids = where?.id?.in
    return ids ? all.filter((s) => ids.includes(s.id)) : all
  }),
  count: vi.fn(async () => 0),
  groupBy: vi.fn(async () => []),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({
  getSessionEntitlement: h.getSessionEntitlement,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    produto: {
      findFirst: h.produtoFindFirst,
      findUnique: h.produtoFindUnique,
      findMany: h.produtoFindMany,
      delete: h.produtoDelete,
      create: h.produtoCreate,
      update: h.produtoUpdate,
    },
    logsAuditoria: { create: h.logsCreate },
    // CAD-R2-005/006: ProductWriteService persiste via `db.$transaction(tx)`.
    // O tx reutiliza os mesmos fakes para que os asserts de acesso continuem
    // observando as chamadas (sem banco real).
    $transaction: async (fn: (tx: Record<string, unknown>) => unknown) =>
      fn({
        produto: {
          findFirst: h.produtoFindFirst,
          findUnique: h.produtoFindUnique,
          create: h.produtoCreate,
          update: h.produtoUpdate,
        },
        cliente: {
          findMany: h.clienteFindMany,
          findFirst: h.clienteFindFirst,
          create: h.clienteCreate,
          update: h.clienteUpdate,
        },
        logsAuditoria: { create: h.logsCreate },
        $queryRaw: async () => [],
        deposito: { findFirst: async () => null, findUnique: async () => null },
        produtoDeposito: { findMany: async () => [], upsert: async () => ({}) },
        movimentacaoEstoque: { findFirst: async () => null, create: async () => ({ id: "mov-1" }) },
      }),
    cliente: {
      findMany: h.clienteFindMany,
      findFirst: h.clienteFindFirst,
      create: h.clienteCreate,
      update: h.clienteUpdate,
    },
    store: { findMany: h.storeFindMany },
    ordemServico: { groupBy: h.groupBy },
    ordemServicoItem: { count: h.count },
    marketplaceListing: { count: h.count },
    marketplaceProductLink: { count: h.count },
    venda: { groupBy: h.groupBy },
  },
  withPrismaSafe: async (fn: (db: unknown) => unknown, fallback: unknown) => {
    try {
      return await fn({})
    } catch {
      return fallback
    }
  },
}))

import {
  aplicarConferenciaLote,
  createCliente,
  deleteProduto,
  listClientes,
  listLojasCadastros,
  listProdutos,
  updateCliente,
  upsertProduto,
} from "@/app/actions/cadastros"

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
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue(makeSession(opts ?? {}))
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.produtoFindFirst.mockReset()
  h.produtoFindUnique.mockReset()
  h.logsCreate.mockReset()
  h.produtoFindMany.mockReset()
  h.produtoDelete.mockReset()
  h.produtoCreate.mockReset()
  h.produtoUpdate.mockReset()
  h.clienteFindMany.mockReset()
  h.clienteFindFirst.mockReset()
  h.clienteCreate.mockReset()
  h.clienteUpdate.mockReset()
  h.storeFindMany.mockClear()
  h.produtoFindFirst.mockResolvedValue(null)
  h.produtoFindUnique.mockResolvedValue(null)
  h.produtoFindMany.mockResolvedValue([])
  h.clienteFindMany.mockResolvedValue([])
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
})

describe("listClientes / listProdutos — shared", () => {
  it("sem sessão → rejeita e não consulta Prisma", async () => {
    await expect(listClientes("loja-a")).rejects.toThrow("Não autenticado")
    expect(h.clienteFindMany).not.toHaveBeenCalled()
  })

  it("CAIXA própria loja → lista clientes", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await listClientes("loja-a")
    expect(h.clienteFindMany).toHaveBeenCalled()
  })

  it("CAIXA outra loja → rejeita", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(listClientes("loja-b")).rejects.toThrow("Sem permissão para esta unidade")
    expect(h.clienteFindMany).not.toHaveBeenCalled()
  })

  it("CAIXA lista produtos (shared)", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await listProdutos("loja-a")
    expect(h.produtoFindMany).toHaveBeenCalled()
  })
})

describe("createCliente / updateCliente", () => {
  it("OS/PDV: CAIXA cria cliente na própria loja", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const r = await createCliente("loja-a", { nome: "Ana", tipo: "PF" })
    expect(r.id).toBe("cli-1")
    expect(h.clienteCreate).toHaveBeenCalled()
  })

  it("CAIXA não atualiza cliente (hub)", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(updateCliente("loja-a", "cli-1", { nome: "Ana" })).rejects.toThrow(
      "Sem permissão para Cadastros.",
    )
  })

  it("IDOR: loja-A + id da loja-B → não atualiza cliente B", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.clienteFindFirst.mockResolvedValue(null)
    await expect(updateCliente("loja-a", "cli-b", { nome: "Hacked" })).rejects.toThrow("Cliente não encontrado")
    expect(h.clienteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-b", storeId: "loja-a" } }),
    )
    expect(h.clienteUpdate).not.toHaveBeenCalled()
  })
})

describe("deleteProduto / upsertProduto", () => {
  it("sem sessão → não revela existência", async () => {
    const r = await deleteProduto("loja-a", "prod-b")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Não autenticado")
    expect(h.produtoFindFirst).not.toHaveBeenCalled()
  })

  it("CAIXA hub write → rejeitado", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const r = await deleteProduto("loja-a", "prod-1")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Sem permissão para Cadastros.")
    await expect(upsertProduto("loja-a", { nome: "Cabo" })).rejects.toThrow("Sem permissão para Cadastros.")
  })

  it("IDOR: loja-A + id da loja-B → não muta", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.produtoFindFirst.mockResolvedValue(null)
    const r = await deleteProduto("loja-a", "prod-b")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Produto não encontrado nesta loja")
    expect(h.produtoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prod-b", storeId: "loja-a" } }),
    )
    expect(h.produtoDelete).not.toHaveBeenCalled()
  })

  it("IDOR upsert: loja-A + id da loja-B → NOT_FOUND e não atualiza", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.produtoFindFirst.mockResolvedValue(null)
    const r = await upsertProduto("loja-a", { id: "prod-b", nome: "Hacked" })
    expect(r).toEqual({ ok: false, type: "NOT_FOUND", message: "Produto não encontrado." })
    expect(h.produtoFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prod-b", storeId: "loja-a" } }),
    )
    expect(h.produtoUpdate).not.toHaveBeenCalled()
    expect(h.produtoCreate).not.toHaveBeenCalled()
  })

  it("ADMIN global pode upsert em loja explícita", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const r = await upsertProduto("loja-z", { nome: "Cabo" })
    expect(r.ok).toBe(true)
  })
})

describe("aplicarConferenciaLote", () => {
  it("outra loja → rejeita antes do Prisma", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    await expect(
      aplicarConferenciaLote("loja-b", "batch-1", [{ id: "p1", preco: 10 }]),
    ).rejects.toThrow("Sem permissão para esta unidade")
    expect(h.produtoFindMany).not.toHaveBeenCalled()
  })

  it("revisadoPor do caller não vira ator oficial — usa principal da sessão", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.produtoFindMany.mockResolvedValue([
      {
        id: "p1",
        name: "Cabo",
        category: "Acessorios",
        price: 10,
        active: false,
        sku: "SKU1",
        barcode: null,
        metadata: {
          importacao: {
            ultimoLote: {
              batchId: "batch-1",
              origem: "planilha",
              arquivo: "x.xlsx",
              importadoEm: "2026-01-01T00:00:00.000Z",
              acao: "criado",
              matchPor: null,
              fornecedor: null,
              documento: null,
              linhaOrigem: 1,
              statusRevisao: "pendente",
              revisadoEm: null,
              revisadoPor: null,
            },
            historico: [],
          },
        },
      },
    ])
    const r = await aplicarConferenciaLote(
      "loja-a",
      "batch-1",
      [{ id: "p1", revisado: true }],
      { revisadoPor: "Rafael" },
    )
    expect(r.ok).toBe(true)
    expect(h.produtoUpdate).toHaveBeenCalled()
    const updateArg = h.produtoUpdate.mock.calls.at(0)?.[0]
    expect(updateArg).toBeDefined()
    const data = updateArg?.data as {
      metadata: { importacao: { ultimoLote: { revisadoPor: string | null; batchId: string } } }
    }
    expect(data.metadata.importacao.ultimoLote.batchId).toBe("batch-1")
    expect(data.metadata.importacao.ultimoLote.revisadoPor).toBe("U")
    expect(data.metadata.importacao.ultimoLote.revisadoPor).not.toBe("Rafael")
    expect(data.metadata.importacao.ultimoLote.revisadoPor).not.toBe("Conferência de importação")
  })
})

describe("listLojasCadastros", () => {
  it("restricted só vê lojas autorizadas", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const rows = await listLojasCadastros()
    expect(rows.map((r) => r.id)).toEqual(["loja-a"])
    expect(rows.some((r) => r.id === "loja-b")).toBe(false)
  })

  it("não-admin sem membership → rejeita", async () => {
    sessionAtiva({ role: "GERENTE", storeAccess: "all" })
    await expect(listLojasCadastros()).rejects.toThrow("Sem permissão para esta unidade")
  })
})
