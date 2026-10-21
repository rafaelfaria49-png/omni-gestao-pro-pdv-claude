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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/vendas/guard-correcao-venda", () => ({ requireCorrecaoVendaAuth: async () => ({ ok: true, session: null }) }))
vi.mock("@/lib/auth/verify-supervisor-pin", () => ({ authenticateSupervisorPin: async () => ({ name: "Supervisor CI" }) }))
vi.mock("@/lib/cadastros/cadastros-action-access", () => ({ requireCadastrosActionAccess: async (storeId: string) => ({ storeId, session: null }) }))
vi.mock("@/lib/cadastros/hub-api-gate", () => ({ requireCadastrosHubApi: async (req: Request) => ({ ok: true, storeId: req.headers.get("x-assistec-loja-id"), session: null }) }))
import { POST as postV1 } from "@/app/api/ops/venda-persist/route"
import { POST as postV2 } from "@/app/api/ops/venda-persist/v2/route"
import { POST as correctItems } from "@/app/api/vendas/[id]/corrigir-itens/route"
import { PATCH as patchProduct } from "@/app/api/produtos/[id]/route"
import { upsertProduto } from "@/app/actions/cadastros"
import { registrarEntradaEstoque, registrarAjusteEstoque } from "@/app/actions/estoque"
import { consumeEstoqueFromOS, applyEstoqueDelta, restoreEstoqueFromOS } from "@/lib/operacoes/adapters/os-estoque"

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
      ordens: await db.ordemServico.findMany({ where: { storeId }, orderBy: { id: "asc" } }),
      pecas: await db.ordemServicoItem.findMany({ where: { ordemServico: { storeId } }, orderBy: { id: "asc" } }),
    }
  }

  it.each(["cadastro", "REST-stock", "REST-misto", "entrada", "ajuste"])("%s: peso não recebe saldo unitário, sem escrita cadastral parcial", async (kind) => {
    const product = await db.produto.findFirstOrThrow({ where: { storeId, sku: "WEIGHT" } })
    const before = await snapshot()
    if (kind.startsWith("REST")) {
      const req = new Request("http://localhost/api/produtos/fixture", { method: "PATCH", headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify({ stock: 5, ...(kind === "REST-misto" ? { name: "Não salvar", price: 99 } : {}) }) })
      const result = await patchProduct(req, { params: Promise.resolve({ id: product.id }) })
      expect(result.status).toBe(409)
      expect(await result.json()).toMatchObject({ code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" })
    } else if (kind === "cadastro") {
      expect(await upsertProduto(storeId, { id: product.id, nome: "Não salvar", estoque: 5 })).toMatchObject({ ok: false, type: "VALIDATION_ERROR" })
    } else {
      const result = kind === "entrada" ? await registrarEntradaEstoque(storeId, { produtoId: product.id, quantidade: 5 })
        : await registrarAjusteEstoque(storeId, { produtoId: product.id, novoSaldo: 5, motivo: "CI" })
      expect(result).toMatchObject({ ok: false, code: "PRODUTO_POR_PESO_NAO_OPERACIONAL" })
    }
    expect(await snapshot()).toEqual(before)
  })
  async function correct(payload: SalePayload, lines: unknown[]) {
    const req = new Request("http://localhost/api/vendas/fixture/corrigir-itens", { method: "POST", headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify({ motivo: "CI", supervisorPin: "fixture", expectedTotal: payload.total, itens: lines }) })
    return correctItems(req, { params: Promise.resolve({ id: payload.id! }) })
  }
  it.each(["WEIGHT", "BAD"])("correção de venda rejeita nova baixa de %s sem efeitos parciais", async (sku) => {
    const payload = sale()
    payload.lines = [payload.lines![0]]; payload.total = 20; payload.paymentBreakdown = { dinheiro: 20 }
    expect((await post("v1", payload)).status).toBe(200)
    const before = await snapshot()
    const result = await correct(payload, [{ inventoryId: unitId, nome: "Unitário", quantidade: 2, precoUnitario: 10 }, { inventoryId: sku, nome: "Incompatível", quantidade: 1, precoUnitario: 10 }])
    expect(result.status).toBe(409)
    expect(await result.json()).toMatchObject({ code: sku === "WEIGHT" ? "PRODUTO_POR_PESO_NAO_OPERACIONAL" : "PRODUTO_COMERCIAL_INVALIDO" })
    expect(await snapshot()).toEqual(before)
  })
  it.each(["consumo", "delta"])("OS %s: item unitário seguido de peso reverte saldo, ledger, rascunho e payload", async (kind) => {
    const weightProduct = await db.produto.findFirstOrThrow({ where: { storeId, sku: "WEIGHT" } })
    const osId = randomUUID()
    const payload = { id: osId, storeId, status: "aberta", estoqueConsumido: kind === "delta", pecas: [
      { id: unitId, produtoId: unitId, nome: "Unitário", quantidade: 3 },
      { id: weightProduct.id, produtoId: weightProduct.id, nome: "Peso", quantidade: 1 },
    ] }
    await db.ordemServico.create({ data: { id: osId, storeId, payload } })
    await db.ordemServicoItem.create({ data: { ordemServicoId: osId, produtoId: unitId, quantidade: 2, precoUnitario: 10 } })
    const before = await snapshot()
    const result = kind === "consumo" ? await consumeEstoqueFromOS({ storeId, osId }) : await applyEstoqueDelta({ storeId, osId, revisaoKey: "CI" })
    expect(result).toMatchObject({ ok: false, status: "error", error: expect.stringContaining("Produto por peso") })
    expect(await snapshot()).toEqual(before)
  })
  it("estorno histórico da OS continua compensando após declaração posterior de peso", async () => {
    const osId = randomUUID()
    await db.ordemServico.create({ data: { id: osId, storeId, payload: { id: osId, storeId, status: "aberta", pecas: [{ id: unitId, produtoId: unitId, nome: "Unitário", quantidade: 2 }] } } })
    expect(await consumeEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true, status: "consumed" })
    await db.produto.update({ where: { id: unitId }, data: { metadata: { comercial: weight } } })
    expect(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true, status: "restored" })
    expect((await db.produto.findUniqueOrThrow({ where: { id: unitId } })).stock).toBe(10)
    const before = await snapshot()
    expect(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true })
    expect(await snapshot()).toEqual(before)
  })
  it("correção que devolve estoque histórico não bloqueia por metadata posterior", async () => {
    const payload = sale()
    payload.lines = [payload.lines![0]]; payload.total = 20; payload.paymentBreakdown = { dinheiro: 20 }
    expect((await post("v1", payload)).status).toBe(200)
    await db.produto.update({ where: { id: unitId }, data: { metadata: { comercial: weight } } })
    const result = await correct(payload, [{ inventoryId: unitId, nome: "Unitário", quantidade: 1, precoUnitario: 10 }])
    expect(result.status).toBe(200)
    expect((await db.produto.findUniqueOrThrow({ where: { id: unitId } })).stock).toBe(9)
  })

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
  it.each([{ vendaPorPeso: true }, { atributos: { vendaPorPeso: true } }])("flag legada não reinterpreta produto unitário nem seu saldo: %j", async (metadata) => {
    const before = await snapshot()
    expect(await updateProduct(context(), unitId, { metadata }, { db: productDb() })).toMatchObject({ ok: false, code: "VALIDATION" })
    expect(await snapshot()).toEqual(before)
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
  it("blob antigo de tema/atalhos não desfaz configuração confirmada de recursos", async () => {
    const stale = (await db.storeSettings.findUniqueOrThrow({ where: { storeId } })).printerConfig as Prisma.JsonObject
    await persistStoreSettingsPut(db as unknown as StoreSettingsPutDb, storeId, { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "variedades", presentation: { productExample: "Atual" } }, overrides: { "catalog.weight": false } } } })
    await persistStoreSettingsPut(second as unknown as StoreSettingsPutDb, storeId, { printerConfig: { ...stale, appearance: { studioTheme: "midnight" } } })
    expect((await db.storeSettings.findUniqueOrThrow({ where: { storeId } })).printerConfig).toMatchObject({ appearance: { studioTheme: "midnight" }, capabilities: { business: { primaryBranch: "variedades", presentation: { productExample: "Atual" } }, overrides: { "catalog.weight": false } } })
  })
})
