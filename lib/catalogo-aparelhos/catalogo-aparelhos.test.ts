import { describe, it, expect } from "vitest"
import { parseCsv, parseCsvObjects } from "./csv"
import {
  buildCatalogoIndex,
  normalizeDeviceQuery,
  parseDeviceAliases,
  parseDeviceModels,
  searchDeviceModels,
} from "./catalogo-aparelhos"
import { loadCatalogoIndex } from "./catalogo-loader"
import type { DeviceSearchResult } from "./types"

// ============================================================================
// CATALOGO-APARELHOS-METADATA-MVP-001 — biblioteca pura de leitura/busca do catálogo.
// Testes ancorados nos seeds REAIS em docs/catalogo/seeds/*.csv.
// ============================================================================

function findByKey(results: DeviceSearchResult[], key: string): DeviceSearchResult | undefined {
  return results.find((r) => r.modelKey === key)
}

describe("csv parser", () => {
  it("respeita vírgula dentro de campo entre aspas", () => {
    const rows = parseCsvObjects('a,b,c\n1,"x, y",3')
    expect(rows).toEqual([{ a: "1", b: "x, y", c: "3" }])
  })

  it("desescapa aspas duplas escapadas dentro do campo", () => {
    const rows = parseCsv('col\n"He said ""hi"""')
    expect(rows).toEqual([["col"], ['He said "hi"']])
  })

  it("ignora BOM inicial", () => {
    const rows = parseCsvObjects("﻿a,b\n1,2")
    expect(rows).toEqual([{ a: "1", b: "2" }])
  })
})

describe("parse + normalização", () => {
  it("normalizeDeviceQuery remove acentos, sobe caixa e colapsa espaços", () => {
    expect(normalizeDeviceQuery("  Câmera   Traseira ")).toBe("CAMERA TRASEIRA")
    expect(normalizeDeviceQuery("iPhone 13 Pro Max")).toBe("IPHONE 13 PRO MAX")
  })

  it("parseDeviceModels descarta linhas sem model_key (não quebra)", () => {
    const csv = "model_key,brand,canonical_name\n,Sem,Chave\nsamsung_x,Samsung,Samsung X"
    const models = parseDeviceModels(csv)
    expect(models).toHaveLength(1)
    expect(models[0].modelKey).toBe("samsung_x")
  })

  it("CSV inválido não lança e degrada em vazio", () => {
    expect(() => parseDeviceModels('linha,sem,cabecalho,coerente\n"aspas nao fechadas')).not.toThrow()
    const idx = buildCatalogoIndex({ models: [], aliases: [] })
    expect(searchDeviceModels(idx, "A05")).toEqual([])
  })
})

describe("loader dos seeds reais", () => {
  const index = loadCatalogoIndex()

  it("carrega os CSVs versionados (modelos e aliases)", () => {
    expect(index.models.length).toBeGreaterThan(400)
    expect(index.aliases.length).toBeGreaterThan(1700)
    expect(index.modelByKey.get("samsung_galaxy_a05")?.brand).toBe("Samsung")
  })

  it("query curta (abaixo do mínimo) retorna vazio", () => {
    expect(searchDeviceModels(index, "")).toEqual([])
    expect(searchDeviceModels(index, "A")).toEqual([])
  })

  it("busca 'A05' retorna Samsung Galaxy A05 e marca alias curto/ambíguo", () => {
    const results = searchDeviceModels(index, "A05")
    const a05 = findByKey(results, "samsung_galaxy_a05")
    expect(a05).toBeTruthy()
    expect(results[0].modelKey).toBe("samsung_galaxy_a05") // exato vence
    expect(a05!.ambiguous).toBe(true)
    expect(a05!.requiresBrandContext).toBe(true)
    expect(a05!.reviewFlags).toContain("alias_curto_ambiguo")
  })

  it("busca 'Samsung A05' prioriza o modelo exato (não o A05S)", () => {
    const results = searchDeviceModels(index, "Samsung A05")
    expect(results[0].modelKey).toBe("samsung_galaxy_a05")
    const a05 = findByKey(results, "samsung_galaxy_a05")
    expect(a05!.matchType).toBe("exact")
    expect(a05!.ambiguous).toBe(false) // "Samsung A05" é alias não-ambíguo (marca + curto)
  })

  it("busca 'G35' retorna Motorola Moto G35 marcado como ambíguo", () => {
    const results = searchDeviceModels(index, "G35")
    const g35 = findByKey(results, "motorola_moto_g35")
    expect(g35).toBeTruthy()
    expect(g35!.ambiguous).toBe(true)
    expect(g35!.reviewFlags).toContain("alias_curto_ambiguo")
  })

  it("busca 'iPhone 13 Pro Max' retorna Apple iPhone 13 Pro Max (exato via alias)", () => {
    const results = searchDeviceModels(index, "iPhone 13 Pro Max")
    const ip = findByKey(results, "apple_iphone_13_pro_max")
    expect(ip).toBeTruthy()
    expect(ip!.matchType).toBe("exact")
    expect(ip!.brand).toBe("Apple")
  })

  it("busca 'C75' retorna POCO e Realme com colisão entre marcas", () => {
    const results = searchDeviceModels(index, "C75")
    const poco = findByKey(results, "poco_c75")
    const realme = findByKey(results, "realme_c75")
    expect(poco).toBeTruthy()
    expect(realme).toBeTruthy()
    expect(poco!.requiresBrandContext).toBe(true)
    expect(poco!.reviewFlags).toContain("alias_em_multiplas_marcas")
  })

  it("filtro por marca desambigua o alias curto 'C75'", () => {
    const results = searchDeviceModels(index, "C75", { brand: "Realme" })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.brand === "Realme")).toBe(true)
    expect(findByKey(results, "poco_c75")).toBeUndefined()
  })

  it("não retorna modelos duplicados", () => {
    const results = searchDeviceModels(index, "iPhone")
    const keys = results.map((r) => r.modelKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("respeita o limite de resultados", () => {
    const results = searchDeviceModels(index, "iPhone", { limit: 5 })
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it("a busca NÃO atribui status de compatibilidade (não confirma nada automaticamente)", () => {
    const results = searchDeviceModels(index, "A05")
    for (const r of results) {
      expect(r).not.toHaveProperty("compatibilityStatus")
    }
  })
})

describe("índice ignora alias órfão", () => {
  it("alias sem modelo correspondente não entra no índice", () => {
    const models = parseDeviceModels("model_key,brand,canonical_name,short_name\nx1,Marca,Modelo X1,X1")
    const aliases = parseDeviceAliases(
      "alias_key,model_key,alias,normalized_alias,alias_type,is_ambiguous,requires_brand_context,confidence,notes\n" +
        "orfao,inexistente,ZZZ,ZZZ,short,true,true,media,\n" +
        "x1__x1,x1,X1,X1,canonical,false,false,alta,",
    )
    const index = buildCatalogoIndex({ models, aliases })
    expect(index.aliasesByModelKey.get("inexistente")).toBeUndefined()
    expect(searchDeviceModels(index, "ZZZ")).toEqual([])
    expect(findByKey(searchDeviceModels(index, "X1"), "x1")).toBeTruthy()
  })
})
