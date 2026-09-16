/**
 * GOAL PDV-TROCAS-VALE-HARDENING-PRE-PUBLISH-002 — estorno de Crédito/Vale no cancelamento.
 *
 * Exercita o handler POST de PRODUÇÃO sobre Prisma EM MEMÓRIA. Prova que:
 *  - vale 40 usado integralmente → cancelar devolve o saldo a 40 e reativa o vale;
 *  - consumo parcial (40/30) → restaura exatamente o valor consumido;
 *  - pagamento misto → restaura só a parcela de crédito/vale; a saída de caixa
 *    do estorno continua sendo só da entrada real (dinheiro) — vale não é dinheiro;
 *  - cancelamento repetido (replay) → 409 e nenhuma segunda devolução de crédito;
 *  - crédito de outra loja nunca é tocado (storeId isola);
 *  - venda sem uso de crédito → nenhum efeito sobre créditos.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const STORE = "loja-1"
  const db = {
    vendas: [] as Row[],
    usos: [] as Row[],
    creditos: [] as Row[],
    movFinanceira: [] as Row[],
    movEstoque: [] as Row[],
    devolucoes: [] as Row[],
    produtos: [] as Row[],
    titulos: [] as Row[],
    // CAD-R2-009: depósito principal + saldos físicos do boundary.
    depositos: [] as Row[],
    produtoDepositos: [] as Row[],
  }
  const estornosReceber: Array<Row> = []
  let seq = 0

  function reset() {
    db.vendas.length = 0
    db.usos.length = 0
    db.creditos.length = 0
    db.movFinanceira.length = 0
    db.movEstoque.length = 0
    db.devolucoes.length = 0
    db.produtos.length = 0
    db.titulos.length = 0
    db.depositos.length = 0
    db.produtoDepositos.length = 0
    estornosReceber.length = 0
    seq = 0
  }

  function addVenda(pedidoId: string, over: Row = {}) {
    db.vendas.push({
      id: `v-${++seq}`,
      pedidoId,
      storeId: STORE,
      status: "concluida",
      payload: {},
      itens: [],
      ...over,
    })
  }

  function addCredito(id: string, saldo: number, status = "ativo", storeId = STORE) {
    db.creditos.push({ id, storeId, saldoAtual: saldo, status, valorOriginal: 40 })
  }

  function addUso(id: string, creditoId: string, vendaId: string, valor: number) {
    db.usos.push({ id, creditoId, storeId: STORE, vendaId, valor })
  }

  const tx = {
    venda: {
      findFirst: async ({ where }: { where: Row }) =>
        db.vendas.find((v) => v.pedidoId === where.pedidoId && v.storeId === where.storeId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const v = db.vendas.find((x) => x.id === where.id)
        if (v) Object.assign(v, data)
        return v ?? {}
      },
    },
    devolucaoVenda: {
      findMany: async ({ where }: { where: Row }) =>
        db.devolucoes.filter((d) => d.storeId === where.storeId && d.vendaLocalId === where.vendaLocalId),
    },
    usoCreditoCliente: {
      findMany: async ({ where }: { where: Row }) =>
        db.usos.filter((u) => u.storeId === where.storeId && u.vendaId === where.vendaId),
    },
    clienteCredito: {
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const c = db.creditos.find(
          (x) => x.id === where.id && x.storeId === where.storeId,
        ) as Row | undefined
        if (!c) return { count: 0 }
        c.saldoAtual = Math.round(((c.saldoAtual as number) + (data.saldoAtual as { increment: number }).increment) * 100) / 100
        return { count: 1 }
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.creditos.find((c) => c.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const c = db.creditos.find((x) => x.id === where.id)
        if (c) Object.assign(c, data)
        return c ?? {}
      },
    },
    produto: {
      // CAD-R2-009: resolução id|sku|barcode da rota + ownership `{ id, storeId }` do boundary.
      findFirst: async ({ where }: { where: Row }) => {
        if (typeof where.id === "string") {
          const hit = db.produtos.find(
            (x) => x.id === where.id && (where.storeId === undefined || x.storeId === where.storeId),
          )
          return hit ? { ...hit } : null
        }
        const ors = (where.OR ?? []) as Row[]
        const hit = db.produtos.find((x) => {
          if (x.storeId !== where.storeId) return false
          return ors.some((c) => (c.id !== undefined && x.id === c.id) || (c.sku !== undefined && x.sku === c.sku) || (c.barcode !== undefined && x.barcode === c.barcode))
        })
        return hit ? { ...hit } : null
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const hit = db.produtos.find((x) => x.id === where.id)
        return hit ? { id: hit.id as string, storeId: hit.storeId as string } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const hit = db.produtos.find((x) => x.id === where.id)
        if (hit) {
          const stockData = data.stock as number | { increment?: number } | undefined
          if (typeof stockData === "number") hit.stock = stockData
          else if (typeof stockData?.increment === "number") hit.stock = ((hit.stock as number) ?? 0) + stockData.increment
          if (typeof data.precoCusto === "number") hit.precoCusto = data.precoCusto
        }
        return hit ?? {}
      },
    },
    $queryRaw: async () => [] as unknown[],
    deposito: {
      findFirst: async ({ where }: { where: Row }) =>
        db.depositos.find((d) => d.storeId === where.storeId) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.depositos.find((d) => d.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => {
        const d = { id: `dep-${++seq}`, storeId: data.storeId }
        db.depositos.push(d)
        return d
      },
    },
    produtoDeposito: {
      findMany: async ({ where }: { where: Row }) =>
        db.produtoDepositos
          .filter((r) => r.storeId === where.storeId && (where.produtoId === undefined || r.produtoId === where.produtoId))
          .map((r) => ({ depositoId: r.depositoId, quantidade: r.quantidade })),
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const key = where.produtoId_depositoId as Row
        const ex = db.produtoDepositos.find((r) => r.produtoId === key.produtoId && r.depositoId === key.depositoId)
        if (ex) ex.quantidade = update.quantidade as number
        else {
          db.produtoDepositos.push({
            storeId: create.storeId,
            produtoId: create.produtoId,
            depositoId: create.depositoId,
            quantidade: (create.quantidade as number) ?? (update.quantidade as number),
          })
        }
        return {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async ({ where }: { where: Row }) => {
        // CAD-R2-009: lookup por chave (dedupe) + guarda legado.
        if (where.idempotencyKey !== undefined) {
          return (
            db.movEstoque.find(
              (m) => m.storeId === where.storeId && (m.idempotencyKey ?? null) === where.idempotencyKey,
            ) ?? null
          )
        }
        return (
          db.movEstoque.find(
            (m) =>
              m.storeId === where.storeId &&
              m.documento === where.documento &&
              m.produtoId === where.produtoId &&
              m.origem === where.origem,
          ) ?? null
        )
      },
      create: async ({ data }: { data: Row }) => {
        const key = (data.idempotencyKey ?? null) as string | null
        if (key && db.movEstoque.some((m) => m.storeId === data.storeId && (m.idempotencyKey ?? null) === key)) {
          const e = new Error("Unique constraint failed") as Error & { code: string; name: string }
          e.code = "P2002"
          e.name = "PrismaClientKnownRequestError"
          throw e
        }
        const row = { id: `mov-${++seq}`, ...data }
        db.movEstoque.push(row)
        return { id: row.id }
      },
    },
    movimentacaoFinanceira: {
      findFirst: async ({ where }: { where: Row }) =>
        db.movFinanceira.find(
          (m) =>
            m.storeId === where.storeId &&
            m.referenciaId === where.referenciaId &&
            m.tipo === where.tipo &&
            m.origem === where.origem,
        ) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        db.movFinanceira.filter(
          (m) =>
            m.storeId === where.storeId &&
            m.referenciaId === where.referenciaId &&
            m.tipo === where.tipo &&
            m.origem === where.origem,
        ),
      create: async ({ data }: { data: Row }) => {
        db.movFinanceira.push(data)
        return data
      },
    },
    contaReceberTitulo: {
      findMany: async () => db.titulos,
    },
  }

  const prisma = {
    ...tx,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  }

  return { STORE, db, estornosReceber, reset, addVenda, addCredito, addUso, prisma }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma, prismaEnsureConnected: async () => {} }))
vi.mock("@/lib/ops-api-gate", () => ({
  opsLojaIdFromRequest: vi.fn(() => h.STORE),
  requireOpsSubscription: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }))
vi.mock("@/lib/auth/session-operator", () => ({ getOperatorLabelFromSession: vi.fn(() => "") }))
vi.mock("@/lib/financeiro/services/movimentacoes-service", () => ({
  estornarMovimentacaoPorReferencia: vi.fn(async (storeId: string, id: string) => {
    h.estornosReceber.push({ storeId, id })
    return { ok: true, action: "created" }
  }),
}))
vi.mock("@/lib/financeiro/services/contas-receber-service", () => ({
  cancelContaReceber: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/financeiro/services/fechamento-service", () => ({
  verificarPeriodoFechado: vi.fn(async () => ({ fechado: false })),
}))
vi.mock("@/lib/fiscal/venda-fiscal-state-machine", () => ({
  assertVendaFiscalCancelavel: vi.fn(() => ({ ok: true })),
}))

import { POST } from "./route"

function post(pedidoId: string, body: Row = {}) {
  return POST(
    new Request(`http://local/api/vendas/${pedidoId}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-assistec-loja-id": h.STORE },
      body: JSON.stringify({ motivo: "cliente desistiu", ...body }),
    }),
    { params: Promise.resolve({ id: pedidoId }) },
  )
}

beforeEach(() => {
  h.reset()
})

describe("POST /api/vendas/[id]/cancelar — estorno do crédito/vale", () => {
  it("vale 40 usado integralmente → cancelar devolve o saldo a 40 e reativa o vale, sem caixa", async () => {
    h.addVenda("VDA-1", { payload: { paymentBreakdown: { creditoVale: 40 } } })
    h.addCredito("c1", 0, "zerado")
    h.addUso("u1", "c1", "VDA-1", 40)

    const res = await post("VDA-1")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estornoCreditoVale).toEqual({ usos: 1, valor: 40 })
    const credito = h.db.creditos[0]!
    expect(credito.saldoAtual).toBe(40)
    expect(credito.status).toBe("ativo")
    // Trilha de estorno persistida no payload da venda.
    const trail = (h.db.vendas[0]!.payload as Row).estornoCreditoVale as Row
    expect(trail.usos).toEqual([
      expect.objectContaining({ creditoId: "c1", valor: 40, saldoAntes: 0, saldoDepois: 40 }),
    ])
    // Vale não é dinheiro: nenhuma movimentação de caixa pelo estorno do crédito
    // (venda 100% vale não tinha entrada "venda" a estornar).
    expect(h.db.movFinanceira).toHaveLength(0)
  })

  it("vale 40 com uso de 30 → cancelar restaura o estado anterior (saldo 40)", async () => {
    h.addVenda("VDA-2")
    h.addCredito("c1", 10, "ativo") // 40 original − 30 usado
    h.addUso("u1", "c1", "VDA-2", 30)

    const res = await post("VDA-2")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estornoCreditoVale).toEqual({ usos: 1, valor: 30 })
    expect(h.db.creditos[0]!.saldoAtual).toBe(40)
    expect(h.db.creditos[0]!.status).toBe("ativo")
  })

  it("pagamento misto: restaura só a parcela vale; saída de caixa estorna só o dinheiro", async () => {
    h.addVenda("VDA-3", { payload: { paymentBreakdown: { dinheiro: 69.99, creditoVale: 40 } } })
    h.db.movFinanceira.push({
      storeId: h.STORE,
      referenciaId: "VDA-3",
      tipo: "entrada",
      origem: "venda",
      valor: 69.99,
    })
    h.addCredito("c1", 0, "zerado")
    h.addUso("u1", "c1", "VDA-3", 40)

    const res = await post("VDA-3")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estornoCreditoVale).toEqual({ usos: 1, valor: 40 })
    expect(h.db.creditos[0]!.saldoAtual).toBe(40)
    // Estorno de caixa = SOMENTE a entrada real de dinheiro (69,99), nunca o vale.
    const saidas = h.db.movFinanceira.filter((m) => m.tipo === "saida")
    expect(saidas).toHaveLength(1)
    expect(saidas[0]!.valor).toBeCloseTo(69.99, 2)
    expect(saidas[0]!.origem).toBe("cancelamento_pdv")
  })

  it("cancelamento repetido (replay) → 409 e nenhuma segunda devolução de crédito", async () => {
    h.addVenda("VDA-4")
    h.addCredito("c1", 0, "zerado")
    h.addUso("u1", "c1", "VDA-4", 40)

    const primeira = await post("VDA-4")
    expect((await primeira.json()).ok).toBe(true)
    expect(h.db.creditos[0]!.saldoAtual).toBe(40)

    const replay = await post("VDA-4")
    expect(replay.status).toBe(409)
    // O crédito NÃO foi devolvido duas vezes.
    expect(h.db.creditos[0]!.saldoAtual).toBe(40)
  })

  it("storeId isola: crédito de outra loja nunca é restaurado", async () => {
    h.addVenda("VDA-5")
    h.addCredito("c1", 0, "zerado", "loja-OUTRA")
    h.db.usos.push({ id: "u1", creditoId: "c1", storeId: h.STORE, vendaId: "VDA-5", valor: 40 })

    const res = await post("VDA-5")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estornoCreditoVale).toEqual({ usos: 0, valor: 0 })
    expect(h.db.creditos[0]!.saldoAtual).toBe(0) // da outra loja — intocado
  })

  it("venda sem uso de crédito → nenhum efeito sobre créditos", async () => {
    h.addVenda("VDA-6")
    h.addCredito("c1", 25, "ativo")
    const res = await post("VDA-6")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estornoCreditoVale).toEqual({ usos: 0, valor: 0 })
    expect(h.db.creditos[0]!.saldoAtual).toBe(25)
    expect((h.db.vendas[0]!.payload as Row).estornoCreditoVale).toBeUndefined()
  })
})

describe("POST /api/vendas/[id]/cancelar — reposição de estoque (CAD-R2-009)", () => {
  it("cancela com entrada compensatória: stock + depósito + ledger, sem PATCH direto", async () => {
    h.db.produtos.push({
      id: "p1",
      storeId: h.STORE,
      sku: "SKU-1",
      name: "Fone",
      stock: 5,
      precoCusto: 4,
    })
    h.addVenda("VDA-EST", {
      itens: [{ inventoryId: "p1", nome: "Fone", quantidade: 2, precoUnitario: 50, lineTotal: 100 }],
    })

    const res = await post("VDA-EST")
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.estoqueReposto).toBe(1)
    // Saldo restaurado pelo líquido (2 vendidos − 0 devolvidos).
    expect(h.db.produtos[0]!.stock).toBe(7)
    // Depósito espelha o agregado.
    let soma = 0
    for (const r of h.db.produtoDepositos) soma += r.quantidade as number
    expect(soma).toBe(7)
    // Ledger: 1 entrada compensatória (nunca update/delete de histórico).
    const ledger = h.db.movEstoque.filter((m) => m.documento === "VDA-EST")
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      produtoId: "p1",
      tipo: "entrada",
      origem: "cancelamento_pdv",
      quantidade: 2,
      estoqueAntes: 5,
      estoqueDepois: 7,
    })
    expect(ledger[0]!.idempotencyKey).toContain("VDA-EST")
  })

  it("retry de cancelamento não duplica o retorno (409 + estoque/ledger intactos)", async () => {
    h.db.produtos.push({
      id: "p1",
      storeId: h.STORE,
      sku: "SKU-1",
      name: "Fone",
      stock: 5,
      precoCusto: 4,
    })
    h.addVenda("VDA-EST2", {
      itens: [{ inventoryId: "p1", nome: "Fone", quantidade: 2, precoUnitario: 50, lineTotal: 100 }],
    })

    const primeira = await post("VDA-EST2")
    expect((await primeira.json()).ok).toBe(true)
    expect(h.db.produtos[0]!.stock).toBe(7)

    const replay = await post("VDA-EST2")
    expect(replay.status).toBe(409)
    // Nada reaplicado: estoque e ledger intactos.
    expect(h.db.produtos[0]!.stock).toBe(7)
    expect(h.db.movEstoque.filter((m) => m.documento === "VDA-EST2")).toHaveLength(1)
  })
})
