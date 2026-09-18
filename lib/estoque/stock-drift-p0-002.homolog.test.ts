/**
 * Homologação env-gated do P0-002 contra banco NÃO-produção.
 * Só roda com RUN_P0_002_HOMOLOG=1 e DATABASE_URL de omnigestao_prod_candidate
 * ou visual_dev. Nunca aponta para omnigestao_prod.
 */
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { applyStockMutation } from "@/lib/estoque/stock-ledger-service"
import { StockLedgerBusinessError, upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"

const RUN = process.env.RUN_P0_002_HOMOLOG === "1"
const STORE_A = "loja-1"
const STORE_B = "loja-visual-dev"
const RUN_ID = `p0002h${Date.now().toString(36)}`
const ctx = (storeId: string) => ({
  storeId,
  principal: { userId: "homolog-p0-002" },
  source: "pdv" as const,
  operatorLabel: "homolog-p0-002",
})

function dbName(): string {
  const raw = process.env.DATABASE_URL ?? ""
  try {
    return new URL(raw).pathname.replace(/^\//, "").split("?")[0] ?? ""
  } catch {
    return ""
  }
}

const ALLOWED = /^(omnigestao_prod_candidate|omnigestao_visual_dev)$/

describe.skipIf(!RUN)("P0-002 homologação (serviço real, banco não-prod)", () => {
  const createdProductIds: string[] = []
  const createdVendaIds: string[] = []
  let serieId: string | null = null
  let hasIdempotencyColumn = false

  it("recusa omnigestao_prod", async () => {
    expect(dbName()).toMatch(ALLOWED)
    expect(dbName()).not.toBe("omnigestao_prod")
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movimentacoes_estoque' AND column_name = 'idempotencyKey'
    `
    hasIdempotencyColumn = cols.length > 0
  })

  async function seedProduct(opts: {
    storeId: string
    stock: number
    depositQty: number | null
    suffix: string
  }) {
    const id = `${RUN_ID}-${opts.suffix}`
    const sku = `${RUN_ID}-${opts.suffix}`
    await prisma.produto.create({
      data: {
        id,
        storeId: opts.storeId,
        name: `P0-002 homolog ${opts.suffix}`,
        sku,
        stock: opts.stock,
        price: 20,
        precoCusto: 5,
        active: true,
        status: "Ativo",
      },
    })
    createdProductIds.push(id)
    const dep = await prisma.deposito.findFirst({
      where: { storeId: opts.storeId, OR: [{ principal: true }, { codigo: "PRINCIPAL" }] },
      select: { id: true },
    })
    let depositoId = dep?.id
    if (!depositoId) {
      const created = await prisma.deposito.create({
        data: {
          storeId: opts.storeId,
          nome: "Depósito Principal",
          codigo: "PRINCIPAL",
          ativo: true,
          principal: true,
        },
        select: { id: true },
      })
      depositoId = created.id
    }
    if (opts.depositQty !== null) {
      await prisma.produtoDeposito.create({
        data: {
          storeId: opts.storeId,
          produtoId: id,
          depositoId,
          quantidade: opts.depositQty,
        },
      })
    }
    return { id, depositoId }
  }

  it("cobre saldos iguais, overhang, zero-row, undercount sem prova, duas lojas e retry", async () => {
    const aligned = await seedProduct({ storeId: STORE_A, stock: 4, depositQty: 4, suffix: "eq" })
    const overhang = await seedProduct({ storeId: STORE_A, stock: 4, depositQty: 5, suffix: "ov" })
    const zeroRow = await seedProduct({ storeId: STORE_A, stock: 7, depositQty: 0, suffix: "zr" })
    const unproven = await seedProduct({ storeId: STORE_A, stock: 10, depositQty: 4, suffix: "up" })
    const otherStore = await seedProduct({ storeId: STORE_B, stock: 8, depositQty: 8, suffix: "b" })

    const rEq = await applyStockMutation(ctx(STORE_A), {
      kind: "saida",
      produtoId: aligned.id,
      quantidade: 1,
      origem: "pdv",
      realinharDepositoAoStock: true,
    })
    expect(rEq.ok).toBe(true)
    expect((await prisma.produto.findUnique({ where: { id: aligned.id } }))?.stock).toBe(3)

    const rOv = await applyStockMutation(ctx(STORE_A), {
      kind: "saida",
      produtoId: overhang.id,
      quantidade: 1,
      origem: "pdv",
      realinharDepositoAoStock: true,
    })
    expect(rOv.ok).toBe(true)
    expect((await prisma.produto.findUnique({ where: { id: overhang.id } }))?.stock).toBe(3)
    const ovDeps = await prisma.produtoDeposito.findMany({ where: { produtoId: overhang.id } })
    expect(ovDeps.reduce((s, r) => s + r.quantidade, 0)).toBe(3)
    const ovMovs = await prisma.movimentacaoEstoque.findMany({ where: { produtoId: overhang.id } })
    expect(ovMovs.map((m) => m.origem).sort()).toEqual(["estoque-reconcile", "pdv"])

    const rZr = await applyStockMutation(ctx(STORE_A), {
      kind: "saida",
      produtoId: zeroRow.id,
      quantidade: 1,
      origem: "pdv",
      realinharDepositoAoStock: true,
    })
    expect(rZr.ok).toBe(true)
    expect((await prisma.produto.findUnique({ where: { id: zeroRow.id } }))?.stock).toBe(6)

    const rUp = await applyStockMutation(ctx(STORE_A), {
      kind: "saida",
      produtoId: unproven.id,
      quantidade: 1,
      origem: "pdv",
      realinharDepositoAoStock: true,
    })
    expect(rUp.ok).toBe(false)
    if (!rUp.ok) {
      expect(rUp.code).toBe("STOCK_INVARIANT_DRIFT")
      expect(rUp.drift?.driftReason).toBe("unproven_without_ledger")
    }
    expect((await prisma.produto.findUnique({ where: { id: unproven.id } }))?.stock).toBe(10)
    expect(
      (await prisma.movimentacaoEstoque.count({ where: { produtoId: unproven.id } })),
    ).toBe(0)

    const rB = await applyStockMutation(ctx(STORE_B), {
      kind: "saida",
      produtoId: otherStore.id,
      quantidade: 1,
      origem: "pdv",
      depositoId: otherStore.depositoId,
    })
    expect(rB.ok).toBe(true)
    expect((await prisma.produto.findUnique({ where: { id: otherStore.id } }))?.stock).toBe(7)
    expect((await prisma.produto.findUnique({ where: { id: unproven.id } }))?.stock).toBe(10)
  })

  it("registra que o visual_dev tem coluna de idempotência do ledger", () => {
    expect(hasIdempotencyColumn).toBe(true)
  })

  it("writer real: venda com overhang confirma uma vez e o retry não duplica", async () => {
    const prod = await seedProduct({ storeId: STORE_A, stock: 4, depositQty: 5, suffix: "vd" })
    const clientSaleId = `cs${RUN_ID}aaaaaa`
    const sale: SalePayload = {
      id: `PEND-${clientSaleId}`,
      at: new Date().toISOString(),
      total: 20,
      customerName: "Homolog P0-002",
      paymentBreakdown: { dinheiro: 20 },
      lines: [{ inventoryId: prod.id, name: "P0-002 homolog vd", quantity: 1, unitPrice: 20 }],
    }
    const serie = await prisma.serieVenda.create({
      data: { storeId: STORE_A, ano: 2099, prefixo: "H2", proximoNumero: 1, ativo: true },
      select: { id: true },
    })
    serieId = serie.id
    const allocate = async () => ({
      pedidoId: `VDA-P0002-${RUN_ID}`,
      serieVendaId: serie.id,
      anoNumero: 2099,
      numeroSequencial: 1,
    })
    const first = await prisma.$transaction((tx) =>
      upsertVendaInTransaction(tx, STORE_A, sale, "homolog-p0-002", {
        enforceStock: true,
        requireCaixaSession: false,
        v2: { clientSaleId, allocate },
      }),
    )
    createdVendaIds.push(first.venda.id)
    expect(first.replayed).toBe(false)
    expect((await prisma.produto.findUnique({ where: { id: prod.id } }))?.stock).toBe(3)
    const retry = await prisma.$transaction((tx) =>
      upsertVendaInTransaction(tx, STORE_A, sale, "homolog-p0-002", {
        enforceStock: true,
        requireCaixaSession: false,
        v2: { clientSaleId, allocate },
      }),
    )
    expect(retry.replayed).toBe(true)
    expect(retry.venda.id).toBe(first.venda.id)
    expect((await prisma.produto.findUnique({ where: { id: prod.id } }))?.stock).toBe(3)
    expect(await prisma.venda.count({ where: { clientSaleId } })).toBe(1)
  })

  it("writer real: SUM<stock sem livro não grava venda nem baixa", async () => {
    const prod = await seedProduct({ storeId: STORE_A, stock: 10, depositQty: 4, suffix: "bl" })
    const clientSaleId = `cs${RUN_ID}bbbbbb`
    const sale: SalePayload = {
      id: `PEND-${clientSaleId}`,
      at: new Date().toISOString(),
      total: 20,
      customerName: "Homolog P0-002",
      paymentBreakdown: { dinheiro: 20 },
      lines: [{ inventoryId: prod.id, name: "P0-002 homolog bl", quantity: 1, unitPrice: 20 }],
    }
    const sid = serieId
    expect(sid).toBeTruthy()
    await expect(
      prisma.$transaction((tx) =>
        upsertVendaInTransaction(tx, STORE_A, sale, "homolog-p0-002", {
          enforceStock: true,
          requireCaixaSession: false,
          v2: {
            clientSaleId,
            allocate: async () => ({
              pedidoId: `VDA-P0002B-${RUN_ID}`,
              serieVendaId: sid as string,
              anoNumero: 2099,
              numeroSequencial: 2,
            }),
          },
        }),
      ),
    ).rejects.toBeInstanceOf(StockLedgerBusinessError)
    expect(await prisma.venda.count({ where: { clientSaleId } })).toBe(0)
    expect((await prisma.produto.findUnique({ where: { id: prod.id } }))?.stock).toBe(10)
    expect(await prisma.movimentacaoEstoque.count({ where: { produtoId: prod.id } })).toBe(0)
  })

  afterAll(async () => {
    if (createdProductIds.length === 0 && createdVendaIds.length === 0) return
    await prisma.itemVenda.deleteMany({ where: { vendaId: { in: createdVendaIds } } }).catch(() => undefined)
    await prisma.movimentacaoFinanceira.deleteMany({
      where: { referenciaId: { in: createdVendaIds } },
    }).catch(() => undefined)
    await prisma.venda.deleteMany({ where: { id: { in: createdVendaIds } } }).catch(() => undefined)
    await prisma.venda.deleteMany({ where: { pedidoId: { startsWith: "VDA-P0002" } } }).catch(() => undefined)
    await prisma.movimentacaoEstoque.deleteMany({
      where: { produtoId: { in: createdProductIds } },
    }).catch(() => undefined)
    await prisma.produtoDeposito.deleteMany({ where: { produtoId: { in: createdProductIds } } }).catch(() => undefined)
    await prisma.produto.deleteMany({ where: { id: { in: createdProductIds } } }).catch(() => undefined)
    if (serieId) await prisma.serieVenda.deleteMany({ where: { id: serieId } }).catch(() => undefined)
    await prisma.$disconnect()
  })
})
