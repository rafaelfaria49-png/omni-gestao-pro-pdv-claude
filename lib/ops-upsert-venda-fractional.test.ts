/**
 * FRACTIONAL-SALE-HARD-BLOCK-005 — venda server-side com quantidade fracionada.
 *
 * Prova que nenhuma venda nova com quantidade comercial fracionária alcança
 * persistência: `upsertVendaInTransaction` rejeita com `FractionalQuantityError`
 * ANTES de `Venda.create` — sem ItemVenda, sem baixa de estoque, sem efeito
 * financeiro/caixa, sem título a receber. Inteiros e ruído mínimo de floating
 * point continuam funcionando, incluindo replay/idempotência.
 *
 * Usa um `TransactionClient` fake em memória (vitest roda em `node` e proíbe
 * importar `@/lib/prisma`).
 */
import { describe, expect, it } from "vitest"
import {
  FractionalQuantityError,
  upsertVendaInTransaction,
  type SalePayload,
} from "./ops-upsert-venda"
import { FRACTIONAL_QUANTITY_CODE } from "./vendas/sale-quantity-contract"

const STORE = "loja-1"
const LIVE = { enforceStock: true, requireCaixaSession: true } as const

type FakeVenda = {
  id: string
  storeId: string
  pedidoId: string
  clientSaleId: string | null
  payload: unknown
  total: number
  at: Date
  clienteNome: string | null
  clienteId: string | null
  terminalId: string | null
  status: string
}

function makeDb() {
  const vendas = new Map<string, FakeVenda>()
  const items: Array<Record<string, unknown>> = []
  const stock = { value: 10, updates: 0 }
  const estoque: Array<Record<string, unknown>> = []
  const financeiro: Array<Record<string, unknown>> = []
  let vendaSeq = 0

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const makeTx = (): any => ({
    cliente: { findFirst: async () => null },
    venda: {
      findUnique: async ({ where }: any) => vendas.get(where.pedidoId) ?? null,
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const created: FakeVenda = {
          id: `venda-${++vendaSeq}`,
          storeId: data.storeId,
          pedidoId: data.pedidoId,
          clientSaleId: data.clientSaleId ?? null,
          payload: data.payload,
          total: data.total,
          at: data.at,
          clienteNome: data.clienteNome ?? null,
          clienteId: data.clienteId ?? null,
          terminalId: data.terminalId ?? null,
          status: "concluida",
        }
        vendas.set(created.pedidoId, created)
        return created
      },
      update: async () => ({}),
    },
    itemVenda: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        items.push(data)
        return data
      },
    },
    produto: {
      findFirst: async ({ where }: any) => {
        const hit = (where.OR ?? []).some(
          (c: Record<string, string>) => c.id === "SKU-1" || c.sku === "SKU-1" || c.barcode === "SKU-1",
        )
        return hit
          ? { id: "produto-1", stock: stock.value, precoCusto: 20, sku: "SKU-1", name: "Produto" }
          : null
      },
      findUnique: async () => ({ stock: stock.value, precoCusto: 20 }),
      updateMany: async ({ where, data }: any) => {
        if (stock.value < (where.stock?.gte ?? 0)) return { count: 0 }
        stock.value -= data.stock.decrement
        stock.updates += 1
        return { count: 1 }
      },
      update: async ({ data }: any) => {
        stock.value -= data.stock?.decrement ?? 0
        return {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        estoque.push(data)
        return data
      },
    },
    movimentacaoFinanceira: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        financeiro.push(data)
        return data
      },
    },
    contaReceberTitulo: {
      upsert: async () => ({ id: "tit-1" }),
    },
    clienteCredito: { findMany: async () => [] },
    usoCreditoCliente: { create: async ({ data }: any) => data },
    sessaoCaixa: {
      findFirst: async ({ where }: any) => {
        if (where.id && where.id !== "sessao-1") return null
        return { id: "sessao-1", status: "ABERTA" }
      },
    },
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { makeTx, vendas, items, stock, estoque, financeiro }
}

function sale(quantity: number, over: Partial<SalePayload> = {}): SalePayload {
  const unitPrice = 50
  return {
    id: "VDA-FRAC-001",
    at: "2026-09-10T12:00:00.000Z",
    total: 100,
    customerName: "Cliente Fração",
    sessaoId: "sessao-1",
    terminalId: "PDV1",
    lines: [{ inventoryId: "SKU-1", name: "Produto", quantity, unitPrice, lineTotal: 100 }],
    paymentBreakdown: { dinheiro: 100 },
    ...over,
  }
}

