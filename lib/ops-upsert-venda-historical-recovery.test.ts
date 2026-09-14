/**
 * GOAL: vendas antigas preservadas no PDV (conflito de identificação) viram vendas reais
 * na data e na sessão de caixa ORIGINAIS — efeitos no motor de venda.
 *
 * Cobre `historicalRecoveryPersistOptions` + `upsertVendaInTransaction` (writer V2):
 *  - sessão original FECHADA: lança na própria sessão, com a data real, sem procurar o
 *    caixa aberto de hoje;
 *  - estoque cuja saída um AJUSTE de saldo posterior já refletiu não é baixado de novo;
 *  - estoque/financeiro já lançados para o pedido não se repetem;
 *  - replay pela mesma identidade técnica não repete nenhum efeito;
 *  - a regra histórica não vaza para o PDV ao vivo.
 *
 * Fake de TransactionClient com estado, no padrão de `ops-upsert-venda-caixa-original-fechado.test.ts`.
 */
import { describe, expect, it } from "vitest"
import { upsertVendaInTransaction, type SalePayload } from "./ops-upsert-venda"
import {
  historicalRecoveryPersistOptions,
  type OriginalSessionStatus,
} from "./vendas/quarantine-recovery-planner"

const STORE = "loja-2"
const SALE_AT = "2026-06-15T18:42:07.123Z"
const PEDIDO_NOVO = "VDA-L02-2026-000731"
const CLIENT_SALE_ID = "lq_0123456789abcdef0123456789abcdef"

type MovEstoque = {
  produtoId: string
  tipo: string
  origem: string
  documento: string | null
  quantidade: number
  createdAt: Date
  observacao?: string | null
}

function makeDb(opts: {
  stock?: number
  sessoes?: Array<{ id: string; status: "ABERTA" | "FECHADA" }>
  movimentosEstoque?: MovEstoque[]
  financeiros?: Array<{ referenciaId: string; valor: number; createdAt: Date }>
} = {}) {
  const produto = { id: "prod-1", stock: opts.stock ?? 10, precoCusto: 4, sku: "SKU-1", name: "Boneca" }
  const vendas: Array<Record<string, any>> = []
  const payloadUpdates: unknown[] = []
  const movimentosEstoque: MovEstoque[] = [...(opts.movimentosEstoque ?? [])]
  const financeiros: Array<Record<string, any>> = [...(opts.financeiros ?? [])]
  const sessaoQueries: Array<Record<string, unknown>> = []
  let allocations = 0

  const tx: any = {
    cliente: { findFirst: async () => null },
    venda: {
      findFirst: async ({ where }: any) =>
        vendas.find((v) => v.storeId === where.storeId && v.clientSaleId === where.clientSaleId) ?? null,
      findUnique: async ({ where }: any) => vendas.find((v) => v.pedidoId === where.pedidoId) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: `venda-${vendas.length + 1}`,
          status: "concluida",
          terminalId: null,
          clienteNome: null,
          clienteId: null,
          clientSaleId: null,
          ...data,
        }
        vendas.push(row)
        return row
      },
      update: async ({ where, data }: any) => {
        if (data.payload) {
          payloadUpdates.push(data.payload)
          const row = vendas.find((v) => v.id === where.id)
          if (row) row.payload = data.payload
        }
        return {}
      },
    },
    itemVenda: { create: async () => ({}) },
    produto: {
      findFirst: async ({ where }: any) =>
        where.storeId === STORE &&
        (where.OR ?? []).some((c: any) => c.id === produto.id || c.sku === produto.sku)
          ? { id: produto.id, stock: produto.stock, precoCusto: produto.precoCusto, sku: produto.sku, name: produto.name }
          : null,
      findUnique: async () => ({ stock: produto.stock, precoCusto: produto.precoCusto }),
      update: async ({ data }: any) => {
        produto.stock -= data.stock?.decrement ?? 0
        return produto
      },
      updateMany: async ({ where, data }: any) => {
        if (typeof where.stock?.gte === "number" && produto.stock < where.stock.gte) return { count: 0 }
        produto.stock -= data.stock?.decrement ?? 0
        return { count: 1 }
      },
    },
    movimentacaoEstoque: {
      findFirst: async ({ where }: any) =>
        movimentosEstoque.find(
          (m) =>
            m.produtoId === where.produtoId &&
            (where.documento === undefined || m.documento === where.documento) &&
            (where.origem === undefined || m.origem === where.origem) &&
            (where.tipo === undefined || m.tipo === where.tipo) &&
            (where.createdAt?.gt === undefined || m.createdAt.getTime() > where.createdAt.gt.getTime()),
        ) ?? null,
      create: async ({ data }: any) => {
        movimentosEstoque.push({ ...data, createdAt: data.createdAt ?? new Date() })
        return data
      },
    },
    movimentacaoFinanceira: {
      findFirst: async ({ where }: any) => financeiros.find((f) => f.referenciaId === where.referenciaId) ?? null,
      create: async ({ data }: any) => {
        financeiros.push(data)
        return data
      },
    },
    sessaoCaixa: {
      findFirst: async ({ where }: any) => {
        sessaoQueries.push(where)
        const found = (opts.sessoes ?? []).find(
          (s) => (where.id === undefined || s.id === where.id) && (where.status === undefined || s.status === where.status),
        )
        return found ? { id: found.id, status: found.status } : null
      },
    },
    contaReceberTitulo: { upsert: async () => ({ id: "cr-1" }) },
  }

  const v2 = (clientSaleId: string) => ({
    clientSaleId,
    allocate: (async () => {
      allocations += 1
      return { pedidoId: PEDIDO_NOVO, serieVendaId: "serie-l02", anoNumero: 2026, numeroSequencial: 731 }
    }) as never,
  })

  return {
    tx,
    produto,
    vendas,
    payloadUpdates,
    movimentosEstoque,
    financeiros,
    sessaoQueries,
    v2,
    allocations: () => allocations,
  }
}

