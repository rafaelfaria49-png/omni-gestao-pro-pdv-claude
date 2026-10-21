/** PostgreSQL real, exclusivamente no serviço descartável da CI. Sem .env. */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient, type Prisma } from "@/generated/prisma"
import { assertIsolatedCadastrosDatabase } from "../../scripts/cadastros/isolated-postgres-guard.mjs"
import { createProduct, updateProduct, updateProductTx, type ProductWriteDb, type ProductWriteTx } from "./product-write-service"
import { persistStoreSettingsPut, type StoreSettingsPutDb } from "@/lib/store-settings-put"
import type { SalePayload } from "@/lib/ops-upsert-venda"

const h = vi.hoisted(() => ({ db: undefined as unknown }))
vi.mock("@/lib/prisma", () => ({ get prisma() { return h.db }, prismaEnsureConnected: async () => {} }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "fixture", role: "ADMIN", name: "CI" } }) }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: async () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))
vi.mock("@/lib/vendas/sale-numbering-runtime-gate", () => ({ resolveSaleNumberingWriter: () => ({ writer: "v2", reason: "flag" }) }))
import { POST as postV1 } from "@/app/api/ops/venda-persist/route"
import { POST as postV2 } from "@/app/api/ops/venda-persist/v2/route"

const url = process.env.RAMOS_TEST_DATABASE_URL
if (url && assertIsolatedCadastrosDatabase(process.env) !== url) throw new Error("ISOLATED_DATABASE_REQUIRED")
const unit = { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } as const
const weight = { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } as const
const txOptions = { maxWait: 15_000, timeout: 20_000 }
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe.skipIf(!url)("PR #295 — roundtrip, concorrência e rollback reais", () => {
  let db: PrismaClient, second: PrismaClient
  let storeId: string, sessionId: string, unitId: string
  const context = () => ({ storeId, principal: { userId: "fixture", role: "ADMIN", email: "fixture@example.test", displayLabel: "CI" } })
  const productDb = () => db as unknown as ProductWriteDb

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: url })
    second = new PrismaClient({ datasourceUrl: url })
    h.db = db
  })
  afterAll(async () => { await db?.$disconnect(); await second?.$disconnect() })
  beforeEach(async () => {
    storeId = `ramos-295-${randomUUID()}`
    await db.store.create({ data: { id: storeId, name: "Loja sintética", codigoNumeracaoVenda: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase() } })
    await db.storeSettings.create({ data: { storeId, printerConfig: { pdvMainLayout: "classic", capabilities: { version: 1, business: { primaryBranch: "padaria" }, overrides: { "catalog.variants": true } } } } })
    const normal = await createProduct(context(), { nome: "Unitário", sku: "UNIT", estoque: 10, preco: 10, custo: 5, garantia: 90,
      metadata: { comercial: unit, atributos: { modeloCompativel: "Histórico", descricao: "Original" }, fiscal: { ncm: "12345678" } } }, { db: productDb() })
    expect(normal.ok).toBe(true)
    if (!normal.ok) throw new Error(normal.message)
    unitId = normal.id
    const pesavel = await createProduct(context(), { nome: "Pesável", sku: "WEIGHT", preco: 10, metadata: { comercial: weight } }, { db: productDb() })
    expect(pesavel.ok).toBe(true)
    await db.produto.create({ data: { storeId, name: "Declaração inválida histórica", sku: "BAD", price: 10, metadata: { comercial: { ...unit, unidade: "KG", basePreco: "KG" } } } })
    sessionId = (await db.sessaoCaixa.create({ data: { storeId, operador: "CI" } })).id
  })

  function sale(sku = "WEIGHT"): SalePayload {
    return { id: `VDA-CI-${randomUUID()}`, at: new Date().toISOString(), total: 30, sessaoId: sessionId,
      lines: [{ inventoryId: "UNIT", name: "Primeiro item", quantity: 2, unitPrice: 10, lineTotal: 20 }, { inventoryId: sku, name: "Segundo item", quantity: 1, unitPrice: 10, lineTotal: 10 }],
      paymentBreakdown: { dinheiro: 10, aPrazo: 20 } }
  }
  async function post(version: "v1" | "v2", payload: SalePayload, clientSaleId = `cs_attempt_${randomUUID().replaceAll("-", "")}`) {
    const req = new Request(`http://localhost/api/ops/venda-persist/${version}`, { method: "POST", headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify({ sale: payload, clientSaleId }) })
    const res = await (version === "v1" ? postV1(req) : postV2(req))
    return { status: res.status, body: await res.json() }
  }
  async function snapshot() {
    return {
      vendas: await db.venda.count({ where: { storeId } }),
      itens: await db.itemVenda.count({ where: { venda: { storeId } } }),
      financeiro: await db.movimentacaoFinanceira.count({ where: { storeId } }),
      titulos: await db.contaReceberTitulo.count({ where: { storeId } }),
      ledger: await db.movimentacaoEstoque.count({ where: { storeId } }),
      produtos: await db.produto.findMany({ where: { storeId }, orderBy: { id: "asc" }, select: { id: true, stock: true, price: true, precoCusto: true, metadata: true } }),
      saldos: await db.produtoDeposito.findMany({ where: { storeId }, orderBy: { produtoId: "asc" } }),
      series: await db.serieVenda.findMany({ where: { storeId } }),
    }
  }

  it.each(["v1", "v2"] as const)("%s: item unitário seguido de peso rejeita e reverte venda, itens, pagamento, títulos, estoque e numeração", async (version) => {
    await persistStoreSettingsPut(db as unknown as StoreSettingsPutDb, storeId, { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.weight": false } } } })
    const before = await snapshot()
    const result = await post(version, sale())
    expect(result).toMatchObject({ status: 409, body: { code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" } })
    expect(await snapshot()).toEqual(before)
  })
  it.each(["v1", "v2"] as const)("%s: declaração inválida falha explicitamente sem efeitos parciais", async (version) => {
    const before = await snapshot()
    expect(await post(version, sale("BAD"))).toMatchObject({ status: 409, body: { code: "PRODUTO_COMERCIAL_INVALIDO" } })
    expect(await snapshot()).toEqual(before)
  })
  it.each(["v1", "v2"] as const)("%s: venda unitária e replay confirmado preservam efeitos, mesmo após declaração posterior de peso", async (version) => {
    const payload = sale()
    payload.lines = [payload.lines![0]]
    payload.total = 20
    payload.paymentBreakdown = { dinheiro: 20 }
    const key = `cs_attempt_${randomUUID().replaceAll("-", "")}`
    expect(await post(version, payload, key)).toMatchObject({ status: 200, body: { replayed: false } })
    expect((await db.produto.findUniqueOrThrow({ where: { id: unitId } })).stock).toBe(8)
    expect(await db.movimentacaoFinanceira.count({ where: { storeId } })).toBe(1)
    // Apenas fixture isolada: simula produto alterado/importado depois da venda confirmada.
    await db.produto.update({ where: { id: unitId }, data: { metadata: { comercial: weight } } })
    await db.sessaoCaixa.update({ where: { id: sessionId }, data: { status: "FECHADA" } })
    const before = await snapshot()
    expect(await post(version, payload, key)).toMatchObject({ status: 200, body: { replayed: true } })
    expect(await snapshot()).toEqual(before)
    await db.sessaoCaixa.update({ where: { id: sessionId }, data: { status: "ABERTA" } })
    expect(await post(version, { ...payload, id: `VDA-CI-${randomUUID()}` })).toMatchObject({ status: 409, body: { code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" } })
    expect(await snapshot()).toEqual(before)
  })
  it("patch do formulário com seções ocultas preserva fiscal, garantia, vínculos e unidade ao reabrir", async () => {
    const before = await db.produto.findUniqueOrThrow({ where: { id: unitId } })
    expect(await updateProduct(context(), unitId, { nome: "Reaberto", metadata: { atributos: { descricao: "Nova" } } }, { db: productDb() })).toMatchObject({ ok: true })
    const after = await db.produto.findUniqueOrThrow({ where: { id: unitId } })
    expect(after).toMatchObject({ stock: before.stock, price: before.price, warrantyDays: 90,
      metadata: { comercial: unit, fiscal: { ncm: "12345678" }, atributos: { modeloCompativel: "Histórico", descricao: "Nova" } } })
  })
  it("patches de produto em duas conexões preservam chaves omitidas sob lock real", async () => {
    const written = deferred(), proceed = deferred(), observed = deferred()
    const pids = new Set<number>()
    const first = db.$transaction(async (tx) => {
      pids.add((await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid)
      const result = await updateProductTx(tx as unknown as ProductWriteTx, context(), unitId, { metadata: { atributos: { descricao: "Concorrente" } } })
      written.resolve()
      await proceed.promise
      return result
    }, txOptions)
    await written.promise
    const other = second.$transaction(async (tx) => {
      pids.add((await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid)
      const wrapped = { ...tx,
        $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => { observed.resolve(); return tx.$queryRaw(query, ...values) },
        produto: { ...tx.produto, findFirst: async (args: Prisma.ProdutoFindFirstArgs) => { const row = await tx.produto.findFirst(args); observed.resolve(); return row } },
      }
      return updateProductTx(wrapped as unknown as ProductWriteTx, context(), unitId, { metadata: { atributos: { tags: ["Nova"] } } })
    }, txOptions)
    try { await observed.promise } finally { proceed.resolve() }
    expect((await Promise.all([first, other])).every((result) => result.ok)).toBe(true)
    expect(pids.size).toBe(2)
    expect((await db.produto.findUniqueOrThrow({ where: { id: unitId } })).metadata).toMatchObject({
      comercial: unit, atributos: { modeloCompativel: "Histórico", descricao: "Concorrente", tags: ["Nova"] },
    })
  })
  it("patches concorrentes de configuração preservam false explícito, apresentação e layout sem converter produtos", async () => {
    const products = (await snapshot()).produtos
    const writer = db as unknown as StoreSettingsPutDb
    await Promise.all([
      persistStoreSettingsPut(writer, storeId, { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "variedades", presentation: { productExample: "Meu produto" } } } } }),
      persistStoreSettingsPut(writer, storeId, { printerConfig: { capabilities: { version: 1, overrides: { "catalog.weight": false } } } }),
    ])
    await persistStoreSettingsPut(writer, storeId, { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } })
    expect((await db.storeSettings.findUniqueOrThrow({ where: { storeId } })).printerConfig).toMatchObject({
      pdvMainLayout: "classic", capabilities: { business: { primaryBranch: "padaria", presentation: { productExample: "Meu produto" } }, overrides: { "catalog.weight": false, "catalog.variants": true } },
    })
    expect((await snapshot()).produtos).toEqual(products)
  })
})
