/**
 * PDV-MOTOR-INTEGRITY-N1 — invariante linhas × total no choke point compartilhado.
 *
 * Prova que `upsertVendaInTransaction` (núcleo único de V1 e V2) falha fechado,
 * ANTES de Venda/ItemVenda/estoque/caixa/financeiro/títulos, quando:
 * - a soma das formas de pagamento diverge do total cobrado;
 * - a venda chega sem itens ou com linha não persistível (sem produto,
 *   quantidade inválida, preço inválido).
 *
 * Replay legado (sem `enforceStock`) preserva o histórico sem revalidar.
 * Usa `TransactionClient` fake em memória (mesmo padrão de
 * `ops-upsert-venda-safety.test.ts` — vitest `node`, sem Prisma).
 */
import { describe, expect, it } from "vitest"
import {
  upsertVendaInTransaction,
  SalePaymentsMismatchError,
  InvalidSaleLinesError,
  type SalePayload,
} from "./ops-upsert-venda"

type FakeProduct = {
  id: string
  storeId: string
  stock: number
  precoCusto: number
  sku: string | null
  name: string
}

function makeFakeTx(opts?: { products?: FakeProduct[] }) {
  const products = opts?.products ?? []
  const byId = new Map(products.map((p) => [p.id, p]))
  let vendaUpserts = 0
  let itemUpserts = 0
  let estoqueMoves = 0
  let financeiroMoves = 0

  const tx: any = {
    cliente: { findFirst: async () => null },
    venda: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }: any) => {
        vendaUpserts += 1
        return { id: "venda-1", ...data, terminalId: data.terminalId ?? null, status: "concluida" }
      },
      update: async () => ({}),
    },
    itemVenda: {
      create: async ({ data }: any) => {
        itemUpserts += 1
        return data
      },
    },
    produto: {
      findFirst: async ({ where }: any) => {
        const ors: Array<Record<string, string>> = where.OR ?? []
        for (const p of products) {
          if (p.storeId !== where.storeId) continue
          for (const cond of ors) {
            if (cond.id !== undefined && p.id === cond.id) return { ...p }
            if (cond.sku !== undefined && p.sku === cond.sku) return { ...p }
          }
        }
        return null
      },
      findUnique: async ({ where }: any) => {
        const p = byId.get(where.id)
        return p ? { stock: p.stock, precoCusto: p.precoCusto } : null
      },
      updateMany: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (!p || p.storeId !== where.storeId) return { count: 0 }
        if (typeof where.stock?.gte === "number" && p.stock < where.stock.gte) return { count: 0 }
        p.stock -= data.stock?.decrement ?? 0
        return { count: 1 }
      },
      update: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (p && data.stock?.decrement != null) p.stock -= data.stock.decrement
        return p ?? {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        estoqueMoves += 1
        return data
      },
    },
    movimentacaoFinanceira: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        financeiroMoves += 1
        return data
      },
    },
    contaReceberTitulo: {
      upsert: async () => ({ id: "tit-1" }),
    },
    sessaoCaixa: {
      findFirst: async () => ({ id: "sess-1", status: "ABERTA" }),
    },
  }
  return {
    tx,
    counts: () => ({ vendaUpserts, itemUpserts, estoqueMoves, financeiroMoves }),
  }
}

const STORE = "loja-1"
const LIVE = { enforceStock: true, requireCaixaSession: true } as const
const V2_LIVE = (clientSaleId: string) =>
  ({
    enforceStock: true,
    requireCaixaSession: true,
    v2: {
      clientSaleId,
      allocate: async () => ({
        pedidoId: "VDA-2026-0001",
        serieVendaId: "serie-1",
        anoNumero: 2026,
        numeroSequencial: 1,
      }),
    },
  }) as const

function vendaBase(over: Partial<SalePayload> = {}): SalePayload {
  return {
    id: "VDA-2026-0001",
    total: 100,
    sessaoId: "sess-1",
    paymentBreakdown: { dinheiro: 100 },
    lines: [{ inventoryId: "prod-1", name: "Produto", quantity: 1, unitPrice: 100 }],
    ...over,
  }
}

const PROD = { id: "prod-1", storeId: STORE, stock: 5, precoCusto: 10, sku: "SKU-1", name: "Produto" }