/** Venda de 15/06 preservada no PDV: 2 bonecas em dinheiro, sessão de 15/06 já fechada. */
function vendaPreservada(over: Record<string, unknown> = {}): SalePayload {
  return {
    id: "VDA-2026-0412",
    clientSaleId: CLIENT_SALE_ID,
    at: SALE_AT,
    total: 59.9,
    customerName: "Consumidor",
    cashierId: "Rafa",
    terminalId: "PDV1",
    sessaoId: "sess-15-06",
    paymentBreakdown: { dinheiro: 59.9 },
    lines: [{ inventoryId: "prod-1", name: "Boneca", quantity: 2, unitPrice: 29.95 }],
    ...over,
  } as SalePayload
}

function opcoesHistoricas(db: ReturnType<typeof makeDb>, status: OriginalSessionStatus = "FECHADA") {
  return {
    ...historicalRecoveryPersistOptions({ originalSessionStatus: status, allowClosedOriginalSession: true }),
    v2: db.v2(CLIENT_SALE_ID),
  }
}

const AJUSTE_POSTERIOR: MovEstoque = {
  produtoId: "prod-1",
  tipo: "ajuste",
  origem: "manual",
  documento: null,
  quantidade: -2,
  createdAt: new Date("2026-07-02T13:00:00.000Z"),
}

describe("recuperação histórica — sessão de caixa original", () => {
  it("sessão FECHADA: grava na própria sessão, na data original, sem procurar o caixa aberto de hoje", async () => {
    const db = makeDb({
      sessoes: [
        { id: "sess-15-06", status: "FECHADA" },
        { id: "sess-hoje", status: "ABERTA" },
      ],
    })
    const result = await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))

    expect(result.replayed).toBe(false)
    expect(result.venda.pedidoId).toBe(PEDIDO_NOVO)
    expect(result.venda.at).toBe(SALE_AT)

    // Receita à vista na data REAL da venda (dentro da janela da sessão de 15/06).
    expect(db.financeiros).toHaveLength(1)
    expect(db.financeiros[0]).toMatchObject({ referenciaId: PEDIDO_NOVO, valor: 59.9 })
    expect((db.financeiros[0].createdAt as Date).toISOString()).toBe(SALE_AT)

    // Só a sessão original foi consultada — o fallback "sessão ABERTA mais recente" nunca rodou.
    expect(db.sessaoQueries.length).toBeGreaterThan(0)
    for (const where of db.sessaoQueries) {
      expect(where.id).toBe("sess-15-06")
      expect(where.status).toBeUndefined()
    }

    expect(db.vendas[0].payload).toMatchObject({
      sessaoId: "sess-15-06",
      retroactiveSync: true,
      originalSessionClosed: true,
    })
  })
})

