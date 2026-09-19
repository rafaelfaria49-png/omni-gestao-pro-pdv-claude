/**
 * CAD-R2-009 — Testes do Stock/Ledger boundary canônico.
 * Fake em memória, sem banco. Prova: ownership, lock FOR UPDATE, idempotência
 * DB-forte + conflito, drift, custo, bootstrap, rollback via $transaction.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  applyStockMutation,
  applyStockMutationTx,
  type StockLedgerTx,
} from "@/lib/estoque/stock-ledger-service"
import type { StockLedgerContext } from "@/lib/estoque/stock-ledger-contract"

// ─── Fake ────────────────────────────────────────────────────────────────────

type ProdRow = { id: string; storeId: string; name: string; sku: string | null; stock: number; precoCusto: number }
type DepRow = { id: string; storeId: string }
type PDRow = { produtoId: string; depositoId: string; storeId: string; quantidade: number }
type MovRow = {
  id: string
  storeId: string
  produtoId: string | null
  tipo: string
  quantidade: number
  documento: string | null
  motivo: string | null
  custoUnitario: number
  estoqueAntes: number
  estoqueDepois: number
  custoMedioAntes: number
  custoMedioDepois: number
  origem: string
  idempotencyKey: string | null
  createdAt: number
}

function makeFake(opts?: {
  produtos?: ProdRow[]
  depositos?: DepRow[]
  pds?: PDRow[]
  movs?: MovRow[]
  failLedgerCreate?: boolean
  failLedgerCreateAfter?: number
  skipIdempotencyPrecheckOnce?: boolean
}) {
  const produtos = new Map((opts?.produtos ?? []).map((p) => [p.id, { ...p }]))
  const depositos = new Map((opts?.depositos ?? []).map((d) => [d.id, { ...d }]))
  const pds = new Map((opts?.pds ?? []).map((r) => [`${r.produtoId}|${r.depositoId}`, { ...r }]))
  const movs = new Map((opts?.movs ?? []).map((m) => [m.id, { ...m }]))
  const lockCalls: string[] = []
  let movSeq = 100
  let depSeq = 50
  const state = {
    failLedgerCreate: opts?.failLedgerCreate ?? false,
    failLedgerCreateAfter: opts?.failLedgerCreateAfter,
    ledgerCreates: 0,
    skipIdempotencyPrecheckOnce: opts?.skipIdempotencyPrecheckOnce ?? false,
  }

  function matchProdFirst(where: Record<string, unknown>): ProdRow | null {
    for (const p of produtos.values()) {
      if (where.id !== undefined && p.id !== where.id) continue
      if (where.storeId !== undefined && p.storeId !== where.storeId) continue
      return p
    }
    return null
  }

  const tx: StockLedgerTx = {
    $queryRaw: (async (q: TemplateStringsArray, ..._v: unknown[]) => {
      const sql = Array.isArray(q) ? q.join(" ") : String(q)
      lockCalls.push(sql)
      if (!/FOR UPDATE/i.test(sql)) throw new Error("lock esperado com FOR UPDATE")
      return []
    }) as StockLedgerTx["$queryRaw"],
    produto: {
      findFirst: (async (args: unknown) => {
        const w = (args as { where: Record<string, unknown> }).where
        const p = matchProdFirst(w)
        return p ? { id: p.id, name: p.name, sku: p.sku, stock: p.stock, precoCusto: p.precoCusto } : null
      }) as StockLedgerTx["produto"]["findFirst"],
      findUnique: (async (args: unknown) => {
        const w = (args as { where: Record<string, unknown> }).where
        const p = produtos.get(String(w.id ?? ""))
        return p ? { id: p.id, storeId: p.storeId } : null
      }) as StockLedgerTx["produto"]["findUnique"],
      update: (async (args: unknown) => {
        const a = args as { where: { id: string }; data: { stock?: number; precoCusto?: number } }
        const p = produtos.get(a.where.id)
        if (!p) throw new Error("P2025")
        if (a.data.stock !== undefined) p.stock = a.data.stock as number
        if (a.data.precoCusto !== undefined) p.precoCusto = a.data.precoCusto as number
        return {}
      }) as StockLedgerTx["produto"]["update"],
    },
    deposito: {
      findFirst: (async (args: unknown) => {
        const w = (args as { where: Record<string, unknown> }).where
        for (const d of depositos.values()) {
          if (w.storeId !== undefined && d.storeId !== w.storeId) continue
          if (w.id !== undefined && typeof w.id === "string" && d.id !== w.id) continue
          // ensureDepositoPrincipal usa OR:[{codigo},{principal}] — aceita qualquer da loja
          if (Array.isArray((w as { OR?: unknown[] }).OR)) return { id: d.id, storeId: d.storeId }
          if (w.id !== undefined) return { id: d.id, storeId: d.storeId }
          return { id: d.id, storeId: d.storeId }
        }
        return null
      }) as StockLedgerTx["deposito"]["findFirst"],
      findUnique: (async (args: unknown) => {
        const w = (args as { where: Record<string, unknown> }).where
        const d = depositos.get(String(w.id ?? ""))
        return d ? { id: d.id, storeId: d.storeId } : null
      }) as StockLedgerTx["deposito"]["findUnique"],
      create: (async (args: unknown) => {
        const data = (args as { data: Record<string, string> }).data
        const id = `dep-${depSeq++}`
        depositos.set(id, { id, storeId: String(data.storeId) })
        return { id, storeId: String(data.storeId) }
      }) as StockLedgerTx["deposito"]["create"],
    },
    produtoDeposito: {
      findMany: (async (args: unknown) => {
        const w = (args as { where: Record<string, unknown> }).where
        const out: Array<{ depositoId: string; quantidade: number }> = []
        for (const r of pds.values()) {
          if (w.storeId !== undefined && r.storeId !== w.storeId) continue
          if (w.produtoId !== undefined && r.produtoId !== w.produtoId) continue
          out.push({ depositoId: r.depositoId, quantidade: r.quantidade })
        }
        return out
      }) as StockLedgerTx["produtoDeposito"]["findMany"],
      upsert: (async (args: unknown) => {
        const a = args as {
          where: { produtoId_depositoId: { produtoId: string; depositoId: string } }
          create: { storeId: string; produtoId: string; depositoId: string; quantidade: number }
          update: { quantidade: number }
        }
        const k = `${a.where.produtoId_depositoId.produtoId}|${a.where.produtoId_depositoId.depositoId}`
        const ex = pds.get(k)
        if (ex) ex.quantidade = a.update.quantidade
        else pds.set(k, { storeId: a.create.storeId, produtoId: a.create.produtoId, depositoId: a.create.depositoId, quantidade: a.create.quantidade ?? a.update.quantidade })
        return {}
      }) as StockLedgerTx["produtoDeposito"]["upsert"],
    },
    movimentacaoEstoque: {
      findFirst: (async (args: unknown) => {
        const a = args as { where?: Record<string, unknown>; orderBy?: { createdAt?: string } }
        const w = a.where ?? {}
        const hits: MovRow[] = []
        for (const m of movs.values()) {
          if (w.storeId !== undefined && m.storeId !== w.storeId) continue
          if (w.produtoId !== undefined && m.produtoId !== w.produtoId) continue
          if (w.idempotencyKey !== undefined && m.idempotencyKey !== w.idempotencyKey) continue
          hits.push(m)
        }
        if (w.idempotencyKey !== undefined && state.skipIdempotencyPrecheckOnce) {
          state.skipIdempotencyPrecheckOnce = false
          return null
        }
        if (a.orderBy?.createdAt === "desc") {
          hits.sort((x, y) => y.createdAt - x.createdAt)
        }
        return hits[0] ? { ...hits[0] } : null
      }) as StockLedgerTx["movimentacaoEstoque"]["findFirst"],
      create: (async (args: unknown) => {
        if (state.failLedgerCreate) throw new Error("LEDGER_FAIL")
        state.ledgerCreates += 1
        if (state.failLedgerCreateAfter != null && state.ledgerCreates > state.failLedgerCreateAfter) {
          throw new Error("LEDGER_FAIL_AFTER")
        }
        const data = (args as { data: Record<string, unknown> }).data
        // unique (storeId, idempotencyKey) — NULL não conflita
        const key = (data.idempotencyKey ?? null) as string | null
        if (key) {
          for (const m of movs.values()) {
            if (m.storeId === data.storeId && m.idempotencyKey === key) {
              const e = new Error("Unique constraint") as Error & { code: string; name: string }
              e.code = "P2002"
              e.name = "PrismaClientKnownRequestError"
              throw e
            }
          }
        }
        const id = `mov-${movSeq++}`
        movs.set(id, {
          id,
          storeId: String(data.storeId),
          produtoId: (data.produtoId ?? null) as string | null,
          tipo: String(data.tipo),
          quantidade: Number(data.quantidade),
          documento: (data.documento ?? null) as string | null,
          motivo: (data.motivo ?? null) as string | null,
          custoUnitario: Number(data.custoUnitario ?? 0),
          estoqueAntes: Number(data.estoqueAntes),
          estoqueDepois: Number(data.estoqueDepois),
          custoMedioAntes: Number(data.custoMedioAntes),
          custoMedioDepois: Number(data.custoMedioDepois),
          origem: String(data.origem ?? "manual"),
          idempotencyKey: key,
          createdAt: Date.now() + movSeq,
        })
        return { id }
      }) as StockLedgerTx["movimentacaoEstoque"]["create"],
    },
  }

  // $transaction com rollback por snapshot (para teste 17).
  const db = {
    $transaction: async <T>(fn: (t: StockLedgerTx) => Promise<T>): Promise<T> => {
      const snapP = new Map([...produtos].map(([k, v]) => [k, { ...v }]))
      const snapPd = new Map([...pds].map(([k, v]) => [k, { ...v }]))
      const snapM = new Map([...movs].map(([k, v]) => [k, { ...v }]))
      try {
        return await fn(tx)
      } catch (e) {
        produtos.clear()
        for (const [k, v] of snapP) produtos.set(k, v)
        pds.clear()
        for (const [k, v] of snapPd) pds.set(k, v)
        movs.clear()
        for (const [k, v] of snapM) movs.set(k, v)
        throw e
      }
    },
  }

  return { tx, db, produtos, depositos, pds, movs, lockCalls, state }
}

const ctx = (storeId = "loja-a"): StockLedgerContext => ({ storeId, principal: null, source: "test" })
const prod = (over?: Partial<ProdRow>): ProdRow => ({
  id: "p1",
  storeId: "loja-a",
  name: "Peça",
  sku: "SKU-1",
  stock: 10,
  precoCusto: 5,
  ...over,
})

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("stock-ledger-service — core", () => {
  it("1. entrada válida atualiza stock + depósito + ledger", async () => {
    const f = makeFake({ produtos: [prod()], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 5, custoUnitario: 10, origem: "manual" }, { db: f.db })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estoqueAntes).toBe(10)
    expect(r.estoqueDepois).toBe(15)
    expect(f.produtos.get("p1")?.stock).toBe(15)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(15)
    expect(f.movs.size).toBe(1)
    expect(f.lockCalls.length).toBeGreaterThan(0)
  })

  it("2. saída válida", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 4, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estoqueDepois).toBe(6)
    expect(f.produtos.get("p1")?.stock).toBe(6)
  })

  it("3. ajuste absoluto", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "ajuste", produtoId: "p1", novoSaldo: 3, origem: "inventario", motivo: "contagem" }, { db: f.db })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quantidade).toBe(-7)
    expect(f.produtos.get("p1")?.stock).toBe(3)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
  })

  it("4. cross-store produto bloqueado", async () => {
    const f = makeFake({ produtos: [prod({ id: "p1", storeId: "loja-b" })], depositos: [{ id: "d1", storeId: "loja-a" }] })
    const r = await applyStockMutation(ctx("loja-a"), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("CROSS_STORE")
    expect(f.movs.size).toBe(0)
  })

  it("5. cross-store depósito bloqueado", async () => {
    const f = makeFake({ produtos: [prod()], depositos: [{ id: "dX", storeId: "loja-b" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", depositoId: "dX" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("CROSS_STORE")
  })

  it("6/7/8/9. ledger append-only + sync stock/depósito/soma", async () => {
    const f = makeFake({ produtos: [prod({ stock: 5 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }] })
    const r1 = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual" }, { db: f.db })
    const r2 = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv" }, { db: f.db })
    expect(r1.ok && r2.ok).toBe(true)
    expect(f.movs.size).toBe(2)
    const stock = f.produtos.get("p1")?.stock
    let soma = 0
    for (const r of f.pds.values()) soma += r.quantidade
    expect(stock).toBe(6)
    expect(soma).toBe(stock)
  })

  it("10. bootstrap legado sem row materializa principal", async () => {
    const f = makeFake({ produtos: [prod({ stock: 7 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 2, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(5)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(1) // bootstrap não gera ledger extra
  })

  it("11. drift pré-existente bloqueia, não corrige", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.movs.size).toBe(0)
  })

  it("11c. SUM>stock sem flag continua fail-closed", async () => {
    const f = makeFake({ produtos: [prod({ stock: 4 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(0)
  })

  it("11d. PDV saida com realinharDepositoAoStock: SUM=5 stock=4 → alinha e baixa 1", async () => {
    const f = makeFake({ produtos: [prod({ stock: 4 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(3)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
    const origens = [...f.movs.values()].map((m) => m.origem).sort()
    expect(origens).toEqual(["estoque-reconcile", "pdv"])
    expect(f.movs.size).toBe(2)
  })

  it("11e. linha zero + flag materializa e baixa (equivalente ao bootstrap)", async () => {
    const f = makeFake({ produtos: [prod({ stock: 7 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 0 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(6)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(6)
  })

  it("11f. SUM<stock sem livro e depósito com saldo continua bloqueado mesmo com flag", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(r.drift?.driftReason).toBe("unproven_without_ledger")
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.movs.size).toBe(0)
  })

  it("11g. SUM<stock com livro casando com stock: alinha depósito e baixa", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 10 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [{
        id: "m-seed",
        storeId: "loja-a",
        produtoId: "p1",
        tipo: "entrada",
        quantidade: 10,
        documento: null,
        motivo: null,
        custoUnitario: 0,
        estoqueAntes: 0,
        estoqueDepois: 10,
        custoMedioAntes: 5,
        custoMedioDepois: 5,
        origem: "cadastro",
        idempotencyKey: null,
        createdAt: 1,
      }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true, idempotencyKey: "pdv:v20:p1" },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(9)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(9)
    const retry = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true, idempotencyKey: "pdv:v20:p1" },
      { db: f.db },
    )
    expect(retry.ok).toBe(true)
    if (retry.ok) expect(retry.idempotente).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(9)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(9)
  })

  it("11h. principal não absorve: zero mutação e diagnóstico", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 1 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 5 },
      ],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true, depositoId: "d1" },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.drift?.driftReason).toBe("multi_deposit_ambiguous")
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(1)
    expect(f.pds.get("p1|d2")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(0)
  })

  it("11h2. overhang absorvível no principal com segundo depósito positivo não muta", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 6 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 6 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 2 },
      ],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true, depositoId: "d1" },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.drift?.driftReason).toBe("multi_deposit_ambiguous")
    expect(f.produtos.get("p1")?.stock).toBe(6)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(6)
    expect(f.pds.get("p1|d2")?.quantidade).toBe(2)
    expect(f.movs.size).toBe(0)
  })

  it("11i. livro casa com a soma: corrige cache e baixa", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 10 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [{
        id: "m-seed",
        storeId: "loja-a",
        produtoId: "p1",
        tipo: "saida",
        quantidade: -6,
        documento: null,
        motivo: null,
        custoUnitario: 0,
        estoqueAntes: 10,
        estoqueDepois: 4,
        custoMedioAntes: 5,
        custoMedioDepois: 5,
        origem: "pdv",
        idempotencyKey: null,
        createdAt: 1,
      }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(3)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
  })

  it("11j. insuficiente após repair comprovável não persiste a correção", async () => {
    const f = makeFake({ produtos: [prod({ stock: 4 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 10, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("INSUFFICIENT_STOCK")
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(0)
  })

  it("11k. rollback da correção se o ledger comercial falhar depois", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }],
      failLedgerCreateAfter: 1,
    })
    await expect(
      f.db.$transaction(async (tx) => {
        const r = await applyStockMutationTx(tx, ctx(), {
          kind: "saida",
          produtoId: "p1",
          quantidade: 1,
          origem: "pdv",
          realinharDepositoAoStock: true,
        })
        if (!r.ok) throw new Error(`${r.code}`)
        return r
      }),
    ).rejects.toThrow(/LEDGER_FAIL_AFTER|PERSISTENCE/)
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
  })

  it("11k2. P2002 após writes aborta e o replay lê o vencedor durável", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }],
    })
    const first = await applyStockMutation(
      ctx(),
      {
        kind: "saida",
        produtoId: "p1",
        quantidade: 1,
        origem: "pdv",
        realinharDepositoAoStock: true,
        idempotencyKey: "pdv:v-p2002:p1",
      },
      { db: f.db },
    )
    expect(first.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(3)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
    const movCount = f.movs.size
    f.state.skipIdempotencyPrecheckOnce = true
    const retry = await applyStockMutation(
      ctx(),
      {
        kind: "saida",
        produtoId: "p1",
        quantidade: 1,
        origem: "pdv",
        realinharDepositoAoStock: true,
        idempotencyKey: "pdv:v-p2002:p1",
      },
      { db: f.db },
    )
    expect(retry.ok).toBe(true)
    if (retry.ok) expect(retry.idempotente).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(3)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
    expect(f.movs.size).toBe(movCount)
  })

  it("11l. duas lojas: drift em A não altera B", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 }), prod({ id: "p2", storeId: "loja-b", stock: 8 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-b" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 },
        { produtoId: "p2", depositoId: "d2", storeId: "loja-b", quantidade: 8 },
      ],
    })
    const blocked = await applyStockMutation(ctx("loja-a"), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv" }, { db: f.db })
    const other = await applyStockMutation(ctx("loja-b"), { kind: "saida", produtoId: "p2", quantidade: 1, origem: "pdv", depositoId: "d2" }, { db: f.db })
    expect(blocked.ok).toBe(false)
    expect(other.ok).toBe(true)
    expect(f.produtos.get("p2")?.stock).toBe(7)
    expect(f.pds.get("p2|d2")?.quantidade).toBe(7)
  })

  it("11m. múltiplos depósitos alinhados vendem no alvo", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 6 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 2 },
      ],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", depositoId: "d1", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(5)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(3)
    expect(f.pds.get("p1|d2")?.quantidade).toBe(2)
  })

  it("11n. ajuste humano fecha SUM<stock sem livro no depósito único (decisão explícita)", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "ajuste", produtoId: "p1", novoSaldo: 8, origem: "manual", motivo: "contagem" },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(8)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(8)
    expect(f.movs.size).toBe(1)
  })

  it("11o. ajuste humano com linha zero materializa o saldo decidido", async () => {
    const f = makeFake({ produtos: [prod({ stock: 7 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 0 }] })
    const r = await applyStockMutation(
      ctx(),
      { kind: "ajuste", produtoId: "p1", novoSaldo: 7, origem: "inventario", motivo: "espelho" },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(7)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(7)
  })

  it("11p. ajuste bloqueia quando outros depósitos já excedem o novo saldo", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 1 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 5 },
      ],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "ajuste", produtoId: "p1", novoSaldo: 4, origem: "manual", motivo: "tentativa", depositoId: "d1" },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(1)
    expect(f.movs.size).toBe(0)
  })

  it("11q. entrada com drift continua fail-closed", async () => {
    const f = makeFake({ produtos: [prod({ stock: 4 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 5 }] })
    const r = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 1, origem: "manual" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(0)
  })

  it("11r. livro em conflito com os dois lados: zero mutação", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 10 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [{
        id: "m-seed",
        storeId: "loja-a",
        produtoId: "p1",
        tipo: "ajuste",
        quantidade: 7,
        documento: null,
        motivo: null,
        custoUnitario: 0,
        estoqueAntes: 0,
        estoqueDepois: 7,
        custoMedioAntes: 5,
        custoMedioDepois: 5,
        origem: "manual",
        idempotencyKey: null,
        createdAt: 1,
      }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.drift?.driftReason).toBe("ledger_conflict")
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.movs.size).toBe(1)
  })

  it("11s. undercount com dois depósitos positivos: zero mutação", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 10 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 2 },
      ],
      movs: [{
        id: "m-seed",
        storeId: "loja-a",
        produtoId: "p1",
        tipo: "entrada",
        quantidade: 10,
        documento: null,
        motivo: null,
        custoUnitario: 0,
        estoqueAntes: 0,
        estoqueDepois: 10,
        custoMedioAntes: 5,
        custoMedioDepois: 5,
        origem: "cadastro",
        idempotencyKey: null,
        createdAt: 1,
      }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", realinharDepositoAoStock: true, depositoId: "d1" },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.drift?.driftReason).toBe("multi_deposit_ambiguous")
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.pds.get("p1|d2")?.quantidade).toBe(2)
    expect(f.movs.size).toBe(1)
  })

  it("12. saída insuficiente bloqueada (agregado e depósito)", async () => {
    const f = makeFake({ produtos: [prod({ stock: 1 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 1 }] })
    const r = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 2, origem: "pdv" }, { db: f.db })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("INSUFFICIENT_STOCK")
    expect(f.produtos.get("p1")?.stock).toBe(1)
    expect(f.movs.size).toBe(0)
  })

  it("13. concorrência: stock=1, duas saídas de 1 — uma PASS, uma INSUFFICIENT, sem negativo", async () => {
    const f = makeFake({ produtos: [prod({ stock: 1 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 1 }] })
    const a = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", idempotencyKey: "pdv:v1:p1" }, { db: f.db })
    const b = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 1, origem: "pdv", idempotencyKey: "pdv:v2:p1" }, { db: f.db })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(false)
    if (b.ok) return
    expect(b.code).toBe("INSUFFICIENT_STOCK")
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.movs.size).toBe(1)
    // guard de código: lock FOR UPDATE em TODA mutation
    expect(f.lockCalls.length).toBe(2)
  })

  it("13b. duas entradas simultâneas — nenhuma atualização perdida", async () => {
    const f = makeFake({ produtos: [prod({ stock: 0 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 0 }] })
    await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 3, origem: "manual" }, { db: f.db })
    await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 4, origem: "manual" }, { db: f.db })
    expect(f.produtos.get("p1")?.stock).toBe(7)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(7)
  })

  it("14. entrada atualiza custo médio ponderado", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10, precoCusto: 5 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 10, custoUnitario: 15, origem: "manual" }, { db: f.db })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.custoMedioDepois).toBe(10) // (10*5+10*15)/20
    expect(f.produtos.get("p1")?.precoCusto).toBe(10)
  })

  it("14b. entrada sem custo preserva custo", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10, precoCusto: 5 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 5, origem: "manual" }, { db: f.db })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.custoMedioDepois).toBe(5)
  })

  it("15/16. saída e ajuste preservam custo médio", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10, precoCusto: 8 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const s = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 3, origem: "pdv" }, { db: f.db })
    expect(s.ok).toBe(true)
    if (!s.ok) return
    expect(s.custoMedioDepois).toBe(8)
    const a = await applyStockMutation(ctx(), { kind: "ajuste", produtoId: "p1", novoSaldo: 9, origem: "inventario", motivo: "x" }, { db: f.db })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(a.custoMedioDepois).toBe(8)
    expect(f.produtos.get("p1")?.precoCusto).toBe(8)
  })

  it("17. LEDGER_FAILURE_ROLLS_BACK_STOCK via $transaction", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }], failLedgerCreate: true })
    // Tx variant dentro de transação maior que falha no ledger → caller faz throw → rollback
    await expect(
      f.db.$transaction(async (tx) => {
        const r = await (await import("@/lib/estoque/stock-ledger-service")).applyStockMutationTx(tx, ctx(), {
          kind: "entrada",
          produtoId: "p1",
          quantidade: 5,
          origem: "manual",
        })
        if (!r.ok) throw new Error(`ledger:${r.code}`)
      }),
    ).rejects.toThrow()
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.movs.size).toBe(0)
  })

  it("18. idempotency retry não duplica", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const cmd = { kind: "saida", produtoId: "p1", quantidade: 2, origem: "pdv", documento: "v1", motivo: "v1", idempotencyKey: "pdv:v1:p1" } as const
    const r1 = await applyStockMutation(ctx(), cmd, { db: f.db })
    const r2 = await applyStockMutation(ctx(), cmd, { db: f.db })
    expect(r1.ok && r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return
    expect(r1.idempotente).toBe(false)
    expect(r2.idempotente).toBe(true)
    expect(r2.movimentacaoId).toBe(r1.movimentacaoId)
    expect(f.produtos.get("p1")?.stock).toBe(8)
    expect(f.movs.size).toBe(1)
  })

  it("19. idempotency conflict bloqueia", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const r1 = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 2, origem: "pdv", documento: "v1", motivo: "v1", idempotencyKey: "K" }, { db: f.db })
    expect(r1.ok).toBe(true)
    const r2 = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 5, origem: "pdv", documento: "v1", motivo: "v1", idempotencyKey: "K" }, { db: f.db })
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.code).toBe("IDEMPOTENCY_CONFLICT")
    expect(f.produtos.get("p1")?.stock).toBe(8)
  })

  it("20/21. reversão compensatória + retry de cancelamento não duplica", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const venda = await applyStockMutation(ctx(), { kind: "saida", produtoId: "p1", quantidade: 2, origem: "pdv", documento: "v9", motivo: "v9", idempotencyKey: "pdv:v9:p1" }, { db: f.db })
    expect(venda.ok).toBe(true)
    const canc = { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "cancelamento_pdv", documento: "v9", motivo: "Cancelamento venda v9", idempotencyKey: "cancelamento-pdv:v9:p1" } as const
    const c1 = await applyStockMutation(ctx(), canc, { db: f.db })
    const c2 = await applyStockMutation(ctx(), canc, { db: f.db })
    expect(c1.ok && c2.ok).toBe(true)
    if (!c1.ok || !c2.ok) return
    expect(c2.idempotente).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(10)
    expect(f.movs.size).toBe(2) // saída + 1 entrada (sem duplicar)
  })

  it("25. inventário aplica uma vez (sessão/produto)", async () => {
    const f = makeFake({ produtos: [prod({ stock: 10 })], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 10 }] })
    const cmd = { kind: "ajuste", produtoId: "p1", novoSaldo: 12, origem: "inventario", motivo: "sessao S", idempotencyKey: "inventario:S:p1" } as const
    const r1 = await applyStockMutation(ctx(), cmd, { db: f.db })
    const r2 = await applyStockMutation(ctx(), cmd, { db: f.db })
    expect(r1.ok && r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return
    expect(r2.idempotente).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(12)
    expect(f.movs.size).toBe(1)
  })

  it("28. contexto não confiável + audit não spoofável", async () => {
    const f = makeFake({ produtos: [prod()], depositos: [{ id: "d1", storeId: "loja-a" }], pds: [] })
    const bad = await applyStockMutation({ storeId: "  ", principal: null, source: "x" }, { kind: "entrada", produtoId: "p1", quantidade: 1, origem: "manual" }, { db: f.db })
    expect(bad.ok).toBe(false)
    // comando não possui campo de ator — autoridade vem só do contexto:
    // mesmo com `usuario` extra no objeto, a normalização ignora (sem spoof).
    const { normalizeStockCommand: norm } = await import("@/lib/estoque/stock-ledger-contract")
    const n = norm({ kind: "entrada", produtoId: "p1", quantidade: 1, origem: "manual", usuario: "hacker" } as unknown as Parameters<typeof norm>[0])
    expect((n as Record<string, unknown>).usuario).toBeUndefined()
  })

  function seedLedger(estoqueDepois: number): MovRow {
    return {
      id: "m-seed",
      storeId: "loja-a",
      produtoId: "p1",
      tipo: "saida",
      quantidade: -1,
      documento: null,
      motivo: null,
      custoUnitario: 0,
      estoqueAntes: estoqueDepois + 1,
      estoqueDepois,
      custoMedioAntes: 12.5,
      custoMedioDepois: 12.5,
      origem: "pdv",
      idempotencyKey: null,
      createdAt: 1,
    }
  }

  it("A. stock=0 depósito=4 livro prova 0 · Entrada +2 reconcilia 4→0 e entra 0→2", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0, precoCusto: 12.5 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [seedLedger(0)],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, custoUnitario: 12.5, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.structuralRepairApplied).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(2)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(2)
    const origens = [...f.movs.values()].map((m) => m.origem).sort()
    expect(origens).toEqual(["manual", "estoque-reconcile", "pdv"].sort())
    const reconcile = [...f.movs.values()].find((m) => m.origem === "estoque-reconcile")
    const entrada = [...f.movs.values()].find((m) => m.origem === "manual")
    expect(reconcile?.tipo).toBe("ajuste")
    expect(entrada?.quantidade).toBe(2)
    expect(entrada?.estoqueAntes).toBe(0)
    expect(entrada?.estoqueDepois).toBe(2)
  })

  it("B. stock=4 depósito=0 livro prova 4 · Entrada +2 → 6", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 4 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 0 }],
      movs: [seedLedger(4)],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(6)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(6)
  })

  it("C. stock=0 depósito=4 sem livro · Entrada bloqueada · zero writes", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.movs.size).toBe(0)
  })

  it("D. C → Ajuste total=2 → Entrada +2 → final 4", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
    })
    const blocked = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(blocked.ok).toBe(false)
    const adj = await applyStockMutation(
      ctx(),
      { kind: "ajuste", produtoId: "p1", novoSaldo: 2, origem: "manual", motivo: "contagem física" },
      { db: f.db },
    )
    expect(adj.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(2)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(2)
    const ent = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(ent.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(4)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
  })

  it("E. multi-depósito ambíguo · Entrada não corta nenhum bin", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-a" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 },
        { produtoId: "p1", depositoId: "d2", storeId: "loja-a", quantidade: 2 },
      ],
      movs: [seedLedger(0)],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true, depositoId: "d1" },
      { db: f.db },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.drift?.driftReason).toBe("multi_deposit_ambiguous")
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.pds.get("p1|d2")?.quantidade).toBe(2)
    expect([...f.movs.values()].filter((m) => m.id !== "m-seed")).toHaveLength(0)
  })

  it("F. entrada alinhada sem drift preserva comportamento", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 3 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 3 }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.structuralRepairApplied).toBeFalsy()
    expect(f.produtos.get("p1")?.stock).toBe(5)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.movs.size).toBe(1)
  })

  it("G. custo médio 2@10 + entrada 2@20 = 15 também após reconcile", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 2, precoCusto: 10 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 2 }],
    })
    const r = await applyStockMutation(
      ctx(),
      { kind: "entrada", produtoId: "p1", quantidade: 2, custoUnitario: 20, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.custoMedioDepois).toBe(15)
    expect(f.produtos.get("p1")?.precoCusto).toBe(15)
  })

  it("H. falha depois do repair estrutural de Entrada faz rollback integral", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [seedLedger(0)],
      failLedgerCreateAfter: 1,
    })
    await expect(
      f.db.$transaction(async (tx) => {
        const r = await applyStockMutationTx(tx, ctx(), {
          kind: "entrada",
          produtoId: "p1",
          quantidade: 2,
          origem: "manual",
          realinharDepositoAoStock: true,
        })
        if (!r.ok) throw new Error(r.code)
        return r
      }),
    ).rejects.toThrow()
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
    expect(f.movs.size).toBe(1)
  })

  it("I. retry/idempotência de Entrada com reconcile não duplica", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [seedLedger(0)],
    })
    const cmd = {
      kind: "entrada" as const,
      produtoId: "p1",
      quantidade: 2,
      origem: "manual" as const,
      realinharDepositoAoStock: true,
      idempotencyKey: "entrada:nf-1:p1",
    }
    const r1 = await applyStockMutation(ctx(), cmd, { db: f.db })
    const r2 = await applyStockMutation(ctx(), cmd, { db: f.db })
    expect(r1.ok && r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return
    expect(r2.idempotente).toBe(true)
    expect(r2.movimentacaoId).toBe(r1.movimentacaoId)
    expect(f.produtos.get("p1")?.stock).toBe(2)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(2)
    expect([...f.movs.values()].filter((m) => m.origem === "manual")).toHaveLength(1)
  })

  it("J. duas entradas concorrentes após baseline · lock FOR UPDATE · saldo 0+2+3=5", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 0 }],
    })
    const a = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", idempotencyKey: "e1" }, { db: f.db })
    const b = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 3, origem: "manual", idempotencyKey: "e2" }, { db: f.db })
    expect(a.ok && b.ok).toBe(true)
    expect(f.produtos.get("p1")?.stock).toBe(5)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(5)
    expect(f.lockCalls.length).toBe(2)
  })

  it("K. isolate loja A / loja B na Entrada com drift", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 }), prod({ id: "p2", storeId: "loja-b", stock: 8, sku: "B" })],
      depositos: [{ id: "d1", storeId: "loja-a" }, { id: "d2", storeId: "loja-b" }],
      pds: [
        { produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 },
        { produtoId: "p2", depositoId: "d2", storeId: "loja-b", quantidade: 8 },
      ],
    })
    const blocked = await applyStockMutation(
      ctx("loja-a"),
      { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true },
      { db: f.db },
    )
    const other = await applyStockMutation(
      ctx("loja-b"),
      { kind: "entrada", produtoId: "p2", quantidade: 1, origem: "manual", depositoId: "d2", realinharDepositoAoStock: true },
      { db: f.db },
    )
    expect(blocked.ok).toBe(false)
    expect(other.ok).toBe(true)
    expect(f.produtos.get("p2")?.stock).toBe(9)
    expect(f.pds.get("p2|d2")?.quantidade).toBe(9)
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
  })

  it("entrada sem flag continua fail-closed mesmo com livro comprovando overhang", async () => {
    const f = makeFake({
      produtos: [prod({ stock: 0 })],
      depositos: [{ id: "d1", storeId: "loja-a" }],
      pds: [{ produtoId: "p1", depositoId: "d1", storeId: "loja-a", quantidade: 4 }],
      movs: [seedLedger(0)],
    })
    const r = await applyStockMutation(ctx(), { kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual" }, { db: f.db })
    expect(r.ok).toBe(false)
    expect(f.produtos.get("p1")?.stock).toBe(0)
    expect(f.pds.get("p1|d1")?.quantidade).toBe(4)
  })

  it("normalizeStockCommand aceita flag na Entrada e recusa em ajuste", async () => {
    const { normalizeStockCommand: norm } = await import("@/lib/estoque/stock-ledger-contract")
    const e = norm({ kind: "entrada", produtoId: "p1", quantidade: 2, origem: "manual", realinharDepositoAoStock: true })
    expect(e.realinharDepositoAoStock).toBe(true)
    const a = norm({ kind: "ajuste", produtoId: "p1", novoSaldo: 2, origem: "manual", motivo: "x", realinharDepositoAoStock: true } as unknown as Parameters<typeof norm>[0])
    expect(a.realinharDepositoAoStock).toBe(false)
  })
})
