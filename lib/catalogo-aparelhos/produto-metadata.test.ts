import { describe, it, expect } from "vitest"
import {
  catalogoInputFromBody,
  getProdutoCatalogoAparelhos,
  isCatalogoAparelhosVazio,
  mergeCatalogoAparelhosIntoMetadata,
  sanitizeCatalogoAparelhos,
} from "./produto-metadata"

// ============================================================================
// CATALOGO-APARELHOS-METADATA-MVP-001 — contrato de metadata.catalogoAparelhos.
// ============================================================================

describe("sanitizeCatalogoAparelhos", () => {
  it("sem modelos → null (estrutura vazia)", () => {
    expect(sanitizeCatalogoAparelhos({ deviceModelKeys: [] })).toBeNull()
    expect(sanitizeCatalogoAparelhos({})).toBeNull()
    expect(sanitizeCatalogoAparelhos(null)).toBeNull()
  })

  it("com modelos → estrutura canônica com defaults seguros", () => {
    const v = sanitizeCatalogoAparelhos({ deviceModelKeys: ["samsung_galaxy_a05"] })
    expect(v).toEqual({
      version: 1,
      deviceModelKeys: ["samsung_galaxy_a05"],
      deviceAliases: [],
      compatibilityStatus: "precisa_testar",
      compatibilityTypes: [],
      reviewRequired: true,
      source: "manual",
      notes: "",
    })
  })

  it("NUNCA marca confirmado automaticamente: status default != confirmado_fornecedor", () => {
    const v = sanitizeCatalogoAparelhos({ deviceModelKeys: ["x"] })!
    expect(v.compatibilityStatus).not.toBe("confirmado_fornecedor")
    expect(v.reviewRequired).toBe(true)
  })

  it("status inválido cai no default 'precisa_testar'", () => {
    const v = sanitizeCatalogoAparelhos({ deviceModelKeys: ["x"], compatibilityStatus: "qualquer_coisa" })!
    expect(v.compatibilityStatus).toBe("precisa_testar")
  })

  it("reviewRequired é forçado a true quando não confirmado", () => {
    const v = sanitizeCatalogoAparelhos({
      deviceModelKeys: ["x"],
      compatibilityStatus: "provavel_mercado",
      reviewRequired: false,
    })!
    expect(v.reviewRequired).toBe(true)
  })

  it("confirmado_fornecedor pode dispensar revisão (default false)", () => {
    const v = sanitizeCatalogoAparelhos({
      deviceModelKeys: ["x"],
      compatibilityStatus: "confirmado_fornecedor",
    })!
    expect(v.reviewRequired).toBe(false)
  })

  it("filtra tipos de compatibilidade inválidos e deduplica modelos", () => {
    const v = sanitizeCatalogoAparelhos({
      deviceModelKeys: ["a", "a", "b"],
      compatibilityTypes: ["capinha", "invalido", "tela", "capinha"],
    })!
    expect(v.deviceModelKeys).toEqual(["a", "b"])
    expect(v.compatibilityTypes).toEqual(["capinha", "tela"])
  })

  it("source é sempre manual e notes é aparado", () => {
    const v = sanitizeCatalogoAparelhos({ deviceModelKeys: ["x"], source: "hacker", notes: "  teste  " })!
    expect(v.source).toBe("manual")
    expect(v.notes).toBe("teste")
  })
})

describe("merge preserva o metadata existente", () => {
  it("adiciona catalogoAparelhos sem apagar fiscal/outras chaves", () => {
    const base = { fiscal: { ncm: "12345678" }, foo: 1 }
    const merged = mergeCatalogoAparelhosIntoMetadata(base, { deviceModelKeys: ["x"] })
    expect(merged.fiscal).toEqual({ ncm: "12345678" })
    expect(merged.foo).toBe(1)
    expect((merged.catalogoAparelhos as { deviceModelKeys: string[] }).deviceModelKeys).toEqual(["x"])
  })

  it("input null remove a chave sem tocar no resto", () => {
    const base = { fiscal: { ncm: "1" }, catalogoAparelhos: { version: 1, deviceModelKeys: ["x"] } }
    const merged = mergeCatalogoAparelhosIntoMetadata(base, null)
    expect(merged.catalogoAparelhos).toBeUndefined()
    expect(merged.fiscal).toEqual({ ncm: "1" })
  })

  it("input que saneia para vazio remove a chave", () => {
    const base = { catalogoAparelhos: { version: 1, deviceModelKeys: ["x"] } }
    const merged = mergeCatalogoAparelhosIntoMetadata(base, { deviceModelKeys: [] })
    expect(merged.catalogoAparelhos).toBeUndefined()
  })

  it("base nula/estranha vira objeto novo", () => {
    expect(mergeCatalogoAparelhosIntoMetadata(null, { deviceModelKeys: ["x"] })).toHaveProperty("catalogoAparelhos")
    expect(mergeCatalogoAparelhosIntoMetadata("nao-objeto", null)).toEqual({})
  })
})

describe("leitura canônica", () => {
  it("lê do produto ({ metadata }) e do próprio metadata", () => {
    const meta = { catalogoAparelhos: { version: 1, deviceModelKeys: ["x"], compatibilityStatus: "provavel_mercado" } }
    const fromProduto = getProdutoCatalogoAparelhos({ metadata: meta })
    const fromMeta = getProdutoCatalogoAparelhos(meta)
    expect(fromProduto?.deviceModelKeys).toEqual(["x"])
    expect(fromMeta?.compatibilityStatus).toBe("provavel_mercado")
  })

  it("ausente/ inválido → null (nunca lança)", () => {
    expect(getProdutoCatalogoAparelhos(null)).toBeNull()
    expect(getProdutoCatalogoAparelhos({})).toBeNull()
    expect(getProdutoCatalogoAparelhos({ metadata: { fiscal: {} } })).toBeNull()
  })

  it("isCatalogoAparelhosVazio", () => {
    expect(isCatalogoAparelhosVazio(null)).toBe(true)
    expect(isCatalogoAparelhosVazio(sanitizeCatalogoAparelhos({ deviceModelKeys: ["x"] }))).toBe(false)
  })
})

describe("catalogoInputFromBody distingue ausente / limpar / gravar", () => {
  it("chave ausente → undefined (preserva)", () => {
    expect(catalogoInputFromBody({ name: "P" })).toBeUndefined()
  })
  it("null → null (limpar)", () => {
    expect(catalogoInputFromBody({ catalogoAparelhos: null })).toBeNull()
  })
  it("objeto → objeto (gravar)", () => {
    expect(catalogoInputFromBody({ catalogoAparelhos: { deviceModelKeys: ["x"] } })).toEqual({ deviceModelKeys: ["x"] })
  })
  it("valor não-objeto (string/array) → undefined (ignora)", () => {
    expect(catalogoInputFromBody({ catalogoAparelhos: "oops" })).toBeUndefined()
    expect(catalogoInputFromBody({ catalogoAparelhos: ["x"] })).toBeUndefined()
  })
})
