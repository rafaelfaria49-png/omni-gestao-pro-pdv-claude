/**
 * PADARIA-KG-VENDA-POR-PESO-INTEGRACAO-001 — fluxo de ponta a ponta em PostgreSQL 17 descartável.
 *
 * Entrada de estoque pelo boundary real da #315 (applyStockMutation) seguida de venda manual KG
 * pelo writer real (upsertVendaInTransaction / persistSaleV2). Só roda com o mesmo banco isolado
 * de scripts/pdv/run-manual-kg-tests.mjs; sem a variável a suíte é pulada.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { applyStockMutation, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { persistSaleV2 } from "./sale-writer-v2"
import { MANUAL_KG_SALE, saleLineTotalCents } from "./manual-kg-contract"
import { itemCommercialQuantity } from "./item-quantity"

const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
const enabled = process.env.MANUAL_KG_TEST_DATABASE_URL === url
if (process.env.MANUAL_KG_TEST_DATABASE_URL && !enabled) throw Error("MANUAL_KG_ISOLATION_REQUIRED")
const suite = enabled ? describe : describe.skip

const A = "kg-pad-a", B = "kg-pad-b"
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const LIVE = { enforceStock: true, requireCaixaSession: true }
const deps = { db: prisma as unknown as { $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T> } }

async function produto(input: { name: string; price: number; storeId?: string; metadata?: object; sku?: string }) {
  return prisma.produto.create({ data: { id: "kg-pad-" + randomUUID(), storeId: input.storeId ?? A, name: input.name, stock: 0, price: input.price, metadata: input.metadata ?? KG, ...(input.sku ? { sku: input.sku } : {}) } })
}
const entrada = (produtoId: string, quantidade: number, storeId = A) =>
  applyStockMutation({ storeId, principal: null, source: "kg-padaria-flow" }, { kind: "entrada", produtoId, quantidade, origem: "manual" }, deps)

function venda(lines: Array<{ id: string; name: string; quantity: number; price: number; produtoId?: string }>, storeId = A): SalePayload {
  const items = lines.map((l) => ({ inventoryId: l.id, ...(l.produtoId ? { produtoId: l.produtoId } : {}), name: l.name, quantity: l.quantity, unitPrice: l.price, lineTotal: saleLineTotalCents(l.quantity, l.price)! / 100 }))
  const cents = items.reduce((sum, l) => sum + Math.round(l.lineTotal * 100), 0)
  return { id: "KG-PAD-" + randomUUID(), manualKgSale: MANUAL_KG_SALE, sessaoId: storeId + "-cash", at: "2026-11-06T12:00:00Z", total: cents / 100, lines: items, paymentBreakdown: { dinheiro: cents / 100 } }
}
const persist = (sale: SalePayload, lojaId = A) =>
  prisma.$transaction((tx) => upsertVendaInTransaction(tx, lojaId, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })

async function saldoTexto(id: string) {
  const [row] = await prisma.$queryRaw<Array<{ stock: string; dep: string | null }>>`
    SELECT p.stock::text AS stock, (SELECT string_agg(d.quantidade::text, ',') FROM produto_depositos d WHERE d."produtoId" = p.id) AS dep
    FROM estoque_produtos p WHERE p.id = ${id}`
  return row
}
const livro = (id: string) => prisma.$queryRaw<Array<{ tipo: string; q: string; a: string; d: string }>>`
  SELECT tipo::text AS tipo, quantidade::text AS q, "estoqueAntes"::text AS a, "estoqueDepois"::text AS d
  FROM movimentacoes_estoque WHERE "produtoId" = ${id} ORDER BY "createdAt", id`

suite("padaria — estoque KG + venda manual por peso (PostgreSQL real)", () => {
  beforeAll(async () => {
    for (const [id, code] of [[A, "KPA"], [B, "KPB"]]) {
      await prisma.store.create({ data: { id, name: "Padaria sintética " + code, codigoNumeracaoVenda: code } })
      await prisma.sessaoCaixa.create({ data: { id: id + "-cash", storeId: id, operador: "Operador", status: "ABERTA" } })
    }
  })
  afterAll(() => prisma.$disconnect())

  it("estoque: 2,500 kg + 0,750 kg = 3,250 kg no produto, depósito e livro (texto do PostgreSQL)", async () => {
    const pao = await produto({ name: "Pão francês sintético", price: 18.9 })
    expect(await entrada(pao.id, 2.5)).toMatchObject({ ok: true })
    expect(await entrada(pao.id, 0.75)).toMatchObject({ ok: true })
    expect(await saldoTexto(pao.id)).toEqual({ stock: "3.25", dep: "3.25" })
    expect((await livro(pao.id)).map((m) => [m.q, m.a, m.d])).toEqual([["2.5", "0", "2.5"], ["0.75", "2.5", "3.25"]])
    expect(await entrada(pao.id, 0.0001)).toMatchObject({ ok: false })
    expect(await saldoTexto(pao.id)).toEqual({ stock: "3.25", dep: "3.25" })
  })

  it("queijo R$ 20,00/kg: entrada 5,000 kg, venda 0,350 kg = R$ 7,00, saldo 4,650 kg, histórico e financeiro exatos", async () => {
    const queijo = await produto({ name: "Queijo sintético", price: 20 })
    expect(await entrada(queijo.id, 5)).toMatchObject({ ok: true })
    const sale = venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }])
    expect(sale.total).toBe(7)
    expect((await persist(sale)).replayed).toBe(false)
    expect(await saldoTexto(queijo.id)).toEqual({ stock: "4.65", dep: "4.65" })
    expect((await livro(queijo.id)).map((m) => [m.q, m.a, m.d])).toEqual([["5", "0", "5"], ["-0.35", "5", "4.65"]])
    const row = await prisma.venda.findUniqueOrThrow({ where: { pedidoId: sale.id! }, include: { itens: true } })
    expect(row.total).toBe(7)
    expect(row.itens).toHaveLength(1)
    expect(row.itens[0].quantidade).toBeNull()
    expect(itemCommercialQuantity(row.itens[0])).toBe(0.35)
    expect(row.itens[0]).toMatchObject({ precoUnitario: 20, lineTotal: 7, inventoryId: queijo.id })
    expect((row.payload as unknown as SalePayload).lines?.[0]).toMatchObject({ quantity: 0.35, quantityUnit: "KG", weightSource: "manual", unitPrice: 20, lineTotal: 7 })
    expect(await prisma.movimentacaoFinanceira.findMany({ where: { referenciaId: sale.id } })).toMatchObject([{ valor: 7, tipo: "entrada", origem: "venda" }])
    // Replay após perda de resposta não baixa de novo.
    expect((await persist(structuredClone(sale))).replayed).toBe(true)
    expect(await saldoTexto(queijo.id)).toEqual({ stock: "4.65", dep: "4.65" })
    expect(await livro(queijo.id)).toHaveLength(2)
  })

  it.each([
    [0.001, 0.02, "9.999"],
    [0.125, 2.5, "9.875"],
    [1.25, 25, "8.75"],
    [2.35, 47, "7.65"],
    [9.999, 199.98, "0.001"],
  ])("peso %s kg × R$ 20,00 = R$ %s; saldo %s kg", async (q, total, saldo) => {
    const p = await produto({ name: "Mortadela sintética", price: 20 })
    await entrada(p.id, 10)
    const sale = venda([{ id: p.id, name: p.name, quantity: q, price: 20 }])
    expect(sale.total).toBe(total)
    await persist(sale)
    expect((await saldoTexto(p.id)).stock).toBe(saldo)
    const item = await prisma.itemVenda.findFirstOrThrow({ where: { inventoryId: p.id } })
    expect(itemCommercialQuantity(item)).toBe(q)
    expect(item.lineTotal).toBe(total)
  })

  it("carrinho misto KG + UN e dois caixas concorrentes somam gramas exatas sem venda duplicada", async () => {
    const queijo = await produto({ name: "Queijo sintético", price: 20 })
    const refri = await produto({ name: "Refrigerante UN", price: 7.5, metadata: {} })
    await entrada(queijo.id, 5); await entrada(refri.id, 10)
    const misto = venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }, { id: refri.id, name: refri.name, quantity: 2, price: 7.5 }])
    expect(misto.total).toBe(22)
    await persist(misto)
    const [c1, c2] = [venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }]), venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }])]
    const results = await Promise.allSettled([
      persistSaleV2({ storeId: A, sale: c1, clientSaleId: randomUUID(), options: LIVE }),
      persistSaleV2({ storeId: A, sale: c2, clientSaleId: randomUUID(), options: LIVE }),
    ])
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"])
    expect((await saldoTexto(queijo.id)).stock).toBe("3.95")
    expect((await saldoTexto(refri.id)).stock).toBe("8")
    expect(await livro(queijo.id)).toHaveLength(4)
  })

  it("SKU alterado após o carrinho: a linha com Produto.id baixa o produto certo", async () => {
    const queijo = await produto({ name: "Queijo sintético", price: 20, sku: "QJ-ANTIGO" })
    await entrada(queijo.id, 5)
    await prisma.produto.update({ where: { id: queijo.id }, data: { sku: "QJ-NOVO" } })
    const sale = venda([{ id: "QJ-ANTIGO", produtoId: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }])
    await persist(sale)
    expect((await saldoTexto(queijo.id)).stock).toBe("4.65")
    expect((await prisma.itemVenda.findFirstOrThrow({ where: { venda: { pedidoId: sale.id! } } })).inventoryId).toBe(queijo.id)
  })

  it("falha de pagamento, preço divergente e produto de outra loja não baixam estoque", async () => {
    const queijo = await produto({ name: "Queijo sintético", price: 20 })
    const outra = await produto({ name: "Queijo outra loja", price: 20, storeId: B })
    await entrada(queijo.id, 5); await entrada(outra.id, 5, B)
    const pagamento = venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }]); pagamento.paymentBreakdown = { dinheiro: 6.99 }
    const preco = venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 19 }])
    const cruzada = venda([{ id: outra.id, name: outra.name, quantity: 0.35, price: 20 }])
    for (const sale of [pagamento, preco, cruzada]) await expect(persist(sale)).rejects.toBeInstanceOf(Error)
    expect((await saldoTexto(queijo.id)).stock).toBe("5")
    expect((await saldoTexto(outra.id)).stock).toBe("5")
    expect(await prisma.venda.count({ where: { pedidoId: { in: [pagamento.id!, preco.id!, cruzada.id!] } } })).toBe(0)
  })

  it("produto excluído durante a venda (SKU antigo + Produto.id) aborta sem venda, item nem financeiro", async () => {
    const p = await prisma.produto.create({ data: { id: "kg-pad-del-" + randomUUID(), storeId: A, name: "Queijo excluído", stock: 5, price: 20, metadata: KG, sku: "QJ-DEL-ANTIGO" } })
    await prisma.produto.update({ where: { id: p.id }, data: { sku: "QJ-DEL-NOVO" } })
    const sale = venda([{ id: "QJ-DEL-ANTIGO", produtoId: p.id, name: p.name, quantity: 0.35, price: 20 }])
    let release!: () => void, locked!: () => void
    const gate = new Promise<void>((r) => { release = r }), isLocked = new Promise<void>((r) => { locked = r })
    const remover = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM estoque_produtos WHERE id = ${p.id} FOR UPDATE`
      locked(); await gate
      await tx.produto.delete({ where: { id: p.id } })
    }, { timeout: 20000, maxWait: 20000 })
    await isLocked
    const vendaEmCurso = persist(sale)
    const outcome = vendaEmCurso.then(() => "ok", (e: unknown) => e)
    await new Promise((r) => setTimeout(r, 500))
    release(); await remover
    expect(await outcome).toBeInstanceOf(Error)
    expect(await prisma.venda.count({ where: { pedidoId: sale.id! } })).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: sale.id! } })).toBe(0)
  })

  // Valores monetários coerentes com cada peso: a recusa precisa ser a de PESO, não de divergência de total.
  it.each([[0, 0], [-0.35, 0], [0.0005, 0.01], [0.3505, 7.01]])("peso inválido %s é recusado sem escrita (total coerente R$ %s)", async (q, money) => {
    const queijo = await produto({ name: "Queijo sintético", price: 20 })
    await entrada(queijo.id, 5)
    const sale = venda([{ id: queijo.id, name: queijo.name, quantity: 0.35, price: 20 }])
    sale.lines![0].quantity = q; sale.lines![0].lineTotal = money; sale.total = money; sale.paymentBreakdown = { dinheiro: money }
    await expect(persist(sale)).rejects.toThrow(/Peso inválido/)
    expect((await saldoTexto(queijo.id)).stock).toBe("5")
    expect(await prisma.venda.count({ where: { pedidoId: sale.id! } })).toBe(0)
  })

  it("produto sem preço válido é recusado", async () => {
    const semPreco = await produto({ name: "Sem preço", price: 0 })
    await entrada(semPreco.id, 5)
    const sale = venda([{ id: semPreco.id, name: semPreco.name, quantity: 0.35, price: 20 }])
    sale.lines![0].unitPrice = 0; sale.lines![0].lineTotal = 0; sale.total = 0; sale.paymentBreakdown = { dinheiro: 0 }
    await expect(persist(sale)).rejects.toBeInstanceOf(Error)
    expect((await saldoTexto(semPreco.id)).stock).toBe("5")
  })
})
