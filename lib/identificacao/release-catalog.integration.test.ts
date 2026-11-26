import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Prisma, PrismaClient } from "@/generated/prisma"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const url = process.env.VESTUARIO_P03_TEST_DATABASE_URL ?? ""
if (url && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/vest_p02_[a-z0-9_]+$/.test(url)) {
  throw new Error("A regressão P03 exige banco vest_p02_* em loopback.")
}

const catalogCases: Array<{ segment: string; metadata?: Prisma.InputJsonValue }> = [
  { segment: "convencional" },
  { segment: "vestuario-simples", metadata: { vestuario: "camiseta", atributos: { cor: "Azul", tamanho: "M" } } },
  { segment: "padaria-peso", metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } },
  { segment: "acessorio", metadata: { acessorios: { tipo: "capinha" }, atributos: { cor: "Azul" } } },
  { segment: "aparelho", metadata: { serializedDevice: { version: 1 } } },
]

describe.skipIf(!url)("gatilhos P03 no catálogo legado com o rollout desligado", () => {
  const db = new PrismaClient<Prisma.PrismaClientOptions>({ datasourceUrl: url })
  const run = "gate-" + Date.now().toString(36)
  const storeId = run + "-a"
  const otherStoreId = run + "-b"

  beforeAll(async () => {
    const [identity] = await db.$queryRaw<{ database: string; directory: string; p03: string | null }[]>(
      Prisma.sql`SELECT current_database() AS database, current_setting('data_directory') AS directory, to_regclass('public.identificador_chaves')::text AS p03`,
    )
    expect(identity.database).toBe(new URL(url).pathname.slice(1))
    if (process.env.CI !== "true") expect(identity.directory).toContain("scratchpad")
    expect(identity.p03).toBe("identificador_chaves")

    await db.store.createMany({ data: [storeId, otherStoreId].map(id => ({ id, name: id })) })
    vi.stubEnv("VESTUARIO_P03_PRODUCTION_ENABLED", "0")
    vi.stubEnv("VESTUARIO_P03_ENABLED", "0")
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await db.$disconnect()
  })

  it.each(catalogCases)("preserva cadastro, preço e metadata de $segment", async ({ segment, metadata }) => {
    const id = run + "-" + segment
    const sku = id.toUpperCase()
    await db.produto.create({ data: { id, storeId, name: segment, sku, metadata, price: 20 } })
    const updated = await db.produto.update({
      where: { id },
      data: { name: segment + " QA", price: 25, barcode: sku + "-BAR" },
    })
    expect(updated).toMatchObject({ name: segment + " QA", price: 25, storeId })
    if (metadata) expect(updated.metadata).toEqual(metadata)
    expect(await db.identificadorChave.findMany({
      where: { storeId, chave: { in: [sku, sku + "-BAR"] } },
      select: { produtoId: true, identificadorId: true },
    })).toEqual([
      { produtoId: id, identificadorId: null },
      { produtoId: id, identificadorId: null },
    ])
    expect(await db.identificadorProduto.count({ where: { storeId, produtoId: id } })).toBe(0)
  })

  it("separa SKUs iguais por loja e conserva as chaves após saída de estoque", async () => {
    const produtoId = run + "-stock"
    const sku = produtoId.toUpperCase()
    await db.produto.createMany({ data: [
      { id: produtoId, storeId, name: "Estoque A", sku, stock: 4, price: 20 },
      { id: produtoId + "-b", storeId: otherStoreId, name: "Estoque B", sku, stock: 7, price: 20 },
    ] })
    const deposit = await db.deposito.create({
      data: { storeId, nome: "Principal", codigo: "PRINCIPAL", principal: true, ativo: true },
    })
    await db.produtoDeposito.create({
      data: { storeId, produtoId, depositoId: deposit.id, quantidade: 4 },
    })
    const keySnapshot = await db.identificadorChave.findMany({
      where: { chave: sku }, orderBy: { storeId: "asc" },
    })
    expect(keySnapshot.map(row => row.storeId)).toEqual([storeId, otherStoreId])
    const write = await db.$transaction(tx => applyStockMutationTx(
      tx as unknown as StockLedgerTx,
      { storeId, principal: null, source: "p03-release-qa" },
      { kind: "saida", produtoId, quantidade: 1, depositoId: deposit.id, origem: "pdv", idempotencyKey: run },
    ))
    expect(write).toMatchObject({ ok: true })
    expect(await db.produto.findUnique({ where: { id: produtoId }, select: { stock: true } })).toEqual({ stock: 3 })
    expect(await db.produto.findUnique({ where: { id: produtoId + "-b" }, select: { stock: true } })).toEqual({ stock: 7 })
    expect(await db.produtoDeposito.findFirst({ where: { storeId, produtoId }, select: { quantidade: true } })).toEqual({ quantidade: 3 })
    expect(await db.movimentacaoEstoque.count({ where: { storeId, produtoId, origem: "pdv" } })).toBe(1)
    expect(await db.identificadorChave.findMany({ where: { chave: sku }, orderBy: { storeId: "asc" } })).toEqual(keySnapshot)
  })
})
