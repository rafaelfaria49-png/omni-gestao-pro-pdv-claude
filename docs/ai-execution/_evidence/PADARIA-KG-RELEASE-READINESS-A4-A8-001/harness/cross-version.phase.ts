/**
 * PADARIA-KG-RELEASE-READINESS-A4-A8-001 — fase de um ensaio entre versões.
 *
 * O MESMO arquivo é copiado pelo orquestrador (`run-cross-version.mjs`) para
 * `<worktree>/test-results/kg-readiness/` e executado pelo Vitest de cada versão:
 *  - `KG_PHASE=old`       → código da main (cliente Prisma Int), papel antigo, ANTES do corte;
 *  - `KG_PHASE=replay`    → cada versão seguinte (#315, #335, topo), `omni_runtime_v2`, DEPOIS das migrations;
 *  - `KG_PHASE=old-after` → código da main com a credencial nova, simulando "Redeploy" proibido.
 * Só conecta no cluster descartável conferido por identidade (porta/banco/usuário).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { persistSaleV2 } from "@/lib/vendas/sale-writer-v2"

const PHASE = process.env.KG_PHASE ?? ""
const OUT = process.env.KG_OUT ?? ""
const PORT = Number(process.env.KG_PORT ?? "0")
const EXPECTED_USER = process.env.KG_EXPECTED_USER ?? ""
if (!["old", "replay", "old-after"].includes(PHASE) || !OUT || !PORT || !EXPECTED_USER) throw Error("KG_HARNESS_ENV_REQUIRED")
const STORE = "loja-sim-1"
const LIVE = { enforceStock: true, requireCaixaSession: true }
const at = "2026-11-06T12:00:00.000Z"
const un = (id: string, qty: number, price = 10): SalePayload => ({
  id, at, total: qty * price, sessaoId: "cash-sim-1",
  lines: [{ inventoryId: "prod-un-1", name: "Produto UN sintético", quantity: qty, unitPrice: price, lineTotal: qty * price }],
  paymentBreakdown: { dinheiro: qty * price },
})
const v1 = (sale: SalePayload) => prisma.$transaction((tx) => upsertVendaInTransaction(tx, STORE, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })
const v2 = (sale: SalePayload, clientSaleId: string) => persistSaleV2({ storeId: STORE, sale, clientSaleId, operadorLabel: "Operador sintético", options: LIVE })
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

async function identity() {
  const [row] = await prisma.$queryRawUnsafe<Array<{ db: string; usr: string; port: number; host: string }>>(
    "SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port, host(inet_server_addr()) AS host")
  if (row.db !== (process.env.KG_DB_EXPECTED ?? "omnigestao_prod_sim") || row.usr !== EXPECTED_USER || row.port !== PORT || row.host !== "127.0.0.1") throw Error("KG_IDENTITY_MISMATCH " + JSON.stringify(row))
  return row
}
async function counts() {
  const [r] = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(`SELECT
    (SELECT count(*) FROM vendas)::text AS vendas, (SELECT count(*) FROM venda_itens)::text AS itens,
    (SELECT count(*) FROM movimentacoes_estoque)::text AS livro, (SELECT count(*) FROM movimentacoes_financeiras)::text AS financeiro,
    (SELECT stock::text FROM estoque_produtos WHERE id = 'prod-un-1') AS stock,
    (SELECT string_agg(quantidade::text, ',' ORDER BY "createdAt", id) FROM movimentacoes_estoque WHERE "produtoId" = 'prod-un-1') AS deltas,
    (SELECT data_type FROM information_schema.columns WHERE table_name = 'estoque_produtos' AND column_name = 'stock') AS stock_type`)
  return r
}

const result: Record<string, unknown> = { phase: PHASE }
describe("cross-version " + PHASE, () => {
  afterAll(async () => { writeFileSync(OUT, JSON.stringify(result, null, 2)); await prisma.$disconnect() })

  it.runIf(PHASE === "old")("old: seed + v1 + v2 with lost responses", async () => {
    result.identity = await identity()
    await prisma.store.create({ data: { id: STORE, name: "Loja sintética 1", codigoNumeracaoVenda: "SIM" } })
    await prisma.sessaoCaixa.create({ data: { id: "cash-sim-1", storeId: STORE, operador: "Operador", status: "ABERTA" } })
    await prisma.produto.create({ data: { id: "prod-un-1", storeId: STORE, name: "Produto UN sintético", stock: 50, price: 10 } })
    // Duas vendas confirmadas com resposta perdida (v1 e v2) + uma que fica só na fila (nunca enviada).
    const a = await v1(clone(un("VDA-SIM-A", 2)))
    const csidB = "7d0f0c55-0b7e-4a52-9f2a-0d4c5e0b1b01"
    const b = await v2(clone(un("LOCAL-SIM-B", 3)), csidB)
    expect(a.replayed).toBe(false); expect(b.replayed).toBe(false)
    expect((await v1(clone(un("VDA-SIM-A", 2)))).replayed).toBe(true)
    result.sales = [
      { mode: "v1", payload: un("VDA-SIM-A", 2), qty: 2, pedidoId: a.venda.pedidoId, fingerprint: a.fingerprint, origin: "old" },
      { mode: "v2", payload: un("LOCAL-SIM-B", 3), clientSaleId: csidB, qty: 3, pedidoId: b.venda.pedidoId, fingerprint: b.fingerprint, origin: "old" },
    ]
    result.queued = [{ mode: "v1", payload: un("VDA-SIM-Q-old", 1), qty: 1 }]
    result.counts = await counts()
    expect(result.counts).toMatchObject({ vendas: "2", itens: "2", livro: "2", stock: "45", stock_type: "integer" })
  })

  // Cada versão seguinte (#315 → #335 → topo): reenvia TODAS as vendas anteriores (sequencial e 3× em
  // paralelo), faz o 1º envio da venda que ficou na fila da versão anterior, grava uma v1 e uma v2 próprias
  // com resposta perdida e deixa uma nova venda na fila para a próxima versão.
  it.runIf(PHASE === "replay")("replay: no confirmed sale is written twice across versions", async () => {
    result.identity = await identity()
    const tag = process.env.KG_TAG ?? "x"
    const prev = JSON.parse(readFileSync(process.env.KG_PREV_OUT!, "utf8"))
    const sales: Array<Record<string, any>> = prev.sales
    const send = (s: Record<string, any>) => s.mode === "v1" ? v1(clone(s.payload)) : v2(clone(s.payload), s.clientSaleId)
    const replays: unknown[] = []
    for (const s of sales) {
      const r = await send(s)
      const par = await Promise.all([1, 2, 3].map(() => send(s)))
      replays.push({ pedidoId: s.pedidoId, origin: s.origin, replayed: r.replayed, samePedido: r.venda.pedidoId === s.pedidoId, sameFingerprint: r.fingerprint === s.fingerprint, parallel: par.map((x) => x.replayed) })
      expect(r.replayed).toBe(true); expect(r.venda.pedidoId).toBe(s.pedidoId); expect(r.fingerprint).toBe(s.fingerprint)
      expect(par.every((x) => x.replayed && x.venda.pedidoId === s.pedidoId)).toBe(true)
    }
    const fresh: Array<Record<string, any>> = []
    for (const q of prev.queued) {
      const first = await send(q), again = await send(q)
      expect([first.replayed, again.replayed]).toEqual([false, true])
      fresh.push({ ...q, pedidoId: first.venda.pedidoId, fingerprint: first.fingerprint, origin: "queued-from-" + prev.phase + "-sent-by-" + tag })
    }
    const own1 = await v1(clone(un("VDA-SIM-" + tag, 1)))
    const csid = ["11111111-1111-4111-8111-", tag.padEnd(12, "0").slice(0, 12).replace(/[^0-9a-f]/g, "a")].join("")
    const own2 = await v2(clone(un("LOCAL-SIM-" + tag, 1)), csid)
    expect(own1.replayed).toBe(false); expect(own2.replayed).toBe(false)
    fresh.push({ mode: "v1", payload: un("VDA-SIM-" + tag, 1), qty: 1, pedidoId: own1.venda.pedidoId, fingerprint: own1.fingerprint, origin: tag },
      { mode: "v2", payload: un("LOCAL-SIM-" + tag, 1), clientSaleId: csid, qty: 1, pedidoId: own2.venda.pedidoId, fingerprint: own2.fingerprint, origin: tag })
    // Reenvio com fatos diferentes continua recusado (não vira venda nova).
    const changed = clone(sales[0].payload); changed.lines[0].quantity = 1; changed.total = 10; changed.paymentBreakdown = { dinheiro: 10 }
    await expect(sales[0].mode === "v1" ? v1(changed) : v2(changed, sales[0].clientSaleId)).rejects.toBeInstanceOf(Error)
    result.phase = "replay-" + tag
    result.replays = replays
    result.sales = [...sales, ...fresh]
    result.queued = [{ mode: tag.length % 2 ? "v2" : "v1", payload: un("LOCAL-SIM-Q-" + tag, 1), qty: 1, clientSaleId: "22222222-2222-4222-8222-" + "0".repeat(12 - tag.length) + tag.replace(/[^0-9a-f]/g, "b") }]
    result.counts = await counts()
    const n = String(result.sales.length), stock = String(50 - result.sales.reduce((t: number, s: any) => t + s.qty, 0))
    expect(result.counts).toMatchObject({ vendas: n, itens: n, livro: n, financeiro: n, stock, stock_type: "double precision" })
    const fin = await prisma.$queryRawUnsafe<Array<{ ref: string; n: number }>>(
      `SELECT "referenciaId" AS ref, count(*)::int AS n FROM movimentacoes_financeiras GROUP BY 1 ORDER BY 1`)
    expect(fin.every((r) => r.n === 1)).toBe(true)
  })

  it.runIf(PHASE === "old-after")("old-after: Int client with the new credential (forbidden Redeploy)", async () => {
    result.identity = await identity()
    const before = await counts()
    let error: unknown = null
    try { await v1(un("VDA-SIM-REDEPLOY", 1)) } catch (e) { error = e }
    const after = await counts()
    const [bad] = await prisma.$queryRawUnsafe<Array<{ n: string }>>(`SELECT (
      (SELECT count(*) FROM estoque_produtos WHERE stock = 'NaN' OR (stock <> 0 AND abs(stock) < 2.2250738585072014e-308)) +
      (SELECT count(*) FROM movimentacoes_estoque WHERE quantidade = 'NaN' OR (quantidade <> 0 AND abs(quantidade) < 2.2250738585072014e-308)))::text AS n`)
    result.oldAfter = { rejected: error !== null, error: error instanceof Error ? error.message.slice(-900) : null, before, after, corruptedValues: bad.n }
    // Com o 07 aplicado, a escrita Int deve falhar fechada e nada pode ter mudado.
    if (process.env.KG_EXPECT_GUARD === "1") {
      expect(error).not.toBeNull()
      expect(after).toEqual(before)
      expect(bad.n).toBe("0")
    }
  })
})
