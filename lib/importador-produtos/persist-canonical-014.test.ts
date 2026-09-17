/**
 * CAD-R2-014 — importador-produtos via ProductWriteService.
 *
 * Preserva: matching forte/fraca, decidirAcao, modos criar/atualizar/pular,
 * snapshot, telemetria. Troca somente a persistência final.
 *
 * - create → createProduct (estoque inicial via ledger, metadata fiscal/IA)
 * - update → updateProduct (cadastral, sem estoque)
 * - pular/conflito → service nunca chamado
 * - weak-match → nunca atualiza (cria)
 * - DUPLICATE (race) → pulado
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProdutoNormalizado } from "./types"

const h = vi.hoisted(() => ({
  findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []),
  createProduct: vi.fn(async () => ({ ok: true, id: "novo-1", operacao: "create" })),
  updateProduct: vi.fn(async () => ({ ok: true, id: "exist-1", operacao: "update" })),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { produto: { findMany: h.findMany } },
}))

vi.mock("@/lib/cadastros/product-write-service", () => ({
  createProduct: h.createProduct,
  updateProduct: h.updateProduct,
}))

// Catalog/IA/fiscal passam pelo caminho real (puros) — só o boundary é mockado.
import { persistirLoteProdutos } from "./persist"

function item(over: Partial<ProdutoNormalizado> = {}): ProdutoNormalizado {
  return {
    linha: 1,
    sku: "",
    barcode: "",
    nome: "Produto Teste",
    custo: 10,
    preco: 20,
    estoque: 5,
    categoria: "Geral",
    ncm: "",
    cest: "",
    ...over,
  }
}

const PRINCIPAL = { userId: "u1", displayLabel: "U" } as never

beforeEach(() => {
  h.findMany.mockReset()
  h.createProduct.mockReset()
  h.updateProduct.mockReset()
  // Snapshot vazio por padrão (sem matches) — duas chamadas (sku + barcode).
  h.findMany.mockResolvedValue([])
  h.createProduct.mockResolvedValue({ ok: true, id: "novo-1", operacao: "create" } as never)
  h.updateProduct.mockResolvedValue({ ok: true, id: "exist-1", operacao: "update" } as never)
})

describe("persistirLoteProdutos — boundary canônico", () => {
  it("cria via createProduct com estoque inicial + contexto server-derived", async () => {
    const res = await persistirLoteProdutos("loja-a", [item({ sku: "ABC-123" })], "criar", {
      principal: PRINCIPAL,
    })
    expect(res.criados).toBe(1)
    expect(h.createProduct).toHaveBeenCalledTimes(1)
    expect(h.updateProduct).not.toHaveBeenCalled()
    const [ctx, input] = h.createProduct.mock.calls[0] as unknown as [
      { storeId: string; principal: unknown },
      Record<string, unknown>,
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(ctx.principal).toEqual(PRINCIPAL)
    expect(input.nome).toBe("Produto Teste")
    expect(input.sku).toBe("ABC-123")
    expect(input.estoque).toBe(5)
    expect(input.custo).toBe(10)
    expect(input.preco).toBe(20)
  })

  it("novo com NCM/CEST preserva fiscal em metadata", async () => {
    await persistirLoteProdutos("loja-a", [item({ ncm: "12345678", cest: "1234567" })], "criar", {
      principal: PRINCIPAL,
    })
    const [, input] = h.createProduct.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.ncm).toBe("12345678")
    expect(input.cest).toBe("1234567")
    const meta = input.metadata as Record<string, unknown>
    expect(meta).toBeDefined()
  })

  it("match forte + modo atualizar → updateProduct sem estoque", async () => {
    // Snapshot com SKU forte presente no banco.
    h.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { sku?: { in?: string[] } } }).where
      const ins = where?.sku?.in ?? []
      if (ins.some((s: string) => s.toLowerCase() === "abc-123")) {
        return [{ id: "exist-1", sku: "ABC-123", barcode: null, storeId: "loja-a" }]
      }
      return []
    })
    const res = await persistirLoteProdutos("loja-a", [item({ sku: "ABC-123" })], "atualizar", {
      principal: PRINCIPAL,
    })
    expect(res.atualizados).toBe(1)
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    expect(h.createProduct).not.toHaveBeenCalled()
    const [ctx, pid, input] = h.updateProduct.mock.calls[0] as unknown as [
      { storeId: string },
      string,
      Record<string, unknown>,
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(pid).toBe("exist-1")
    expect(input.nome).toBe("Produto Teste")
    expect("estoque" in input).toBe(false)
    expect("stock" in input).toBe(false)
  })

  it("match forte + modo criar (default seguro) → pula sem escrever", async () => {
    h.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { sku?: { in?: string[] } } }).where
      const ins = where?.sku?.in ?? []
      if (ins.some((s: string) => s.toLowerCase() === "abc-123")) {
        return [{ id: "exist-1", sku: "ABC-123", barcode: null, storeId: "loja-a" }]
      }
      return []
    })
    const res = await persistirLoteProdutos("loja-a", [item({ sku: "ABC-123" })], "criar", {
      principal: PRINCIPAL,
    })
    expect(res.pulados).toBe(1)
    expect(h.createProduct).not.toHaveBeenCalled()
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("match fraco (SKU curto) + modo atualizar → cria, nunca atualiza", async () => {
    h.findMany.mockImplementation(async () => [
      { id: "exist-fraco", sku: "10", barcode: null, storeId: "loja-a" },
    ])
    const res = await persistirLoteProdutos("loja-a", [item({ sku: "10" })], "atualizar", {
      principal: PRINCIPAL,
    })
    expect(res.criados).toBe(1)
    expect(h.createProduct).toHaveBeenCalledTimes(1)
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("DUPLICATE no create (race) → pulado, não erro", async () => {
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado nesta loja.",
    } as never)
    const res = await persistirLoteProdutos("loja-a", [item({ sku: "ABC-123" })], "criar", {
      principal: PRINCIPAL,
    })
    expect(res.pulados).toBe(1)
    expect(res.erros).toBe(0)
  })

  it("telemetria de match preservada", async () => {
    const res = await persistirLoteProdutos(
      "loja-a",
      [item({ linha: 1, sku: "ABC-123" }), item({ linha: 2, sku: "", barcode: "" })],
      "criar",
      { principal: PRINCIPAL },
    )
    expect(res.telemetria.matchForteSku).toBe(0)
    expect(res.telemetria.semChave).toBe(1)
  })
})