describe("upsertVendaInTransaction — quantidade fracionada fail-closed", () => {
  it("0.350 é bloqueado e NADA é persistido (venda, itens, estoque, financeiro)", async () => {
    const db = makeDb()
    const error = await upsertVendaInTransaction(
      db.makeTx(),
      STORE,
      sale(0.35, { total: 35, paymentBreakdown: { dinheiro: 35 } }),
      undefined,
      LIVE,
    ).catch((caught) => caught)

    expect(error).toBeInstanceOf(FractionalQuantityError)
    expect(error.code).toBe("FRACTIONAL_QUANTITY_UNSUPPORTED")
    expect(error.code).toBe(FRACTIONAL_QUANTITY_CODE)
    expect(error.message).toMatch(/fracionada/)
    // Ausência total de efeitos persistentes.
    expect(db.vendas.size).toBe(0)
    expect(db.items).toHaveLength(0)
    expect(db.stock).toEqual({ value: 10, updates: 0 })
    expect(db.estoque).toHaveLength(0)
    expect(db.financeiro).toHaveLength(0)
  })

  it.each([0.5, 1.5, 2.25])("quantidade %s é bloqueada sem gravar a venda", async (quantity) => {
    const db = makeDb()
    await expect(
      upsertVendaInTransaction(db.makeTx(), STORE, sale(quantity), undefined, LIVE),
    ).rejects.toBeInstanceOf(FractionalQuantityError)
    expect(db.vendas.size).toBe(0)
    expect(db.items).toHaveLength(0)
    expect(db.stock.updates).toBe(0)
    expect(db.financeiro).toHaveLength(0)
  })

  it("1.5 nunca é arredondado para 2 (rejeita em vez de persistir)", async () => {
    const db = makeDb()
    await expect(
      upsertVendaInTransaction(db.makeTx(), STORE, sale(1.5), undefined, LIVE),
    ).rejects.toThrowError(/fracionada/)
    expect(db.items).toHaveLength(0)
    expect(db.stock.value).toBe(10)
  })
})

describe("upsertVendaInTransaction — inteiros e ruído preservados", () => {
  it("venda inteira existente continua funcionando (baixa exata)", async () => {
    const db = makeDb()
    const result = await upsertVendaInTransaction(db.makeTx(), STORE, sale(2), undefined, LIVE)
    expect(result.replayed).toBe(false)
    expect(db.items).toHaveLength(1)
    expect(db.items[0].quantidade).toBe(2)
    expect(db.stock.value).toBe(8)
    expect(db.estoque).toHaveLength(1)
    expect(db.estoque[0].quantidade).toBe(-2)
    expect(db.financeiro).toHaveLength(1)
  })

  it.each([1.0000000001, 0.9999999999])("ruído %s normaliza para 1 sem falso bloqueio", async (quantity) => {
    const db = makeDb()
    const result = await upsertVendaInTransaction(db.makeTx(), STORE, sale(quantity), undefined, LIVE)
    expect(result.replayed).toBe(false)
    expect(db.items).toHaveLength(1)
    expect(db.items[0].quantidade).toBe(1)
    expect(db.stock.value).toBe(9)
  })

  it("replay/idempotência de venda inteira continua funcionando", async () => {
    const db = makeDb()
    const request = sale(2)
    const first = await upsertVendaInTransaction(db.makeTx(), STORE, request, undefined, LIVE)
    const replay = await upsertVendaInTransaction(db.makeTx(), STORE, sale(2), undefined, LIVE)
    expect(replay.replayed).toBe(true)
    expect(replay.venda.id).toBe(first.venda.id)
    expect(db.vendas.size).toBe(1)
    expect(db.items).toHaveLength(1)
    expect(db.stock.value).toBe(8)
    expect(db.financeiro).toHaveLength(1)
  })

  it("replay com ruído mínimo casa com a venda inteira original", async () => {
    const db = makeDb()
    const first = await upsertVendaInTransaction(db.makeTx(), STORE, sale(1), undefined, LIVE)
    const replay = await upsertVendaInTransaction(
      db.makeTx(),
      STORE,
      sale(1.0000000001),
      undefined,
      LIVE,
    )
    expect(replay.replayed).toBe(true)
    expect(replay.venda.id).toBe(first.venda.id)
    expect(db.items).toHaveLength(1)
    expect(db.financeiro).toHaveLength(1)
  })
})
