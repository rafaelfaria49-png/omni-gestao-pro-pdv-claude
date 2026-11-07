/**
 * PADARIA-KG-RELEASE-READINESS-A4-A8-001 — fase de um ensaio entre versões.
 *
 * O MESMO arquivo é copiado pelo orquestrador (`run-cross-version.mjs`) para
 * `<worktree>/test-results/kg-readiness/` e executado pelo Vitest de cada versão:
 *  - `KG_PHASE=old`       → código da main (cliente Prisma Int), papel antigo, ANTES do corte;
 *  - `KG_PHASE=new`       → código da #336 (cliente Float), `omni_runtime_v2`, DEPOIS das migrations;
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
if (!["old", "new", "old-after"].includes(PHASE) || !OUT || !PORT || !EXPECTED_USER) throw Error("KG_HARNESS_ENV_REQUIRED")
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
    const saleA = un("VDA-SIM-A", 2), saleB = un("LOCAL-SIM-B", 3), saleC = un("VDA-SIM-C", 4)
    const clientSaleIdB = "7d0f0c55-0b7e-4a52-9f2a-0d4c5e0b1b01"
    const a = await v1(clone(saleA))
    const b = await v2(clone(saleB), clientSaleIdB)
    const aReplayOld = await v1(clone(saleA))
    expect(a.replayed).toBe(false); expect(b.replayed).toBe(false); expect(aReplayOld.replayed).toBe(true)
    result.payloads = { saleA, saleB, clientSaleIdB, saleC }
    result.created = { a: { pedidoId: a.venda.pedidoId, fingerprint: a.fingerprint }, b: { pedidoId: b.venda.pedidoId, fingerprint: b.fingerprint } }
    result.countsAfterOld = await counts()
    expect(result.countsAfterOld).toMatchObject({ vendas: "2", itens: "2", livro: "2", stock: "45", stock_type: "integer" })
  })

  it.runIf(PHASE === "new")("new: replays of old sales never duplicate; first send of queued sale once", async () => {
    result.identity = await identity()
    const old = JSON.parse(readFileSync(process.env.KG_OLD_OUT!, "utf8"))
    const { saleA, saleB, clientSaleIdB, saleC } = old.payloads
    const before = await counts()
    expect(before).toMatchObject({ vendas: "2", livro: "2", stock: "45", stock_type: "double precision" })
    const aReplay = await v1(clone(saleA))
    const bReplay = await v2(clone(saleB), clientSaleIdB)
    const parallel = await Promise.all([1, 2, 3].map(() => v1(clone(saleA))))
    const parallelV2 = await Promise.all([1, 2, 3].map(() => v2(clone(saleB), clientSaleIdB)))
    const c1 = await v1(clone(saleC))
    const c2 = await v1(clone(saleC))
    result.replays = {
      a: { replayed: aReplay.replayed, pedidoId: aReplay.venda.pedidoId, fingerprintEqualsOld: aReplay.fingerprint === old.created.a.fingerprint },
      b: { replayed: bReplay.replayed, pedidoId: bReplay.venda.pedidoId, fingerprintEqualsOld: bReplay.fingerprint === old.created.b.fingerprint },
      parallelV1: parallel.map((r) => r.replayed), parallelV2: parallelV2.map((r) => r.replayed),
      c: [c1.replayed, c2.replayed],
    }
    expect(aReplay.replayed).toBe(true); expect(aReplay.venda.pedidoId).toBe(old.created.a.pedidoId)
    expect(bReplay.replayed).toBe(true); expect(bReplay.venda.pedidoId).toBe(old.created.b.pedidoId)
    expect(parallel.every((r) => r.replayed)).toBe(true); expect(parallelV2.every((r) => r.replayed)).toBe(true)
    expect([c1.replayed, c2.replayed]).toEqual([false, true])
    // Fingerprint UN calculada pela versão nova = a gravada pela antiga (sem 409 por mudança de versão).
    expect(aReplay.fingerprint).toBe(old.created.a.fingerprint)
    expect(bReplay.fingerprint).toBe(old.created.b.fingerprint)
    // Reenvio com fatos diferentes continua recusado (não vira venda nova).
    const changed = clone(saleA); changed.lines![0].quantity = 1; changed.total = 10; changed.paymentBreakdown = { dinheiro: 10 }
    await expect(v1(changed)).rejects.toBeInstanceOf(Error)
    result.countsAfterNew = await counts()
    expect(result.countsAfterNew).toMatchObject({ vendas: "3", itens: "3", livro: "3", stock: "41", deltas: "-2,-3,-4" })
    const fin = await prisma.$queryRawUnsafe<Array<{ ref: string; n: number }>>(
      `SELECT "referenciaId" AS ref, count(*)::int AS n FROM movimentacoes_financeiras GROUP BY 1 ORDER BY 1`)
    result.financeiroPorVenda = fin
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
