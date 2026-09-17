/**
 * CAD-R2-014 — `createProductTx`: variante composável mínima do CREATE.
 *
 * Mesmas invariantes do `createProduct` (normalização, duplicidade por loja,
 * metadata canônica, estoque inicial via ledger `cadastro` na MESMA tx).
 * Prova: sem nested transaction (`$transaction` nunca chamado na variante),
 * produto nasce com `stock: 0` e o saldo inicial vai pelo ledger.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  applyStockMutationTx: vi.fn(async () => ({ ok: true, idempotente: false })),
}))

vi.mock("@/lib/estoque/stock-ledger-service", () => ({
  applyStockMutationTx: h.applyStockMutationTx,
}))

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { createProductTx } from "./product-write-service"

function fakeTx(over: Record<string, unknown> = {}) {
  const calls: { created: unknown[]; audits: unknown[] } = { created: [], audits: [] }
  const tx = {
    produto: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (args: unknown) => {
        calls.created.push(args)
        return { id: "prod-tx-1" }
      },
      update: async () => ({ id: "x" }),
    },
    logsAuditoria: {
      create: async (args: unknown) => {
        calls.audits.push(args)
        return {}
      },
    },
    $queryRaw: async () => [],
    deposito: { findFirst: async () => null, findUnique: async () => null, create: async () => ({}) },
    produtoDeposito: { findMany: async () => [], upsert: async () => ({}) },
    movimentacaoEstoque: { findFirst: async () => null, create: async () => ({ id: "m1" }) },
    ...over,
  }
  return { tx: tx as never, calls }
}

const CTX = { storeId: "loja-a", principal: null }

beforeEach(() => {
  h.applyStockMutationTx.mockReset()
  h.applyStockMutationTx.mockResolvedValue({ ok: true, idempotente: false } as never)
})

describe("createProductTx", () => {
  it("cria com stock 0 + ledger de estoque inicial na mesma tx", async () => {
    const { tx, calls } = fakeTx()
    const res = await createProductTx(tx, CTX, { nome: "P1", sku: "A1", estoque: 7, custo: 3 } as never)
    expect(res.ok).toBe(true)
    expect(calls.created).toHaveLength(1)
    const data = (calls.created[0] as { data: Record<string, unknown> }).data
    expect(data.stock).toBe(0)
    expect(data.storeId).toBe("loja-a")
    expect(h.applyStockMutationTx).toHaveBeenCalledTimes(1)
    const [, , cmd] = h.applyStockMutationTx.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(cmd.kind).toBe("entrada")
    expect(cmd.quantidade).toBe(7)
    expect(cmd.origem).toBe("cadastro")
    expect(cmd.produtoId).toBe("prod-tx-1")
  })

  it("estoque 0/ausente: sem ledger", async () => {
    const { tx } = fakeTx()
    const res = await createProductTx(tx, CTX, { nome: "P1" } as never)
    expect(res.ok).toBe(true)
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })

  it("duplicidade por loja: DUPLICATE sem escrever", async () => {
    const { tx, calls } = fakeTx({
      produto: {
        findFirst: async () => ({ id: "outro", name: "X", sku: "A1", barcode: null, stock: 0 }),
        findUnique: async () => null,
        create: async () => {
          throw new Error("não deve criar em DUPLICATE")
        },
        update: async () => ({ id: "x" }),
      },
    })
    const res = await createProductTx(tx, CTX, { nome: "P1", sku: "A1" } as never)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("DUPLICATE")
    expect(calls.created).toHaveLength(0)
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })

  it("contexto sem loja: UNTRUSTED sem I/O", async () => {
    const { tx, calls } = fakeTx()
    const res = await createProductTx(tx, { storeId: "  ", principal: null }, { nome: "P1" } as never)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("UNTRUSTED_CONTEXT")
    expect(calls.created).toHaveLength(0)
  })
})
