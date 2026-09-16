/**
 * CAD-R2-009 — Testes do adapter OS → Stock/Ledger canônico.
 *
 * Prova que `consumeEstoqueFromOS` / `restoreEstoqueFromOS` / `applyEstoqueDelta`
 * usam o boundary (`applyStockMutationTx`) na MESMA transação da OS:
 * - peça física baixa stock + depósito + ledger `saida` (origem `os`);
 * - serviço sem produto físico não cria movimento nem toca saldo;
 * - segundo consumo é `already_consumed` (sem dupla baixa);
 * - estorno gera ENTRADA compensatória (nunca edita ledger) e é idempotente;
 * - delta de revisão aplica consumo/restauração parcial com chave por revisão.
 *
 * Fake em memória do `@/lib/prisma` (vitest `node`, sem banco).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const STORE = "loja-1"
  const produtos: Row[] = []
  const movs: Row[] = []
  const depositos: Row[] = []
  const pds: Array<{ storeId: unknown; produtoId: unknown; depositoId: unknown; quantidade: number }> = []
  const osRows = new Map<string, Row>()
  const osItems: Row[] = []
  let seq = 0

  function reset() {
    produtos.length = 0
    movs.length = 0
    depositos.length = 0
    pds.length = 0
    osRows.clear()
    osItems.length = 0
    seq = 0
  }

  function addProduto(over: Row = {}) {
    produtos.push({ id: "p1", storeId: STORE, sku: "SKU-1", name: "Tela", stock: 5, precoCusto: 10, price: 30, ...over })
  }

  function produtoBy({ id, storeId, sku }: { id?: string; storeId?: string; sku?: string }): Row | null {
    const hit = produtos.find((p) => {
      if (storeId !== undefined && p.storeId !== storeId) return false
      if (id !== undefined && p.id !== id) return false
      if (sku !== undefined && p.sku !== sku) return false
      return true
    })
    return hit ? { ...hit } : null
  }

  const api = {
    $queryRaw: async () => [] as unknown[],
    produto: {
      findFirst: async ({ where }: { where: Row }) => {
        if (typeof where.id === "string") return produtoBy({ id: where.id as string, storeId: where.storeId as string })
        if (typeof where.sku === "string") return produtoBy({ sku: where.sku as string, storeId: where.storeId as string })
        const ors = (where.OR ?? []) as Row[]
        for (const c of ors) {
          const hit = produtoBy({ id: c.id as string | undefined, storeId: where.storeId as string, sku: c.sku as string | undefined })
          if (hit) return hit
        }
        return produtoBy({ storeId: where.storeId as string })
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const hit = produtos.find((p) => p.id === where.id)
        return hit ? { id: hit.id as string, storeId: hit.storeId as string } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const hit = produtos.find((p) => p.id === where.id)
        if (!hit) throw new Error("P2025")
        const stockData = data.stock as number | { increment?: number; decrement?: number } | undefined
        if (typeof stockData === "number") hit.stock = stockData
        else if (typeof stockData?.increment === "number") hit.stock = ((hit.stock as number) ?? 0) + stockData.increment
        else if (typeof stockData?.decrement === "number") hit.stock = ((hit.stock as number) ?? 0) - stockData.decrement
        if (typeof data.precoCusto === "number") hit.precoCusto = data.precoCusto
        return hit
      },
    },
    deposito: {
      findFirst: async ({ where }: { where: Row }) => depositos.find((d) => d.storeId === where.storeId) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => depositos.find((d) => d.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => {
        const d = { id: `dep-${++seq}`, storeId: data.storeId }
        depositos.push(d)
        return d
      },
    },
    produtoDeposito: {
      findMany: async ({ where }: { where: Row }) =>
        pds
          .filter((r) => r.storeId === where.storeId && (where.produtoId === undefined || r.produtoId === where.produtoId))
          .map((r) => ({ depositoId: r.depositoId, quantidade: r.quantidade })),
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const key = where.produtoId_depositoId as Row
        const ex = pds.find((r) => r.produtoId === key.produtoId && r.depositoId === key.depositoId)
        if (ex) ex.quantidade = update.quantidade as number
        else {
          pds.push({
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
        if (where.idempotencyKey !== undefined) {
          return movs.find((m) => m.storeId === where.storeId && (m.idempotencyKey ?? null) === where.idempotencyKey) ?? null
        }
        return movs.find((m) => m.storeId === where.storeId) ?? null
      },
      create: async ({ data }: { data: Row }) => {
        const key = (data.idempotencyKey ?? null) as string | null
        if (key && movs.some((m) => m.storeId === data.storeId && (m.idempotencyKey ?? null) === key)) {
          const e = new Error("Unique constraint failed") as Error & { code: string; name: string }
          e.code = "P2002"
          e.name = "PrismaClientKnownRequestError"
          throw e
        }
        const row = { id: `mov-${++seq}`, ...data }
        movs.push(row)
        return { id: row.id }
      },
    },
    ordemServico: {
      findFirst: async ({ where }: { where: Row }) => {
        const hit = osRows.get(String(where.id))
        if (!hit || hit.storeId !== where.storeId) return null
        return { id: hit.id, storeId: hit.storeId, numero: hit.numero ?? null, payload: hit.payload }
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const hit = osRows.get(where.id)
        if (hit) Object.assign(hit, data)
        return hit ?? {}
      },
    },
    ordemServicoItem: {
      findMany: async ({ where }: { where: Row }) => osItems.filter((it) => it.ordemServicoId === where.ordemServicoId),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `osi-${++seq}`, ...data }
        osItems.push(row)
        return row
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = osItems.length
        for (let i = osItems.length - 1; i >= 0; i -= 1) {
          if (osItems[i]!.ordemServicoId === where.ordemServicoId) osItems.splice(i, 1)
        }
        return { count: before - osItems.length }
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = osItems.findIndex((it) => it.id === where.id)
        if (idx >= 0) osItems.splice(idx, 1)
        return {}
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const hit = osItems.find((it) => it.id === where.id)
        if (hit) Object.assign(hit, data)
        return hit ?? {}
      },
    },
  }

  const prisma = { ...api, $transaction: async (fn: (t: typeof api) => Promise<unknown>) => fn(api) }

  function addOS(id: string, payload: Row, numero: string | null = "OS-001") {
    osRows.set(id, { id, storeId: STORE, numero, payload })
  }

  return { STORE, produtos, movs, pds, osItems, reset, addProduto, addOS, prisma }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))

import { consumeEstoqueFromOS, restoreEstoqueFromOS, applyEstoqueDelta } from "./os-estoque"

function osPayload(pecas: Row[]): Row {
  return { id: "os-1", storeId: h.STORE, status: "aberta", pecas }
}

beforeEach(() => {
  h.reset()
})

describe("os-estoque via boundary (CAD-R2-009)", () => {
  it("23. peça física baixa stock + depósito + ledger `saida`; retry é already_consumed", async () => {
    h.addProduto({ stock: 5 })
    h.addOS("os-1", osPayload([{ id: "peca-1", produtoId: "p1", nome: "Tela", quantidade: 2 }]))

    const r = await consumeEstoqueFromOS({ storeId: h.STORE, osId: "os-1", operador: "Tecnico" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.status).toBe("consumed")
    expect(h.produtos[0]!.stock).toBe(3)
    let soma = 0
    for (const pd of h.pds) soma += pd.quantidade
    expect(soma).toBe(3)
    expect(h.movs).toHaveLength(1)
    expect(h.movs[0]).toMatchObject({
      produtoId: "p1",
      tipo: "saida",
      origem: "os",
      quantidade: -2,
      estoqueAntes: 5,
      estoqueDepois: 3,
    })
    expect(h.osItems).toHaveLength(1)

    const retry = await consumeEstoqueFromOS({ storeId: h.STORE, osId: "os-1", operador: "Tecnico" })
    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.status).toBe("already_consumed")
    expect(h.produtos[0]!.stock).toBe(3)
    expect(h.movs).toHaveLength(1)
  })

  it("24. OS só de serviço (sem peça física) não cria movimento nem toca saldo", async () => {
    h.addProduto({ stock: 5 })
    h.addOS("os-1", osPayload([]))

    const r = await consumeEstoqueFromOS({ storeId: h.STORE, osId: "os-1", operador: "Tecnico" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.status).toBe("nothing_to_consume")
    expect(h.produtos[0]!.stock).toBe(5)
    expect(h.movs).toHaveLength(0)
    expect(h.osItems).toHaveLength(0)
  })

  it("estorno gera ENTRADA compensatória e é idempotente (segunda chamada não duplica)", async () => {
    h.addProduto({ stock: 5 })
    h.addOS("os-1", osPayload([{ id: "peca-1", produtoId: "p1", nome: "Tela", quantidade: 2 }]))

    const c = await consumeEstoqueFromOS({ storeId: h.STORE, osId: "os-1" })
    expect(c.ok).toBe(true)
    expect(h.produtos[0]!.stock).toBe(3)

    const r1 = await restoreEstoqueFromOS({ storeId: h.STORE, osId: "os-1", motivo: "automatico" })
    expect(r1.ok).toBe(true)
    expect(h.produtos[0]!.stock).toBe(5)
    expect(h.movs).toHaveLength(2)
    expect(h.movs[1]).toMatchObject({ produtoId: "p1", tipo: "entrada", origem: "os", quantidade: 2 })
    expect(h.osItems).toHaveLength(0)

    const r2 = await restoreEstoqueFromOS({ storeId: h.STORE, osId: "os-1", motivo: "automatico" })
    expect(r2.ok).toBe(true)
    expect(h.produtos[0]!.stock).toBe(5)
    expect(h.movs).toHaveLength(2)
  })

  it("delta de revisão aplica consumo parcial com chave por revisão; replay é already_applied", async () => {
    h.addProduto({ stock: 5 })
    h.addOS("os-1", osPayload([{ id: "peca-1", produtoId: "p1", nome: "Tela", quantidade: 2 }]))
    const c = await consumeEstoqueFromOS({ storeId: h.STORE, osId: "os-1" })
    expect(c.ok).toBe(true)

    const d = await applyEstoqueDelta({
      storeId: h.STORE,
      osId: "os-1",
      // Payload pós-consumo (com a flag que o consume persistiu) + peça revisada 2 → 3.
      osPayload: {
        ...osPayload([{ id: "peca-1", produtoId: "p1", nome: "Tela", quantidade: 3 }]),
        estoqueConsumido: true,
      } as never,
      revisaoKey: "REV-2",
    })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.status).toBe("applied")
    expect(h.produtos[0]!.stock).toBe(2)
    expect(h.movs).toHaveLength(2)

    const replay = await applyEstoqueDelta({
      storeId: h.STORE,
      osId: "os-1",
      revisaoKey: "REV-2",
    })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.status).toBe("already_applied")
    expect(h.movs).toHaveLength(2)
  })

  it("cross-store falha fechado (OS de outra loja)", async () => {
    h.addProduto({ stock: 5 })
    h.addOS("os-1", osPayload([{ id: "peca-1", produtoId: "p1", nome: "Tela", quantidade: 2 }]))
    const r = await consumeEstoqueFromOS({ storeId: "loja-OUTRA", osId: "os-1" })
    expect(r.ok).toBe(false)
    expect(h.produtos[0]!.stock).toBe(5)
    expect(h.movs).toHaveLength(0)
  })
})
