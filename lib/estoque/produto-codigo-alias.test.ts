/**
 * GOAL_INVENTARIO_BARCODE_ALIAS_V01 — Testes do núcleo PURO de alias de código (sem Prisma).
 */
import { describe, expect, it } from "vitest"
import {
  normalizarCodigoAlias,
  lerCodigosAlias,
  codigosDoProduto,
  produtoResolveCodigo,
  adicionarCodigoAliasMetadata,
} from "./produto-codigo-alias"

describe("normalizarCodigoAlias", () => {
  it("trim; null/undefined → vazio", () => {
    expect(normalizarCodigoAlias("  789  ")).toBe("789")
    expect(normalizarCodigoAlias(null)).toBe("")
    expect(normalizarCodigoAlias(undefined)).toBe("")
  })
})

describe("lerCodigosAlias", () => {
  it("lê o array de metadata.codigosAlias (dedup, só strings não vazias)", () => {
    expect(lerCodigosAlias({ codigosAlias: ["A", "B", "A", " ", 5, null, "B"] })).toEqual(["A", "B"])
  })
  it("metadata sem alias / inválido → []", () => {
    expect(lerCodigosAlias(null)).toEqual([])
    expect(lerCodigosAlias({})).toEqual([])
    expect(lerCodigosAlias({ codigosAlias: "x" })).toEqual([])
    expect(lerCodigosAlias([1, 2])).toEqual([])
  })
})

describe("codigosDoProduto / produtoResolveCodigo", () => {
  const produto = { barcode: "BAR1", sku: "SKU1", metadata: { codigosAlias: ["AL1", "AL2"] } }

  it("reúne barcode + sku + aliases (dedup)", () => {
    expect(codigosDoProduto(produto)).toEqual(["BAR1", "SKU1", "AL1", "AL2"])
    expect(codigosDoProduto({ barcode: "X", sku: "X", metadata: { codigosAlias: ["X"] } })).toEqual(["X"])
  })

  it("resolve por barcode, sku ou alias; não resolve outros; vazio → false", () => {
    expect(produtoResolveCodigo(produto, "BAR1")).toBe(true)
    expect(produtoResolveCodigo(produto, "SKU1")).toBe(true)
    expect(produtoResolveCodigo(produto, "AL2")).toBe(true)
    expect(produtoResolveCodigo(produto, " AL2 ")).toBe(true) // normaliza antes de comparar
    expect(produtoResolveCodigo(produto, "ZZZ")).toBe(false)
    expect(produtoResolveCodigo(produto, "")).toBe(false)
  })
})

describe("adicionarCodigoAliasMetadata", () => {
  it("adiciona o código a codigosAlias preservando demais chaves (ex.: fiscal)", () => {
    const base = { fiscal: { ncm: "12345678" } }
    const out = adicionarCodigoAliasMetadata(base, " NOVO ")
    expect(out.fiscal).toEqual({ ncm: "12345678" })
    expect(out.codigosAlias).toEqual(["NOVO"])
  })

  it("dedup: código já presente não duplica", () => {
    const out = adicionarCodigoAliasMetadata({ codigosAlias: ["A"] }, "A")
    expect(out.codigosAlias).toEqual(["A"])
  })

  it("acumula múltiplos aliases", () => {
    let meta: unknown = {}
    meta = adicionarCodigoAliasMetadata(meta, "A")
    meta = adicionarCodigoAliasMetadata(meta, "B")
    expect((meta as { codigosAlias: string[] }).codigosAlias).toEqual(["A", "B"])
  })

  it("código vazio → metadata inalterado (não cria a chave)", () => {
    expect(adicionarCodigoAliasMetadata({ fiscal: {} }, "   ")).toEqual({ fiscal: {} })
  })
})
