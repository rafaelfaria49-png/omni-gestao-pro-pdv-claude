import { describe, expect, it } from "vitest"
import {
  mergeProdutoMetadataComAcessorios,
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

/**
 * PDV-ACESSORIOS-CADASTRO-PROJECAO-002 — merge do save com o namespace `acessorios`
 * saneado pelo contrato canônico de `lib/acessorios`.
 */
describe("mergeProdutoMetadataComAcessorios", () => {
  const METADATA_EXISTENTE = {
    fiscal: { ncm: "85177900", cest: "2110300", tributacao: "Simples" },
    catalogoAparelhos: { version: 1, deviceModelKeys: ["samsung_galaxy_a06"], source: "manual" },
    atributos: { descricao: "Capinha de silicone premium", tags: ["capinha"] },
    barcodeLookup: { gtin: "7891234500011" },
  }

  const CONFIG_CAPINHA = {
    version: 1,
    tipo: "capinha",
    exigeModelo: true,
    exigeCor: true,
    usaCoresPadrao: true,
  }

  it("metadata sem a chave acessorios preserva a configuração já salva (omissão)", () => {
    const current = { ...METADATA_EXISTENTE, acessorios: CONFIG_CAPINHA }
    const merged = mergeProdutoMetadataComAcessorios(current, {
      atributos: { descricao: "Editado" },
    })
    expect(merged.acessorios).toMatchObject(CONFIG_CAPINHA)
    expect((merged.atributos as Record<string, unknown>).descricao).toBe("Editado")
  })

  it("persiste configuração de capinha saneada", () => {
    const merged = mergeProdutoMetadataComAcessorios(null, { acessorios: CONFIG_CAPINHA })
    expect(merged.acessorios).toEqual(CONFIG_CAPINHA)
  })

  it("persiste configuração de película (modelo sem cor)", () => {
    const pelicula = {
      version: 1,
      tipo: "pelicula",
      exigeModelo: true,
      exigeCor: false,
      usaCoresPadrao: false,
    }
    const merged = mergeProdutoMetadataComAcessorios(METADATA_EXISTENTE, { acessorios: pelicula })
    expect(merged.acessorios).toEqual(pelicula)
  })

  it("persiste configuração customizada (acessorio_generico com cores permitidas)", () => {
    const custom = {
      version: 1,
      tipo: "acessorio_generico",
      exigeModelo: false,
      exigeCor: true,
      usaCoresPadrao: true,
      coresPermitidas: ["preto", "azul"],
    }
    const merged = mergeProdutoMetadataComAcessorios(null, { acessorios: custom })
    expect(merged.acessorios).toMatchObject({
      tipo: "acessorio_generico",
      exigeCor: true,
      coresPermitidas: ["preto", "azul"],
    })
  })

  it("edição da configuração preserva o namespace fiscal", () => {
    const merged = mergeProdutoMetadataComAcessorios(METADATA_EXISTENTE, { acessorios: CONFIG_CAPINHA })
    expect(merged.fiscal).toEqual(METADATA_EXISTENTE.fiscal)
  })

  it("edição da configuração preserva o catálogo de aparelhos", () => {
    const merged = mergeProdutoMetadataComAcessorios(METADATA_EXISTENTE, { acessorios: CONFIG_CAPINHA })
    expect(merged.catalogoAparelhos).toEqual(METADATA_EXISTENTE.catalogoAparelhos)
  })

  it("acessorios: null remove só o namespace, sem wipe do restante do metadata", () => {
    const current = { ...METADATA_EXISTENTE, acessorios: CONFIG_CAPINHA }
    const merged = mergeProdutoMetadataComAcessorios(current, { acessorios: null })
    expect(merged).not.toHaveProperty("acessorios")
    expect(merged.fiscal).toEqual(METADATA_EXISTENTE.fiscal)
    expect(merged.catalogoAparelhos).toEqual(METADATA_EXISTENTE.catalogoAparelhos)
    expect(merged.atributos).toEqual(METADATA_EXISTENTE.atributos)
    expect(merged.barcodeLookup).toEqual(METADATA_EXISTENTE.barcodeLookup)
  })

  it("configuração inválida não chega ao banco (namespace removido, resto intacto)", () => {
    const current = { ...METADATA_EXISTENTE, acessorios: CONFIG_CAPINHA }
    const merged = mergeProdutoMetadataComAcessorios(current, {
      acessorios: { version: 99, tipo: "capinha" },
    })
    expect(merged).not.toHaveProperty("acessorios")
    expect(merged.fiscal).toEqual(METADATA_EXISTENTE.fiscal)
  })

  it("nova configuração SUBSTITUI a anterior — não herda coresPermitidas antigas", () => {
    const current = {
      acessorios: { ...CONFIG_CAPINHA, coresPermitidas: ["preto"] },
    }
    const merged = mergeProdutoMetadataComAcessorios(current, { acessorios: CONFIG_CAPINHA })
    expect(merged.acessorios).toEqual(CONFIG_CAPINHA)
    expect(merged.acessorios).not.toHaveProperty("coresPermitidas")
  })
})
