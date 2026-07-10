import { describe, expect, it } from "vitest"
import {
  mergeProdutoMetadataTwoLevels,
  normalizeProdutoIdentifier,
  normalizeProdutoTags,
  produtoStockPatch,
} from "./produto-upsert-metadata"

describe("contrato do upsert de produto", () => {
  it("normaliza SKU e código de barras vazios para null", () => {
    expect(normalizeProdutoIdentifier(undefined)).toBeNull()
    expect(normalizeProdutoIdentifier("   ")).toBeNull()
    expect(normalizeProdutoIdentifier("  789123  ")).toBe("789123")
  })

  it("preserva o estoque quando ele não é enviado", () => {
    expect(produtoStockPatch(undefined)).toEqual({})
    expect(produtoStockPatch(12.9)).toEqual({ stock: 12 })
    expect(produtoStockPatch(-1)).toEqual({})
  })

  it("faz merge de metadata em dois níveis sem apagar fiscal ou catálogo", () => {
    const current = {
      fiscal: { ncm: "12345678", cest: "1234567" },
      catalogoAparelhos: { deviceModelKeys: ["a05"] },
      cadastroIa: { source: "manual" },
    }
    const merged = mergeProdutoMetadataTwoLevels(current, {
      fiscal: { tributacao: "Simples", tributacaoOrigem: "operador" },
      atributos: { descricao: "Produto teste", tags: ["novo"] },
    })

    expect(merged.fiscal).toEqual({
      ncm: "12345678",
      cest: "1234567",
      tributacao: "Simples",
      tributacaoOrigem: "operador",
    })
    expect(merged.catalogoAparelhos).toEqual(current.catalogoAparelhos)
    expect(merged.cadastroIa).toEqual(current.cadastroIa)
    expect(merged.atributos).toEqual({ descricao: "Produto teste", tags: ["novo"] })
  })

  it("substitui arrays e escalares recebidos", () => {
    const merged = mergeProdutoMetadataTwoLevels(
      { atributos: { tags: ["antiga"], descricao: "anterior" }, origem: "importacao" },
      { atributos: { tags: ["nova"] }, origem: "operador" },
    )

    expect(merged.atributos).toEqual({ tags: ["nova"], descricao: "anterior" })
    expect(merged.origem).toBe("operador")
  })

  it("metadata null em edição preserva todo o metadata existente", () => {
    const current = { fiscal: { ncm: "12345678" }, atributos: { descricao: "Mantida" } }
    expect(mergeProdutoMetadataTwoLevels(current, null)).toEqual(current)
  })

  it("remove tags vazias e duplicadas", () => {
    expect(normalizeProdutoTags("  brinquedo, Oferta, brinquedo, , OFERTA ")).toEqual([
      "brinquedo",
      "Oferta",
    ])
  })
})
