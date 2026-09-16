/**
 * CAD-R2-006 — Writers interativos de Produto no boundary canônico.
 *
 * Prova que `upsertProduto` (create/update) e `salvarProdutoIAMetadata` são
 * adapters finos sobre o ProductWriteService, com estoque via Stock/Ledger,
 * autoridade server-derived e contrato de UI preservado. Sem banco: service,
 * ledger, auth e Prisma são fakes/mocks.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
  createProduct: vi.fn(async () => ({ ok: true, id: "p-1", operacao: "create" })),
  updateProduct: vi.fn(async () => ({ ok: true, id: "p-1", operacao: "update" })),
  applyStockMutation: vi.fn(async () => ({
    ok: true,
    movimentacaoId: "mov-1",
    produtoId: "p-1",
    depositoId: "d-1",
    tipo: "ajuste",
    quantidade: 5,
    estoqueAntes: 10,
    estoqueDepois: 15,
    depositoAntes: 10,
    depositoDepois: 15,
    custoMedioAntes: 0,
    custoMedioDepois: 0,
    idempotente: false,
  })),
  stockFindFirst: vi.fn(async (_args?: unknown) => ({ stock: 10 })),
  directCreate: vi.fn(async () => ({ id: "p-1" })),
  directUpdate: vi.fn(async () => ({ id: "p-1" })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({
  getSessionEntitlement: h.getSessionEntitlement,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  PRODUCT_WRITE_AUDIT_SOURCE: "product-write-service",
  createProduct: h.createProduct,
  updateProduct: h.updateProduct,
}))
vi.mock("@/lib/estoque/stock-ledger-service", () => ({
  applyStockMutation: h.applyStockMutation,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: {
      findFirst: h.stockFindFirst,
      create: h.directCreate,
      update: h.directUpdate,
    },
  },
  withPrismaSafe: async (fn: (db: unknown) => unknown, fallback: unknown) => {
    try {
      return await fn({})
    } catch {
      return fallback
    }
  },
}))

import { upsertProduto } from "@/app/actions/cadastros"
import { salvarProdutoIAMetadata } from "@/app/actions/produto-ia"

function sessionVendedor(lojas = ["loja-a"]) {
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role: "VENDEDOR",
      storeAccess: "restricted",
      allowedStoreIds: lojas,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session)
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.createProduct.mockReset()
  h.updateProduct.mockReset()
  h.applyStockMutation.mockReset()
  h.stockFindFirst.mockReset()
  h.directCreate.mockReset()
  h.directUpdate.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
  h.createProduct.mockResolvedValue({ ok: true, id: "p-1", operacao: "create" } as never)
  h.updateProduct.mockResolvedValue({ ok: true, id: "p-1", operacao: "update" } as never)
  h.applyStockMutation.mockResolvedValue({
    ok: true,
    movimentacaoId: "mov-1",
    produtoId: "p-1",
    depositoId: "d-1",
    tipo: "ajuste",
    quantidade: 5,
    estoqueAntes: 10,
    estoqueDepois: 15,
    depositoAntes: 10,
    depositoDepois: 15,
    custoMedioAntes: 0,
    custoMedioDepois: 0,
    idempotente: false,
  } as never)
  h.stockFindFirst.mockResolvedValue({ stock: 10 })
})

describe("CAD-R2-006 — upsertProduto no boundary canônico", () => {
  it("1. criação chama createProduct (com estoque inicial) e retorna contrato legado", async () => {
    sessionVendedor()
    const r = await upsertProduto("loja-a", { nome: "Cabo", estoque: 5, preco: 10 })
    expect(r).toEqual({ ok: true, id: "p-1" })
    expect(h.createProduct).toHaveBeenCalledTimes(1)
    const [ctx, input] = h.createProduct.mock.calls[0] as unknown as [
      { storeId: string; principal: { userId: string } },
      Record<string, unknown>,
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(ctx.principal.userId).toBe("user-1")
    expect(input.estoque).toBe(5)
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("2. edição chama updateProduct sem estoque no payload cadastral", async () => {
    sessionVendedor()
    h.stockFindFirst.mockResolvedValue({ stock: 10 })
    const r = await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: 10 })
    expect(r).toEqual({ ok: true, id: "p-1" })
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    const [, , input] = h.updateProduct.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(input).not.toHaveProperty("estoque")
    expect(input).not.toHaveProperty("stock")
  })

  it("3. action nunca faz Prisma Product write direto (só leitura de saldo)", async () => {
    sessionVendedor()
    await upsertProduto("loja-a", { nome: "Cabo" })
    await upsertProduto("loja-a", { id: "p-1", nome: "Cabo" })
    expect(h.directCreate).not.toHaveBeenCalled()
    expect(h.directUpdate).not.toHaveBeenCalled()
  })

  it("4. store autorizada vem do gate (outra loja rejeita antes do service)", async () => {
    sessionVendedor(["loja-a"])
    await expect(upsertProduto("loja-b", { nome: "Cabo" })).rejects.toThrow(
      "Sem permissão para esta unidade",
    )
    expect(h.createProduct).not.toHaveBeenCalled()
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("5. caller storeId não bypassa ownership (cross-store vira NOT_FOUND)", async () => {
    sessionVendedor()
    h.updateProduct.mockResolvedValue({
      ok: false,
      code: "CROSS_STORE",
      message: "Produto pertence a outra loja.",
    } as never)
    const r = await upsertProduto("loja-a", { id: "p-outra-loja", nome: "Hacked" })
    expect(r).toEqual({ ok: false, type: "NOT_FOUND", message: "Produto não encontrado." })
    const [ctx] = h.updateProduct.mock.calls[0] as unknown as [{ storeId: string }]
    expect(ctx.storeId).toBe("loja-a")
  })

  it("6. actor fake do payload não substitui o principal da sessão", async () => {
    sessionVendedor()
    const r = await upsertProduto("loja-a", {
      nome: "Cabo",
      storeId: "loja-b",
      usuario: "hacker",
      userLabel: "hacker",
      revisadoPor: "hacker",
      actor: { userId: "hacker" },
    } as unknown as { nome: string })
    expect(r).toEqual({ ok: true, id: "p-1" })
    const [ctx] = h.createProduct.mock.calls[0] as unknown as [
      { storeId: string; principal: { userId: string; displayLabel: string } },
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(ctx.principal.userId).toBe("user-1")
    expect(ctx.principal.displayLabel).toBe("U")
  })

  it("7. duplicate SKU retorna erro amigável com produto", async () => {
    sessionVendedor()
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "SKU já cadastrado nesta loja.",
      field: "sku",
      produto: { id: "p-x", name: "Existente", sku: "SKU1", barcode: null, stock: 3 },
    } as never)
    const r = await upsertProduto("loja-a", { nome: "Cabo", sku: "SKU1" })
    expect(r.ok).toBe(false)
    if (!r.ok && r.type === "DUPLICATE_PRODUCT") {
      expect(r.field).toBe("sku")
      expect(r.message).toContain("SKU")
      expect(r.produto?.id).toBe("p-x")
    } else {
      throw new Error("esperava DUPLICATE_PRODUCT de sku")
    }
  })

  it("8. duplicate barcode retorna erro amigável com produto", async () => {
    sessionVendedor()
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "EAN já cadastrado nesta loja.",
      field: "barcode",
      produto: { id: "p-y", name: "Existente", sku: null, barcode: "789123", stock: 1 },
    } as never)
    const r = await upsertProduto("loja-a", { nome: "Cabo", barras: "789123" })
    expect(r.ok).toBe(false)
    if (!r.ok && r.type === "DUPLICATE_PRODUCT") {
      expect(r.field).toBe("barcode")
      expect(r.produto?.id).toBe("p-y")
    } else {
      throw new Error("esperava DUPLICATE_PRODUCT de barcode")
    }
  })

  it("9. metadata é encaminhada intacta (sem merge duplicado na action)", async () => {
    sessionVendedor()
    const metadata = {
      fiscal: { ncm: "85171200", cest: "1234567" },
      atributos: { descricao: "Cabo USB", tags: ["cabo"] },
      cadastroIa: { phase: "fase1-stub", source: "manual" },
      barcodeLookup: { gtin: "789123", statusLookup: "encontrado" },
    }
    await upsertProduto("loja-a", { nome: "Cabo", metadata })
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.metadata).toEqual(metadata)
  })

  it("10. fiscal (top-level + metadata.fiscal) é encaminhado ao service", async () => {
    sessionVendedor()
    await upsertProduto("loja-a", {
      nome: "Cabo",
      metadata: { fiscal: { ncm: "85171200", cest: "1234567" } },
      ncm: "85171200",
      cest: "1234567",
    } as unknown as { nome: string })
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.ncm).toBe("85171200")
    expect(input.cest).toBe("1234567")
    expect((input.metadata as Record<string, unknown>).fiscal).toEqual({
      ncm: "85171200",
      cest: "1234567",
    })
  })

  it("11. accessoryConfig é encaminhado (canonização fica no service)", async () => {
    sessionVendedor()
    const accessoryConfig = { version: 1, tipo: "capinha", exigeModelo: true }
    await upsertProduto("loja-a", { nome: "Capinha", accessoryConfig })
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.accessoryConfig).toEqual(accessoryConfig)
  })

  it("12. catalogoAparelhos top-level é encaminhado (paridade REST)", async () => {
    sessionVendedor()
    const catalogoAparelhos = { deviceModelKeys: ["iphone-11"], source: "manual" }
    await upsertProduto("loja-a", { nome: "Capinha", catalogoAparelhos } as never)
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.catalogoAparelhos).toEqual(catalogoAparelhos)
  })

  it("13. PATCH: campo ausente não vira limpeza (sem defaults destrutivos)", async () => {
    sessionVendedor()
    await upsertProduto("loja-a", { id: "p-1", nome: "Só nome" })
    const [, , input] = h.updateProduct.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(input.nome).toBe("Só nome")
    expect(input).not.toHaveProperty("categoria")
    expect(input).not.toHaveProperty("marca")
    expect(input).not.toHaveProperty("custo")
    expect(input).not.toHaveProperty("preco")
    expect(input).not.toHaveProperty("estoque")
  })

  it("14. create com estoque inicial encaminha ao service (ledger atômico interno)", async () => {
    sessionVendedor()
    await upsertProduto("loja-a", { nome: "Novo", estoque: 7, custo: 5 })
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.estoque).toBe(7)
    // O ledger do saldo inicial é interno ao service (mesma transação);
    // a action não chama o boundary de estoque no create.
    expect(h.applyStockMutation).not.toHaveBeenCalled()
    expect(h.directCreate).not.toHaveBeenCalled()
  })

  it("15. edit sem mudança de stock não gera ledger", async () => {
    sessionVendedor()
    // Caso A: estoque omitido (modal de edição atual).
    await upsertProduto("loja-a", { id: "p-1", nome: "Cabo" })
    expect(h.applyStockMutation).not.toHaveBeenCalled()
    // Caso B: estoque reenviado igual ao atual (toggle legado).
    h.stockFindFirst.mockResolvedValue({ stock: 10 })
    await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: 10 })
    expect(h.applyStockMutation).not.toHaveBeenCalled()
  })

  it("16. edit com mudança explícita usa ajuste canônico (nunca direct write)", async () => {
    sessionVendedor()
    h.stockFindFirst.mockResolvedValue({ stock: 10 })
    const r = await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: 15 })
    expect(r).toEqual({ ok: true, id: "p-1" })
    expect(h.applyStockMutation).toHaveBeenCalledTimes(1)
    const [ctx, cmd] = h.applyStockMutation.mock.calls[0] as unknown as [
      { storeId: string; principal: { userId: string }; source: string },
      { kind: string; produtoId: string; novoSaldo: number; origem: string },
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(ctx.principal.userId).toBe("user-1")
    expect(cmd.kind).toBe("ajuste")
    expect(cmd.produtoId).toBe("p-1")
    expect(cmd.novoSaldo).toBe(15)
    expect(cmd.origem).toBe("cadastro")
    expect(h.directUpdate).not.toHaveBeenCalled()
  })

  it("17. update nunca altera stock diretamente (payload cadastral sem saldo)", async () => {
    sessionVendedor()
    h.stockFindFirst.mockResolvedValue({ stock: 4 })
    await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: 4, preco: 20 })
    const [, , input] = h.updateProduct.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>]
    expect(input).not.toHaveProperty("estoque")
    expect(input).not.toHaveProperty("stock")
    expect(h.directUpdate).not.toHaveBeenCalled()
  })

  it("18. falha no ajuste não inventa saldo (cadastral salvo, erro amigável)", async () => {
    sessionVendedor()
    h.stockFindFirst.mockResolvedValue({ stock: 10 })
    h.applyStockMutation.mockResolvedValue({
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: "Estoque insuficiente no depósito.",
      estoqueAntes: 10,
    } as never)
    const r = await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: 4 })
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    expect(h.directUpdate).not.toHaveBeenCalled()
    expect(r).toEqual({
      ok: false,
      type: "SAVE_ERROR",
      message: "Estoque insuficiente no depósito.",
    })
  })

  it("19. cross-store edit falha fechado (sem vazar loja)", async () => {
    sessionVendedor()
    h.updateProduct.mockResolvedValue({
      ok: false,
      code: "CROSS_STORE",
      message: "Produto pertence a outra loja.",
    } as never)
    const r = await upsertProduto("loja-a", { id: "p-x", nome: "X" })
    expect(r).toEqual({ ok: false, type: "NOT_FOUND", message: "Produto não encontrado." })
  })

  it("20. produto inexistente falha", async () => {
    sessionVendedor()
    h.updateProduct.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "Produto não encontrado.",
    } as never)
    const r = await upsertProduto("loja-a", { id: "p-missing", nome: "X" })
    expect(r).toEqual({ ok: false, type: "NOT_FOUND", message: "Produto não encontrado." })
    expect(h.applyStockMutation).not.toHaveBeenCalled()
  })

  it("23. retorno compatível com os modais (create/edit/sucesso/erro distinguíveis)", async () => {
    sessionVendedor()
    // Payload real do ProductAIModal (create).
    const create = await upsertProduto("loja-a", {
      nome: "Capinha iPhone",
      sku: "CAP-001",
      barras: "7891234567890",
      categoria: "Capinhas",
      marca: "Apple",
      fornecedor: "Fornecedor X",
      estoque: 3,
      custo: 10,
      preco: 29.9,
      garantia: 90,
      active: true,
      accessoryConfig: { version: 1, tipo: "capinha" },
      metadata: {
        cadastroIa: { phase: "fase1-stub", source: "manual" },
        atributos: { descricao: "Capinha", tags: ["capinha"] },
        fiscal: { ncm: "85171200", cest: "1234567" },
      },
    })
    expect(create).toEqual({ ok: true, id: "p-1" })
    // Toggle Ativar/Inativar (update sem estoque após o fix 006).
    const toggle = await upsertProduto("loja-a", {
      id: "p-1",
      nome: "Capinha iPhone",
      sku: "CAP-001",
      barras: "7891234567890",
      categoria: "Capinhas",
      marca: "Apple",
      fornecedor: "Fornecedor X",
      custo: 10,
      preco: 29.9,
      garantia: 90,
      active: false,
    })
    expect(toggle).toEqual({ ok: true, id: "p-1" })
    // Erro de validação mantém o contrato {ok:false,type,message}.
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: 'Campo "nome" é obrigatório.',
      field: "nome",
    } as never)
    const invalid = await upsertProduto("loja-a", { nome: "" })
    expect(invalid).toEqual({
      ok: false,
      type: "VALIDATION_ERROR",
      message: 'Campo "nome" é obrigatório.',
    })
  })
})

describe("CAD-R2-006 — IA sugere, humano revisa, service persiste", () => {
  it("21. apply de sugestão IA usa o service canônico (com proveniência server-derived)", async () => {
    sessionVendedor()
    const r = await salvarProdutoIAMetadata("loja-a", "p-1", {
      descricaoCurta: "Cabo USB-C 1m",
      palavrasChave: ["cabo", "usb-c"],
    } as never)
    expect(r).toEqual({ ok: true })
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    const [ctx, pid, input] = h.updateProduct.mock.calls[0] as unknown as [
      { storeId: string; principal: { userId: string } },
      string,
      { metadata: Record<string, unknown> },
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(ctx.principal.userId).toBe("user-1")
    expect(pid).toBe("p-1")
    expect(input.metadata.descricaoCurta).toBe("Cabo USB-C 1m")
    expect(input.metadata.iaRevisadoPor).toBe("U")
    expect(typeof input.metadata.iaRevisadoEm).toBe("string")
  })

  it("22. IA não tem primitive direta de Prisma Product", async () => {
    sessionVendedor()
    await salvarProdutoIAMetadata("loja-a", "p-1", { titulo: "x" } as never)
    expect(h.directUpdate).not.toHaveBeenCalled()
    expect(h.directCreate).not.toHaveBeenCalled()
  })
})

describe("CAD-R2-006 — guardrails estáticos", () => {
  it("24. nenhum browser/localStorage entra no core de escrita", () => {
    const root = resolve(__dirname, "..", "..")
    const files = [
      "app/actions/cadastros.ts",
      "app/actions/produto-ia.ts",
      "lib/cadastros/product-write-service.ts",
      "lib/cadastros/product-write-contract.ts",
    ]
    for (const f of files) {
      const src = readFileSync(resolve(root, f), "utf8")
      expect(src).not.toMatch(/localStorage/)
      expect(src).not.toMatch(/sessionStorage/)
      expect(src).not.toMatch(/window\./)
      expect(src).not.toMatch(/document\./)
    }
  })

  it("15b. estoque inválido explícito falha antes de qualquer write", async () => {
    sessionVendedor()
    const r = await upsertProduto("loja-a", { id: "p-1", nome: "Cabo", estoque: -3 })
    expect(r).toEqual({ ok: false, type: "VALIDATION_ERROR", message: 'Campo "estoque" inválido.' })
    expect(h.updateProduct).not.toHaveBeenCalled()
    expect(h.applyStockMutation).not.toHaveBeenCalled()
    expect(h.directUpdate).not.toHaveBeenCalled()
  })
})