describe("recuperação histórica — estoque sem baixa dupla", () => {
  it("ajuste de saldo POSTERIOR à venda já refletiu a saída: não baixa de novo e registra no payload", async () => {
    const db = makeDb({
      stock: 7,
      sessoes: [{ id: "sess-15-06", status: "FECHADA" }],
      movimentosEstoque: [AJUSTE_POSTERIOR],
    })
    await upsertVendaInTransaction(
      db.tx,
      STORE,
      vendaPreservada({ recovery: { recoveredFromPedidoId: "VDA-2026-0412" } }),
      undefined,
      opcoesHistoricas(db),
    )

    expect(db.produto.stock).toBe(7)
    expect(db.movimentosEstoque.filter((m) => m.tipo === "saida")).toHaveLength(0)
    expect(db.payloadUpdates).toHaveLength(1)
    expect((db.vendas[0].payload as { recovery?: unknown }).recovery).toMatchObject({
      recoveredFromPedidoId: "VDA-2026-0412",
      stockAbsorbedByLaterAdjustment: [{ produtoId: "prod-1", nome: "Boneca", quantidade: 2 }],
    })
  })

  it("sem ajuste depois da venda: baixa UMA vez e deixa a data real da venda no ledger", async () => {
    const db = makeDb({
      stock: 10,
      sessoes: [{ id: "sess-15-06", status: "FECHADA" }],
      movimentosEstoque: [{ ...AJUSTE_POSTERIOR, quantidade: 3, createdAt: new Date("2026-06-01T10:00:00.000Z") }],
    })
    await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))

    expect(db.produto.stock).toBe(8)
    const saidas = db.movimentosEstoque.filter((m) => m.tipo === "saida")
    expect(saidas).toHaveLength(1)
    expect(saidas[0]).toMatchObject({ documento: PEDIDO_NOVO, quantidade: -2 })
    expect(saidas[0].observacao).toContain(SALE_AT)
    expect(db.payloadUpdates).toHaveLength(0)
  })

  it("estoque já movimentado para o pedido: não baixa de novo", async () => {
    const db = makeDb({
      stock: 8,
      sessoes: [{ id: "sess-15-06", status: "FECHADA" }],
      movimentosEstoque: [
        { produtoId: "prod-1", tipo: "saida", origem: "pdv", documento: PEDIDO_NOVO, quantidade: -2, createdAt: new Date() },
      ],
    })
    await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))

    expect(db.produto.stock).toBe(8)
    expect(db.movimentosEstoque.filter((m) => m.tipo === "saida")).toHaveLength(1)
  })

  it("PDV ao vivo não usa a regra histórica: ajuste posterior não suprime a baixa", async () => {
    const db = makeDb({
      stock: 10,
      sessoes: [{ id: "sess-15-06", status: "ABERTA" }],
      movimentosEstoque: [AJUSTE_POSTERIOR],
    })
    await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, {
      enforceStock: true,
      requireCaixaSession: true,
      v2: db.v2(CLIENT_SALE_ID),
    })

    expect(db.produto.stock).toBe(8)
    expect(db.movimentosEstoque.filter((m) => m.tipo === "saida")).toHaveLength(1)
  })
})

describe("recuperação histórica — financeiro e replay", () => {
  it("financeiro já lançado para o pedido: não lança de novo", async () => {
    const db = makeDb({
      sessoes: [{ id: "sess-15-06", status: "FECHADA" }],
      financeiros: [{ referenciaId: PEDIDO_NOVO, valor: 59.9, createdAt: new Date(SALE_AT) }],
    })
    await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))

    expect(db.financeiros).toHaveLength(1)
  })

  it("replay pela mesma identidade técnica não repete venda, número, estoque nem financeiro", async () => {
    const db = makeDb({ stock: 10, sessoes: [{ id: "sess-15-06", status: "FECHADA" }] })

    const first = await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))
    const second = await upsertVendaInTransaction(db.tx, STORE, vendaPreservada(), undefined, opcoesHistoricas(db))

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.venda.pedidoId).toBe(first.venda.pedidoId)
    expect(second.venda.at).toBe(SALE_AT)
    expect(db.vendas).toHaveLength(1)
    expect(db.allocations()).toBe(1)
    expect(db.produto.stock).toBe(8)
    expect(db.movimentosEstoque.filter((m) => m.tipo === "saida")).toHaveLength(1)
    expect(db.financeiros).toHaveLength(1)
  })
})
