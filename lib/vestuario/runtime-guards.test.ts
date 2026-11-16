import { describe, expect, it, vi } from "vitest"
import type { Prisma } from "@/generated/prisma"
import {
  assertProductCommercialSaleSupported, assertNoUnsupportedVariantLines,
  productCommercialCatalogProjection, productStockMovementAvailability,
  ProductCommercialInvalidError, ProductVariantGuardError, ProductWeightNotOperationalError,
} from "@/lib/cadastros/product-commercial-contract"
import { createProductTx, updateProductTx, type ProductWriteTx } from "@/lib/cadastros/product-write-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { productVariantIssue, isCatalogDeclarationV1, CATALOG_DECLARATION_CONTRACT, SALE_LINE_CONTRACT } from "./guard-contract"
import { attachStockLedgerBoundaryToFakeTx } from "@/lib/estoque/stock-ledger-test-fake"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const grade = { vestuario: { contract: CATALOG_DECLARATION_CONTRACT, version: 1, mode: "COM_GRADE", gradeId: "adulto-a" } }
const simpleCommercial = { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" }
const context = { storeId: "loja-a", principal: null, source: "p01-synthetic" }

describe("legado preservado, sem reinterpretar descrição como grade", () => {
  it.each([undefined, null, {}, { comercial: simpleCommercial }, { comercial: { ...simpleCommercial, gradePlanejada: true } }, { atributos: { cor: "Preto", tamanho: "M" } }, { acessorios: { cor: "Azul" }, custom: "preservar" }])("simples %j segue vendável sem mutar entrada", (metadata) => {
    const before = JSON.stringify(metadata)
    expect(() => assertProductCommercialSaleSupported(metadata)).not.toThrow()
    expect(productVariantIssue(metadata)).toBeNull()
    expect(productCommercialCatalogProjection(metadata, 39.9)).toMatchObject({ vendaOperacional: true, gradeOperacional: false, precoNaBase: 39.9 })
    expect(productStockMovementAvailability(metadata)).toEqual({ disponivel: true, unidade: "UN", ajusteDisponivel: true })
    expect(JSON.stringify(metadata)).toBe(before)
  })
  it("preserva os bloqueios e códigos existentes de peso e declaração inválida", () => {
    expect(() => assertProductCommercialSaleSupported({ vendaPorPeso: true })).toThrow(ProductWeightNotOperationalError)
    expect(() => assertProductCommercialSaleSupported({ comercial: { version: 99 } })).toThrow(ProductCommercialInvalidError)
  })
  it("não confunde seleção de acessório com identidade de estoque", () => {
    expect(() => assertNoUnsupportedVariantLines([{ inventoryId: "produto-a", accessorySelection: { cor: "Preto", modelo: "Aparelho" }, atributosLabel: "M" }])).not.toThrow()
  })
  it.each(["camiseta", null, 1, { version: 1, mode: "COM_GRADE" }, { cor: "Preto", tamanho: "M" }])("metadata/linha vestuario livre %j continuam opacas sem adesão ao contrato", (vestuario) => {
    const metadata = { vestuario, comercial: simpleCommercial }
    expect(() => assertProductCommercialSaleSupported(metadata)).not.toThrow()
    expect(productVariantIssue(metadata)).toBeNull()
    expect(productStockMovementAvailability(metadata)).toEqual({ disponivel: true, unidade: "UN", ajusteDisponivel: true })
    expect(() => assertNoUnsupportedVariantLines([{ inventoryId: "p-a", vestuario }])).not.toThrow()
  })
  it("cadastro simples preserva metadata.vestuario livre sem alterar saldo", async () => {
    const create = vi.fn(async () => ({ id: "legacy-a" }))
    const tx = { produto: { findFirst: vi.fn(async () => null), create }, logsAuditoria: { create: vi.fn(async () => ({})) } } as unknown as ProductWriteTx
    const metadata = { vestuario: "camiseta", comercial: simpleCommercial, atributos: { cor: "Preto" } }
    expect(await createProductTx(tx, context, { nome: "Camiseta simples", metadata })).toEqual({ ok: true, id: "legacy-a", operacao: "create" })
    expect(create.mock.calls[0]).toBeDefined()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stock: 0, metadata }) }))
  })
  it("ledger simples com chave livre mantém baixa e replay idempotente", async () => {
    const products = [{ id: "p-a", storeId: "loja-a", name: "Camiseta simples", stock: 5, precoCusto: 10, sku: "LEGADO" }]
    const ledger: Array<Record<string, unknown>> = []
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: "p-a", hasVestuario: true, vestuario: "camiseta" }]),
      produto: {},
      movimentacaoEstoque: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { ledger.push(data); return { id: "mov-a" } }) },
    }
    attachStockLedgerBoundaryToFakeTx(tx, { products, ledger })
    const command = { kind: "saida" as const, produtoId: "p-a", quantidade: 1, origem: "pdv", idempotencyKey: "legacy-a" }
    expect(await applyStockMutationTx(tx as unknown as StockLedgerTx, context, command)).toMatchObject({ ok: true, estoqueDepois: 4, idempotente: false })
    expect(await applyStockMutationTx(tx as unknown as StockLedgerTx, context, command)).toMatchObject({ ok: true, idempotente: true })
    expect(products[0].stock).toBe(4)
    expect(ledger).toHaveLength(1)
  })
})

