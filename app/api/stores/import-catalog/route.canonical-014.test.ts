/**
 * CAD-R2-014 — POST /api/stores/import-catalog via boundaries canônicos.
 *
 * - merge existente: cadastral sem estoque (ledger nunca chamado)
 * - merge novo: createProductTx com estoque inicial
 * - overwrite existente com saldo diferente: cadastral + ajuste via ledger
 * - overwrite existente com saldo igual: cadastral, sem ledger (no-op honesto)
 * - sem SKU: ignorado
 * - loja não autorizada: 403 fail-closed
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(async (): Promise<unknown> => ({ ok: false as const, res: new Response("x", { status: 401 }) })),
  storeFindUnique: vi.fn(async (): Promise<unknown> => ({ id: "x" })),
  catsFindMany: vi.fn(async (): Promise<unknown[]> => []),
  prodsFindMany: vi.fn(async (): Promise<unknown[]> => []),
  catUpsert: vi.fn(async () => ({})),
  destFindFirst: vi.fn(async (): Promise<unknown> => null),
  createProductTx: vi.fn(async () => ({ ok: true, id: "novo-1", operacao: "create" })),
  updateProductTx: vi.fn(async () => ({ ok: true, id: "exist-1", operacao: "update" })),
  applyStockMutationTx: vi.fn(async () => ({ ok: true, idempotente: false })),
}))

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: { findUnique: h.storeFindUnique },
    categoriaProduto: { findMany: h.catsFindMany },
    produto: { findMany: h.prodsFindMany },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ categoriaProduto: { upsert: h.catUpsert }, produto: { findFirst: h.destFindFirst } }),
  },
}))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  PRODUCT_WRITE_AUDIT_SOURCE: "product-write-service",
  createProductTx: h.createProductTx,
  updateProductTx: h.updateProductTx,
}))
vi.mock("@/lib/estoque/stock-ledger-service", () => ({
  applyStockMutationTx: h.applyStockMutationTx,
}))
vi.mock("@/lib/estoque/stock-ledger-contract", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  return { ...mod }
})

import { POST } from "./route"

function adminSession(): Session {
  return {
    user: {
      id: "admin-1",
      email: "a@x.com",
      name: "Admin",
      role: "ADMIN",
      storeAccess: "all",
      allowedStoreIds: [],
      lojaId: "loja-a",
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function req(body: unknown) {
  return new Request("https://app.local/api/stores/import-catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function gateAdmin(session: Session = adminSession()) {
  h.requireAdmin.mockResolvedValue({
    ok: true as const,
    admin: { id: "admin-1", name: "Admin", role: "ADMIN" },
    session,
  })
}

beforeEach(() => {
  h.requireAdmin.mockReset()
  h.storeFindUnique.mockReset()
  h.catsFindMany.mockReset()
  h.prodsFindMany.mockReset()
  h.catUpsert.mockReset()
  h.destFindFirst.mockReset()
  h.createProductTx.mockReset()
  h.updateProductTx.mockReset()
  h.applyStockMutationTx.mockReset()
  gateAdmin()
  h.storeFindUnique.mockResolvedValue({ id: "x" })
  h.catsFindMany.mockResolvedValue([])
  h.prodsFindMany.mockResolvedValue([])
  h.destFindFirst.mockResolvedValue(null)
  h.createProductTx.mockResolvedValue({ ok: true, id: "novo-1", operacao: "create" } as never)
  h.updateProductTx.mockResolvedValue({ ok: true, id: "exist-1", operacao: "update" } as never)
  h.applyStockMutationTx.mockResolvedValue({ ok: true, idempotente: false } as never)
})

const SRC = (over: Record<string, unknown> = {}) => ({
  sku: "SKU-1",
  name: "P1",
  stock: 10,
  precoCusto: 5,
  price: 20,
  category: "Cat",
  ...over,
})

describe("POST /api/stores/import-catalog — canonical", () => {
  it("merge existente: cadastral sem ledger (estoque preservado)", async () => {
    h.prodsFindMany.mockResolvedValue([SRC({ stock: 10 })])
    h.destFindFirst.mockResolvedValue({ id: "dest-1", stock: 3 })
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "merge" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { produtosAtualizados: number; produtosCriados: number }
    expect(body.produtosAtualizados).toBe(1)
    expect(body.produtosCriados).toBe(0)
    expect(h.updateProductTx).toHaveBeenCalledTimes(1)
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
    const [, , , input] = h.updateProductTx.mock.calls[0] as unknown as [unknown, unknown, string, Record<string, unknown>]
    expect("estoque" in input).toBe(false)
    expect("stock" in input).toBe(false)
  })

  it("merge novo: cria com estoque inicial via Tx", async () => {
    h.prodsFindMany.mockResolvedValue([SRC({ stock: 6 })])
    h.destFindFirst.mockResolvedValue(null)
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "merge" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { produtosCriados: number }
    expect(body.produtosCriados).toBe(1)
    expect(h.createProductTx).toHaveBeenCalledTimes(1)
    const [, , input] = h.createProductTx.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(input.estoque).toBe(6)
  })

  it("overwrite com saldo diferente: cadastral + ajuste via ledger", async () => {
    h.prodsFindMany.mockResolvedValue([SRC({ stock: 12 })])
    h.destFindFirst.mockResolvedValue({ id: "dest-1", stock: 3 })
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "overwrite" }))
    expect(res.status).toBe(200)
    expect(h.updateProductTx).toHaveBeenCalledTimes(1)
    expect(h.applyStockMutationTx).toHaveBeenCalledTimes(1)
    const [, , cmd] = h.applyStockMutationTx.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(cmd.kind).toBe("ajuste")
    expect(cmd.novoSaldo).toBe(12)
    expect(cmd.origem).toBe("importacao")
  })

  it("overwrite com saldo igual: cadastral sem ledger (no-op)", async () => {
    h.prodsFindMany.mockResolvedValue([SRC({ stock: 8 })])
    h.destFindFirst.mockResolvedValue({ id: "dest-1", stock: 8 })
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "overwrite" }))
    expect(res.status).toBe(200)
    expect(h.updateProductTx).toHaveBeenCalledTimes(1)
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })

  it("produto sem SKU é ignorado", async () => {
    h.prodsFindMany.mockResolvedValue([SRC({ sku: "  " })])
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "merge" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { produtosIgnoradosSemSku: number }
    expect(body.produtosIgnoradosSemSku).toBe(1)
    expect(h.createProductTx).not.toHaveBeenCalled()
    expect(h.updateProductTx).not.toHaveBeenCalled()
  })

  it("loja destino não autorizada → 403 fail-closed", async () => {
    // VENDEDOR restrito à loja-a: mesmo com requireAdmin mockado como ok, a
    // camada canAuthorizeCadastrosStore barra a loja-b (fail-closed).
    // ADMIN real tem acesso global por definição (não é bypass).
    const session = {
      user: {
        id: "u1",
        email: "u@x.com",
        name: "U",
        role: "VENDEDOR",
        storeAccess: "restricted",
        allowedStoreIds: ["loja-a"],
        lojaId: "loja-a",
      },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    } as unknown as Session
    gateAdmin(session)
    const res = await POST(req({ fromStoreId: "loja-a", toStoreId: "loja-b", mode: "merge" }))
    expect(res.status).toBe(403)
    expect(h.createProductTx).not.toHaveBeenCalled()
    expect(h.updateProductTx).not.toHaveBeenCalled()
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })
})
