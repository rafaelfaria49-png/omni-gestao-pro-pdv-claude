/**
 * PADARIA-KG-RELEASE-READINESS-A4-A8-001 — venda KG sob a topologia REAL de papéis:
 * tabelas e funções SECURITY DEFINER pertencem a `omni_owner`; o app conecta como
 * `omni_runtime_v2` (só DML). As suítes da #335/#336 rodam como superusuário sintético.
 */
import { writeFileSync } from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { persistSaleV2 } from "@/lib/vendas/sale-writer-v2"
import { MANUAL_KG_SALE, saleLineTotalCents } from "@/lib/vendas/manual-kg-contract"
import { itemCommercialQuantity } from "@/lib/vendas/item-quantity"

const OUT = process.env.KG_OUT ?? ""
if (!OUT || process.env.KG_EXPECTED_USER !== "omni_runtime_v2") throw Error("KG_HARNESS_ENV_REQUIRED")
const STORE = "loja-sim-1"
const LIVE = { enforceStock: true, requireCaixaSession: true }
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const result: Record<string, unknown> = { phase: "kg" }
const sale = (id: string, inventoryId: string, q: number): SalePayload => {
  const total = saleLineTotalCents(q, 20)! / 100
  return { id, manualKgSale: MANUAL_KG_SALE, sessaoId: "cash-sim-1", at: "2026-11-06T12:30:00Z", total,
    lines: [{ inventoryId, name: "Pão KG sintético", quantity: q, unitPrice: 20, lineTotal: total }], paymentBreakdown: { dinheiro: total } }
}
const v1 = (s: SalePayload) => prisma.$transaction((tx) => upsertVendaInTransaction(tx, STORE, s, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })

describe("KG under real role topology", () => {
  afterAll(async () => { writeFileSync(OUT, JSON.stringify(result, null, 2)); await prisma.$disconnect() })
  it("runtime sells KG once per identity; direct SQL tamper is refused by the version barrier", async () => {
    const [who] = await prisma.$queryRawUnsafe<Array<{ usr: string; owner: string }>>(
      "SELECT current_user AS usr, (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.vendas'::regclass) AS owner")
    expect(who).toEqual({ usr: "omni_runtime_v2", owner: "omni_owner" })
    await prisma.produto.create({ data: { id: "prod-kg-1", storeId: STORE, name: "Pão KG sintético", stock: 5, price: 20, metadata: KG } })
    const a = sale("VDA-SIM-KG-1", "prod-kg-1", 0.35)
    const first = await v1(structuredClone(a))
    const replay = await v1(structuredClone(a))
    const b = sale("LOCAL-SIM-KG-2", "prod-kg-1", 1.25), csid = "0b9a5b1e-8a52-4f7e-9d1c-6d1f1c2a3b04"
    const v2s = await Promise.all([1, 2, 3].map(() => persistSaleV2({ storeId: STORE, sale: structuredClone(b), clientSaleId: csid, options: LIVE })))
    const p = await prisma.produto.findUniqueOrThrow({ where: { id: "prod-kg-1" } })
    const items = await prisma.itemVenda.findMany({ where: { inventoryId: "prod-kg-1" }, orderBy: { id: "asc" } })
    const ledger = await prisma.movimentacaoEstoque.findMany({ where: { produtoId: "prod-kg-1" } })
    let tamper: string | null = null
    try { await prisma.$executeRawUnsafe(`UPDATE venda_itens SET "quantidadeKg" = 0.001 WHERE "inventoryId" = 'prod-kg-1'`) } catch (e) { tamper = e instanceof Error ? e.message.slice(0, 200) : String(e) }
    result.summary = {
      first: first.replayed, replay: replay.replayed, v2: v2s.map((r) => r.replayed), v2Pedidos: new Set(v2s.map((r) => r.venda.pedidoId)).size,
      stock: p.stock, items: items.map((i) => [i.quantidade, itemCommercialQuantity(i)]), ledger: ledger.map((l) => l.quantidade).sort(),
      tamperRefused: tamper !== null && tamper.includes("MANUAL_KG_COMPATIBLE_WRITER_REQUIRED"),
    }
    expect(first.replayed).toBe(false); expect(replay.replayed).toBe(true)
    expect(v2s.filter((r) => !r.replayed)).toHaveLength(1)
    expect(p.stock).toBe(3.4)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.quantidade === null)).toBe(true)
    expect(ledger).toHaveLength(2)
    expect(tamper).toContain("MANUAL_KG_COMPATIBLE_WRITER_REQUIRED")
  })
})