describe("guard de produto/linha novo, antes de persistir", () => {
  it("produto com grade sem variante é recusado com 409 comercial compatível", () => {
    expect(productVariantIssue(grade)?.code).toBe("VARIANTE_OBRIGATORIA")
    try { assertProductCommercialSaleSupported(grade); throw new Error("aceitou grade") } catch (e) {
      expect(e).toBeInstanceOf(ProductVariantGuardError)
      expect(e).toBeInstanceOf(ProductCommercialInvalidError)
      expect((e as ProductVariantGuardError).code).toBe("VARIANTE_OBRIGATORIA")
    }
    expect(productCommercialCatalogProjection(grade, 100).vendaOperacional).toBe(false)
    expect(productStockMovementAvailability(grade)).toMatchObject({ disponivel: false, motivo: "grade_em_preparacao" })
  })
  it("nem variante informada nem versão desconhecida habilitam venda na P01", () => {
    expect(productVariantIssue(grade, "var-a")?.code).toBe("VESTUARIO_NAO_OPERACIONAL")
    expect(productVariantIssue({ vestuario: { contract: CATALOG_DECLARATION_CONTRACT, version: 2, mode: "SIMPLES" } })?.code).toBe("CONTRATO_VARIACAO_INVALIDO")
    expect(isCatalogDeclarationV1({ contract: CATALOG_DECLARATION_CONTRACT, version: 1, mode: "SIMPLES", stock: 10 })).toBe(false)
    expect(isCatalogDeclarationV1({ contract: CATALOG_DECLARATION_CONTRACT, version: 1, mode: "COM_GRADE", gradeId: "a\nb" })).toBe(false)
    expect(() => assertNoUnsupportedVariantLines([{ vestuario: { contract: SALE_LINE_CONTRACT, version: 99 } }])).toThrow(ProductVariantGuardError)
  })

  it.each([{}, { enforceStock: true }, { historicalRecovery: true }])("writers de venda recusam variante antes de qualquer I/O %j", async (options) => {
    const sale = { id: "VDA-SYNTHETIC", lines: [{ inventoryId: "produto-a", quantity: 1, varianteId: "var-a" }] } as unknown as SalePayload
    // Um tx vazio comprova que não chega sequer ao lookup/replay/numeração.
    await expect(upsertVendaInTransaction({} as Prisma.TransactionClient, "loja-a", sale, undefined, options)).rejects.toMatchObject({ code: "VESTUARIO_NAO_OPERACIONAL" })
  })

  it("cadastro não grava grade nem remove declaração por metadata:null", async () => {
    const create = vi.fn()
    const update = vi.fn()
    const audit = vi.fn()
    const tx = { produto: { findFirst: vi.fn(async (args: { where: { id?: string } }) => args.where.id ? { id: "p-a", name: "Camiseta", metadata: grade } : null), create, update }, logsAuditoria: { create: audit }, $queryRaw: vi.fn(async () => []) } as unknown as ProductWriteTx
    expect(await createProductTx(tx, context, { nome: "Camiseta", metadata: grade })).toMatchObject({ ok: false, code: "VALIDATION", field: "metadata" })
    expect(await updateProductTx(tx, context, "p-a", { metadata: null }, { clearMetadata: true })).toMatchObject({ ok: false, code: "VALIDATION", field: "metadata" })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})

describe("boundary canônico não movimenta grade e continua escopado pela loja", () => {
  const command = { kind: "saida" as const, produtoId: "p-a", quantidade: 1, origem: "pdv", idempotencyKey: "sale-a" }
  function transaction(storeId = "loja-a", marker: unknown = grade.vestuario) {
    const writes = vi.fn()
    const deposit = vi.fn()
    const query = vi.fn(async (_q: TemplateStringsArray, ...values: unknown[]) => values[1] === storeId ? [{ id: "p-a", hasVestuario: true, vestuario: marker }] : [])
    const tx = {
      $queryRaw: query,
      produto: { findFirst: vi.fn(async (args: { where: { storeId: string } }) => args.where.storeId === storeId ? { id: "p-a", name: "Camiseta", sku: "CAM", stock: 5, precoCusto: 10 } : null), findUnique: vi.fn(async () => ({ id: "p-a", storeId })), update: writes },
      deposito: { findFirst: deposit, findUnique: deposit, create: writes },
      produtoDeposito: { findMany: vi.fn(), upsert: writes },
      movimentacaoEstoque: { findFirst: vi.fn(), create: writes },
    } as unknown as StockLedgerTx
    return { tx, writes, deposit, query }
  }
  it("recusa grade antes de depósito, ledger ou saldo; usa o lock com filtro da loja", async () => {
    const { tx, writes, deposit, query } = transaction()
    expect(await applyStockMutationTx(tx, context, command)).toMatchObject({ ok: false, code: "VARIANTE_OBRIGATORIA" })
    expect(writes).not.toHaveBeenCalled()
    expect(deposit).not.toHaveBeenCalled()
    expect(query.mock.calls[0].slice(1)).toEqual(["p-a", "loja-a"])
    const sql = query.mock.calls[0][0].join("?")
    expect(sql).toContain('"metadata" -> \'vestuario\'')
    expect(sql).toContain('AND "storeId" = ?')
    expect(sql).toContain("FOR UPDATE")
  })
  it("produto de outra loja recebe CROSS_STORE, sem expor declaração ou mover saldo", async () => {
    const { tx, writes } = transaction("loja-b")
    expect(await applyStockMutationTx(tx, context, command)).toMatchObject({ ok: false, code: "CROSS_STORE" })
    expect(writes).not.toHaveBeenCalled()
  })
  it("contexto ausente e tentativa de alvo de variante falham antes do lock", async () => {
    const { tx, query, writes } = transaction()
    expect(await applyStockMutationTx(tx, { ...context, storeId: "" }, command)).toMatchObject({ ok: false, code: "UNTRUSTED_CONTEXT" })
    expect(await applyStockMutationTx(tx, context, { ...command, varianteId: "var-a" } as typeof command)).toMatchObject({ ok: false, code: "VESTUARIO_NAO_OPERACIONAL" })
    expect(query).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })
  it("declaração desconhecida não é tratada como simples", async () => {
    const { tx, writes } = transaction("loja-a", { contract: CATALOG_DECLARATION_CONTRACT, version: 99, mode: "COM_GRADE" })
    expect(await applyStockMutationTx(tx, context, command)).toMatchObject({ ok: false, code: "CONTRATO_VARIACAO_INVALIDO" })
    expect(writes).not.toHaveBeenCalled()
  })
})
