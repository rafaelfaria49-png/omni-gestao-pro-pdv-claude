/**
 * ESTOQUE-MANUAL-KG-001 — prova no PostgreSQL real (descartável), já migrado.
 *
 * Só roda com `ESTOQUE_KG_PG_URL` apontando para um banco LOCAL descartável
 * (127.0.0.1, nome `estoque_kg_isolated`) semeado com
 * `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/seed-legado-int.sql` antes da
 * migration. Sem a variável a suíte é pulada — nunca toca outro banco.
 * Prova: 2,500 + 0,750 = 3,250 (produto, depósito, livro), lock FOR UPDATE real
 * sob concorrência, idempotência por chave, isolamento por loja e saldos UN intactos.
 */
import { afterAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { applyStockMutation, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import type { StockLedgerCommand, StockLedgerContext } from "@/lib/estoque/stock-ledger-contract"

const url = process.env.ESTOQUE_KG_PG_URL ?? ""
const isolated = /^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/estoque_kg_isolated$/.test(url)
if (url && !isolated) throw new Error("ESTOQUE_KG_PG_URL deve ser um banco local descartável estoque_kg_isolated")

const suite = isolated ? describe : describe.skip
const db = isolated ? new PrismaClient({ datasourceUrl: url }) : (null as unknown as PrismaClient)
const deps = { db: db as unknown as { $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T> } }
const ctx = (storeId = "kgiso-a"): StockLedgerContext => ({ storeId, principal: null, source: "pg-proof" })
const entrada = (produtoId: string, quantidade: number, idempotencyKey?: string): StockLedgerCommand =>
  ({ kind: "entrada", produtoId, quantidade, origem: "manual", ...(idempotencyKey ? { idempotencyKey } : {}) })

async function estado(produtoId: string) {
  const [p, deps, movs] = await Promise.all([
    db.produto.findUniqueOrThrow({ where: { id: produtoId }, select: { stock: true } }),
    db.produtoDeposito.findMany({ where: { produtoId }, select: { quantidade: true } }),
    db.movimentacaoEstoque.findMany({ where: { produtoId }, orderBy: { createdAt: "asc" }, select: { quantidade: true, estoqueAntes: true, estoqueDepois: true, tipo: true } }),
  ])
  return { stock: p.stock, depositos: deps.map((d) => d.quantidade), movs }
}

afterAll(async () => { if (isolated) await db.$disconnect() })

suite("PostgreSQL real — estoque KG", () => {
  it("PAO FRANCES: 2,500 kg + 0,750 kg = 3,250 kg em produto, depósito e livro; releitura exata", async () => {
    const r1 = await applyStockMutation(ctx(), entrada("kgiso-pao-kg", 2.5), deps)
    expect(r1).toMatchObject({ ok: true, estoqueAntes: 0, estoqueDepois: 2.5 })
    const r2 = await applyStockMutation(ctx(), entrada("kgiso-pao-kg", 0.75), deps)
    expect(r2).toMatchObject({ ok: true, estoqueAntes: 2.5, estoqueDepois: 3.25 })
    const e = await estado("kgiso-pao-kg")
    expect(e.stock).toBe(3.25)
    expect(e.depositos).toEqual([3.25])
    expect(e.movs).toEqual([
      { tipo: "entrada", quantidade: 2.5, estoqueAntes: 0, estoqueDepois: 2.5 },
      { tipo: "entrada", quantidade: 0.75, estoqueAntes: 2.5, estoqueDepois: 3.25 },
    ])
    // Texto devolvido pelo próprio Postgres (sem passar pelo JS).
    const [{ stock }] = await db.$queryRaw<Array<{ stock: string }>>`SELECT stock::text AS stock FROM estoque_produtos WHERE id = 'kgiso-pao-kg'`
    expect(stock).toBe("3.25")
  })

  it("concorrência real: 20 entradas paralelas de 0,001 a 0,020 kg somam exatamente (FOR UPDATE)", async () => {
    const antes = (await estado("kgiso-pao-kg")).stock
    const qs = Array.from({ length: 20 }, (_, i) => (i + 1) / 1000)
    const rs = await Promise.all(qs.map((q) => applyStockMutation(ctx(), entrada("kgiso-pao-kg", q), deps)))
    expect(rs.filter((r) => !r.ok)).toEqual([])
    const e = await estado("kgiso-pao-kg")
    // 3,250 + 0,210 = 3,460; SUM(depósitos) == stock; livro encadeado sem buraco.
    expect(antes).toBe(3.25)
    expect(e.stock).toBe(3.46)
    expect(e.depositos).toEqual([3.46])
    expect(e.movs).toHaveLength(22)
    const [{ soma }] = await db.$queryRaw<Array<{ soma: string }>>`SELECT round(sum(quantidade)::numeric, 3)::text AS soma FROM movimentacoes_estoque WHERE "produtoId" = 'kgiso-pao-kg'`
    expect(soma).toBe("3.460")
    for (let i = 1; i < e.movs.length; i++) expect(e.movs[i].estoqueAntes).toBe(e.movs[i - 1].estoqueDepois)
  })

  it("idempotência: a mesma chave em paralelo aplica uma vez; conteúdo diferente conflita", async () => {
    const key = "pg-proof:entrada:pao:1"
    const rs = await Promise.all([1, 2, 3].map(() => applyStockMutation(ctx(), entrada("kgiso-pao-kg", 0.5, key), deps)))
    expect(rs.every((r) => r.ok)).toBe(true)
    expect(rs.filter((r) => r.ok && r.idempotente)).toHaveLength(2)
    expect((await estado("kgiso-pao-kg")).stock).toBe(3.96)
    const conflito = await applyStockMutation(ctx(), entrada("kgiso-pao-kg", 0.501, key), deps)
    expect(conflito).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" })
    expect(await db.movimentacaoEstoque.count({ where: { storeId: "kgiso-a", idempotencyKey: key } })).toBe(1)
  })

  it("rejeita precisão acima de 3 casas e produto de outra loja sem gravar", async () => {
    const antes = await estado("kgiso-pao-kg")
    expect(await applyStockMutation(ctx(), entrada("kgiso-pao-kg", 0.0005), deps)).toMatchObject({ ok: false, code: "VALIDATION" })
    expect(await applyStockMutation(ctx("kgiso-b"), entrada("kgiso-pao-kg", 1), deps)).toMatchObject({ ok: false, code: "CROSS_STORE" })
    expect(await estado("kgiso-pao-kg")).toEqual(antes)
  })

  it("saldos legados preservados; legado vendaPorPeso aceita KG sobre o saldo inteiro antigo; UN segue inteiro", async () => {
    const un = await db.produto.findMany({ where: { id: { in: ["kgiso-un-10", "kgiso-un-0", "kgiso-un-max", "kgiso-b-un"] } }, orderBy: { id: "asc" }, select: { id: true, stock: true } })
    expect(un).toEqual([
      { id: "kgiso-b-un", stock: 5 }, { id: "kgiso-un-0", stock: 0 }, { id: "kgiso-un-10", stock: 10 }, { id: "kgiso-un-max", stock: 2147483647 },
    ])
    const legado = await applyStockMutation(ctx(), entrada("kgiso-kg-legado", 0.25), deps)
    expect(legado).toMatchObject({ ok: true, estoqueAntes: 4, estoqueDepois: 4.25 })
    expect((await estado("kgiso-kg-legado")).depositos).toEqual([4.25])
    expect(await applyStockMutation(ctx(), entrada("kgiso-un-10", 2), deps)).toMatchObject({ ok: true, estoqueDepois: 12 })
    expect(await applyStockMutation(ctx(), entrada("kgiso-un-10", 0.5), deps)).toMatchObject({ ok: false, code: "VALIDATION" })
    expect((await estado("kgiso-un-10")).stock).toBe(12)
  })
})