describe("invariante linhas × total — fluxo ao vivo (V1)", () => {
  it("pagamentos ≠ total falha com PAGAMENTOS_TOTAL_DIVERGENTE e nada é gravado", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    // Carrinho cheio cobrado (100) mas só 60 enviados nas linhas de pagamento.
    const sale = vendaBase({ paymentBreakdown: { dinheiro: 60 } })
    await expect(upsertVendaInTransaction(tx, STORE, sale, undefined, LIVE)).rejects.toBeInstanceOf(
      SalePaymentsMismatchError,
    )
    try {
      await upsertVendaInTransaction(tx, STORE, vendaBase({ paymentBreakdown: { dinheiro: 60 } }), undefined, LIVE)
      throw new Error("deveria ter lançado")
    } catch (e) {
      expect((e as SalePaymentsMismatchError).code).toBe("PAGAMENTOS_TOTAL_DIVERGENTE")
    }
    expect(counts()).toEqual({ vendaUpserts: 0, itemUpserts: 0, estoqueMoves: 0, financeiroMoves: 0 })
  })

  it("venda sem itens falha com LINHAS_VENDA_INVALIDAS e nada é gravado", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    await expect(
      upsertVendaInTransaction(tx, STORE, vendaBase({ lines: [], total: 0, paymentBreakdown: {} }), undefined, LIVE),
    ).rejects.toBeInstanceOf(InvalidSaleLinesError)
    expect(counts().vendaUpserts).toBe(0)
  })

  it("linha sem produto / quantidade zerada / preço negativo falham fechado", async () => {
    const cases: SalePayload[] = [
      vendaBase({ lines: [{ inventoryId: "", name: "X", quantity: 1, unitPrice: 10 }] }),
      vendaBase({ lines: [{ inventoryId: "prod-1", name: "X", quantity: 0, unitPrice: 10 }], total: 0, paymentBreakdown: {} }),
      vendaBase({ lines: [{ inventoryId: "prod-1", name: "X", quantity: 1, unitPrice: -5 }], total: -5, paymentBreakdown: { dinheiro: -5 } }),
    ]
    for (const sale of cases) {
      const { tx, counts } = makeFakeTx({ products: [PROD] })
      await expect(upsertVendaInTransaction(tx, STORE, sale, undefined, LIVE)).rejects.toBeInstanceOf(
        InvalidSaleLinesError,
      )
      expect(counts().vendaUpserts).toBe(0)
    }
  })

  it("venda coerente passa (controle)", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    const result = await upsertVendaInTransaction(tx, STORE, vendaBase(), undefined, LIVE)
    expect(result.replayed).toBe(false)
    expect(counts()).toEqual({ vendaUpserts: 1, itemUpserts: 1, estoqueMoves: 1, financeiroMoves: 1 })
  })

  it("replay legado sem enforceStock preserva o histórico (sem revalidar)", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    // Pagamentos divergentes passariam no fluxo ao vivo — no replay histórico, passam.
    const result = await upsertVendaInTransaction(
      tx,
      STORE,
      vendaBase({ paymentBreakdown: { dinheiro: 60 } }),
      undefined,
      undefined,
    )
    expect(result.replayed).toBe(false)
    expect(counts().vendaUpserts).toBe(1)
  })
})

describe("invariante linhas × total — V2 equivalente a V1", () => {
  it("V2 rejeita pagamentos divergentes com o mesmo código", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    const sale: SalePayload = {
      total: 100,
      sessaoId: "sess-1",
      paymentBreakdown: { dinheiro: 10 },
      lines: [{ inventoryId: "prod-1", name: "Produto", quantity: 1, unitPrice: 100 }],
    }
    await expect(
      upsertVendaInTransaction(tx, STORE, sale, undefined, V2_LIVE("cs_v2teste01")),
    ).rejects.toMatchObject({ code: "PAGAMENTOS_TOTAL_DIVERGENTE" })
    expect(counts().vendaUpserts).toBe(0)
  })

  it("V2 aceita venda coerente com número alocado pelo servidor", async () => {
    const { tx, counts } = makeFakeTx({ products: [PROD] })
    const sale: SalePayload = {
      total: 100,
      sessaoId: "sess-1",
      paymentBreakdown: { dinheiro: 100 },
      lines: [{ inventoryId: "prod-1", name: "Produto", quantity: 1, unitPrice: 100 }],
    }
    const result = await upsertVendaInTransaction(tx, STORE, sale, undefined, V2_LIVE("cs_v2teste02"))
    expect(result.replayed).toBe(false)
    expect(result.venda.pedidoId).toBe("VDA-2026-0001")
    expect(counts().vendaUpserts).toBe(1)
  })
})
