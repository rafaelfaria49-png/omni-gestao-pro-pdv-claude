import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { persistSaleV2 } from "./sale-writer-v2"
import { MANUAL_KG_SALE, saleLineTotalCents } from "./manual-kg-contract"
import { manualKgAvailable } from "./manual-kg-server"
const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
const enabled = process.env.MANUAL_KG_TEST_DATABASE_URL === url
if (process.env.MANUAL_KG_TEST_DATABASE_URL && !enabled) throw Error("MANUAL_KG_ISOLATION_REQUIRED")
const suite = enabled ? describe : describe.skip
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const LIVE = { enforceStock: true, requireCaixaSession: true }
let index = 0
async function product(metadata: object = KG, stock = 10, price = 20, storeId = "kg-sale-a") {
  return prisma.produto.create({ data: { id: "kg-product-" + randomUUID(), storeId, name: "Pão sintético", stock, price, metadata } })
}
function payload(id: string, quantity = .35, price = 20): SalePayload {
  const total = saleLineTotalCents(quantity, price)! / 100
  return { id: "KG-SALE-" + (++index) + "-" + randomUUID(), manualKgSale: MANUAL_KG_SALE, sessaoId: "kg-sale-cash-a", at: "2026-10-29T12:00:00Z", total,
    lines: [{ inventoryId: id, name: "Pão sintético", quantity, unitPrice: price, lineTotal: total }], paymentBreakdown: { dinheiro: total } }
}
const persist = (sale: SalePayload, lojaId = "kg-sale-a") => prisma.$transaction((tx) => upsertVendaInTransaction(tx, lojaId, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })
async function state(id: string) {
  const p = await prisma.produto.findUniqueOrThrow({ where: { id } })
  const deposits = await prisma.produtoDeposito.findMany({ where: { produtoId: id } })
  const ledger = await prisma.movimentacaoEstoque.findMany({ where: { produtoId: id }, orderBy: { createdAt: "asc" } })
  const items = await prisma.itemVenda.findMany({ where: { inventoryId: id } })
  return { stock: p.stock, deposits: deposits.map((d) => d.quantidade), ledger, items }
}
suite("real PostgreSQL manual KG sales", () => {
  beforeAll(async () => {
    for (const [id, code] of [["kg-sale-a", "KGA"], ["kg-sale-b", "KGB"]]) {
      await prisma.store.create({ data: { id, name: "Loja sintética " + code, codigoNumeracaoVenda: code } })
      await prisma.sessaoCaixa.create({ data: { id: id === "kg-sale-a" ? "kg-sale-cash-a" : "kg-sale-cash-b", storeId: id, operador: "Operador", status: "ABERTA" } })
    }
  })
  afterAll(() => prisma.$disconnect())
  it.each([.35, 1.25])("persists %s kg, exact item, payments, deposits and ledger; fresh reread", async (q) => {
    const p = await product()
    const sale = payload(p.id, q)
    const result = await persist(sale)
    expect(result.replayed).toBe(false)
    const s = await state(p.id)
    expect(s.stock).toBe((10000 - q * 1000) / 1000)
    expect(s.deposits).toEqual([s.stock])
    expect(s.items[0]).toMatchObject({ quantidade: q, precoUnitario: 20, lineTotal: q * 20 })
    expect(s.ledger).toHaveLength(1)
    expect(s.ledger[0]).toMatchObject({ quantidade: -q, estoqueAntes: 10, estoqueDepois: s.stock })
    const row = await prisma.venda.findUniqueOrThrow({ where: { pedidoId: sale.id } })
    expect((row.payload as unknown as SalePayload).lines?.[0]).toMatchObject({ quantity: q, quantityUnit: "KG", weightSource: "manual" })
    expect(await prisma.movimentacaoFinanceira.findMany({ where: { referenciaId: sale.id } })).toMatchObject([{ valor: sale.total, tipo: "entrada", origem: "venda" }])
    const fresh = await prisma.$queryRaw<Array<{ stock: string }>>`SELECT stock::text AS stock FROM estoque_produtos WHERE id = ${p.id}`
    expect(fresh[0].stock).toBe(String(s.stock))
  })
  it("percent discount and exact half-cent pricing remain coherent", async () => {
    const p = await product(), sale = payload(p.id)
    sale.discountTotal = .7; sale.discountPercent = 10; sale.total = 6.3; sale.paymentBreakdown = { dinheiro: 6.3 }
    await persist(sale)
    expect((await state(p.id)).items[0].lineTotal).toBe(7)
    const half = await product(KG, 10, 1), halfSale = payload(half.id, .025, 1)
    await persist(halfSale)
    expect((await state(half.id)).items[0].lineTotal).toBe(.03)
  })
  it("mixed KG + UN and repeated KG lines sum exact grams", async () => {
    const kg = await product(), un = await product({}, 10, 3)
    const sale = payload(kg.id, .1)
    sale.lines!.push({ inventoryId: kg.id, name: "Pão sintético", quantity: .2, unitPrice: 20, lineTotal: 4 }, { inventoryId: un.id, name: "UN", quantity: 2, unitPrice: 3, lineTotal: 6 })
    sale.total = 12; sale.paymentBreakdown = { dinheiro: 12 }
    await persist(sale)
    expect((await state(kg.id)).stock).toBe(9.7)
    expect((await state(kg.id)).ledger[0].quantidade).toBe(-.3)
    expect((await state(un.id)).stock).toBe(8)
  })
  it("insufficient stock rolls back sale, items, deposits, ledger and money", async () => {
    const p = await product(KG, .3), sale = payload(p.id)
    await expect(persist(sale)).rejects.toMatchObject({ code: "ESTOQUE_INSUFICIENTE" })
    expect(await state(p.id)).toMatchObject({ stock: .3, deposits: [], ledger: [], items: [] })
    expect(await prisma.venda.count({ where: { pedidoId: sale.id } })).toBe(0)
  })
  it.each([0, -1, .0001, .3501, NaN, Infinity])("rejects invalid weight %s without writes", async (q) => {
    const p = await product(), sale = payload(p.id)
    sale.lines![0].quantity = q
    await expect(persist(sale)).rejects.toBeInstanceOf(Error)
    expect((await state(p.id)).items).toHaveLength(0)
  })
  it("rejects price, line total, sale total, exact payment cents, avulso and UN fractions", async () => {
    const p = await product(), un = await product({})
    const bad = [
      (s: SalePayload) => { s.lines![0].unitPrice = 19 },
      (s: SalePayload) => { s.discountTotal = 1; s.total = 6; s.paymentBreakdown = { dinheiro: 6 } },
      (s: SalePayload) => { s.lines![0].lineTotal = 6.99 },
      (s: SalePayload) => { s.total = 6.99; s.paymentBreakdown = { dinheiro: 6.99 } },
      (s: SalePayload) => { s.paymentBreakdown = { dinheiro: 6.99 } },
      (s: SalePayload) => { s.paymentBreakdown = { dinheiro: 7.001 } },
      (s: SalePayload) => { s.lines![0].isAvulso = true },
      (s: SalePayload) => { s.lines![0].inventoryId = un.id },
      (s: SalePayload) => { s.lines!.push({ ...s.lines![0], unitPrice: 19 }); s.total = 14; s.paymentBreakdown = { dinheiro: 14 } },
    ]
    for (const mutate of bad) { const sale = payload(p.id); mutate(sale); await expect(persist(sale)).rejects.toBeInstanceOf(Error) }
    expect((await state(p.id)).stock).toBe(10)
    expect((await state(p.id)).items).toHaveLength(0)
  })
  it("same sale retries after a lost response do not duplicate stock, items or payments", async () => {
    const p = await product(), sale = payload(p.id)
    await persist(sale)
    expect((await persist(structuredClone(sale))).replayed).toBe(true)
    const s = await state(p.id)
    expect(s.stock).toBe(9.65); expect(s.items).toHaveLength(1); expect(s.ledger).toHaveLength(1)
    const invalidMoney = structuredClone(sale); invalidMoney.lines![0].unitPrice = 20.001
    await expect(persist(invalidMoney)).rejects.toMatchObject({ code: "MANUAL_KG_SALE_BLOCKED" })
    const changed = structuredClone(sale); changed.lines![0].quantity = .351
    await expect(persist(changed)).rejects.toBeInstanceOf(Error)
  })
  it("writer V2 allocates once and concurrent replay uses one stable clientSaleId", async () => {
    const p = await product(), sale = payload(p.id), clientSaleId = randomUUID()
    const results = await Promise.all([1, 2, 3].map(() => persistSaleV2({ storeId: "kg-sale-a", sale: structuredClone(sale), clientSaleId, options: LIVE })))
    expect(results.filter((r) => !r.replayed)).toHaveLength(1)
    expect(new Set(results.map((r) => r.venda.pedidoId)).size).toBe(1)
    expect((await state(p.id)).stock).toBe(9.65)
    expect((await state(p.id)).items).toHaveLength(1)
  })
  it("competing sales cannot oversell the last grams", async () => {
    const p = await product(KG, .5)
    const results = await Promise.allSettled([persist(payload(p.id, .35)), persist(payload(p.id, .35))])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect((await state(p.id)).stock).toBe(.15)
    expect((await state(p.id)).ledger).toHaveLength(1)
  })
  it("server refuses another store, G, invalid declaration, implicit KG-as-UN and unavailable capability", async () => {
    const p = await product(), other = await product(KG, 10, 20, "kg-sale-b")
    for (const metadata of [{ comercial: { ...KG.comercial, unidade: "G", basePreco: "G" } }, { comercial: { ...KG.comercial, version: 2 } }]) {
      const invalid = await product(metadata); await expect(persist(payload(invalid.id, 1))).rejects.toBeInstanceOf(Error)
    }
    await expect(persist(payload(other.id))).rejects.toBeInstanceOf(Error)
    const implicit = payload(p.id, 1); delete implicit.manualKgSale
    await expect(persist(implicit)).rejects.toMatchObject({ code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" })
    expect(await manualKgAvailable(prisma, "not-approved")).toBe(false)
    expect((await state(other.id)).stock).toBe(10)
  })
  it("UN sale remains compatible with the original writer and historical values survive", async () => {
    const p = await product({}, 10, 20), sale = payload(p.id, 2); delete sale.manualKgSale
    await persist(sale)
    expect((await state(p.id)).stock).toBe(8)
    expect((await prisma.itemVenda.findUniqueOrThrow({ where: { id: "kg-historical-item" } })).quantidade).toBe(2147483647)
  })
  it("historical KG recovery stays blocked without truncating or bypassing stock", async () => {
    const p = await product(), sale = payload(p.id)
    await expect(prisma.$transaction((tx) => upsertVendaInTransaction(tx, "kg-sale-a", sale, "Operador", { ...LIVE, historicalRecovery: true }))).rejects.toMatchObject({ code: "MANUAL_KG_SALE_BLOCKED" })
    expect((await state(p.id)).stock).toBe(10)
  })
})
