import { describe, expect, it } from "vitest"
import {
  cleanLabel, comboKey, labelKey, normalizeBarcodeInterno, normalizeHex, normalizeVariantSku, parseOptionalMoney, variantSituacao,
} from "./catalog-normalize"

describe("P02 — normalização do catálogo de grade", () => {
  it("chave de nome ignora caixa, acento e espaços sem fundir nomes comerciais distintos", () => {
    expect(labelKey(cleanLabel("  azul   marinho ", 60)!)).toBe(labelKey("Azul Marinho"))
    expect(labelKey("Calçados")).toBe(labelKey("CALCADOS"))
    expect(labelKey("Azul")).not.toBe(labelKey("Azul Royal"))
    expect(cleanLabel("", 60)).toBeNull()
    expect(cleanLabel("a\u0007b", 60)).toBeNull()
    expect(cleanLabel("x".repeat(61), 60)).toBeNull()
  })

  it("SKU: maiúsculas, sem espaço interno, charset do banco; vazio vira rascunho (null)", () => {
    expect(normalizeVariantSku(" cam-preto-p ")).toEqual({ ok: true, value: "CAM-PRETO-P" })
    expect(normalizeVariantSku("")).toEqual({ ok: true, value: null })
    expect(normalizeVariantSku(undefined)).toEqual({ ok: true, value: null })
    expect(normalizeVariantSku("cam preto").ok).toBe(false)
    expect(normalizeVariantSku("camisá").ok).toBe(false)
    expect(normalizeVariantSku("-abc").ok).toBe(false)
    expect(normalizeVariantSku("Ａ１").ok && normalizeVariantSku("Ａ１")).toEqual({ ok: true, value: "A1" }) // NFKC
    expect(normalizeVariantSku("A".repeat(61)).ok).toBe(false)
  })

  it("código interno nunca é fabricado: só valida o informado (ASCII visível, maiúsculo)", () => {
    expect(normalizeBarcodeInterno(null)).toEqual({ ok: true, value: null })
    expect(normalizeBarcodeInterno(" ogv-abc ")).toEqual({ ok: true, value: "OGV-ABC" })
    expect(normalizeBarcodeInterno("com espaço").ok).toBe(false)
    expect(normalizeBarcodeInterno("ç").ok).toBe(false)
  })

  it("HEX opcional e normalizado; estampa pode não ter HEX", () => {
    expect(normalizeHex("ff00aa")).toEqual({ ok: true, value: "#FF00AA" })
    expect(normalizeHex("")).toEqual({ ok: true, value: null })
    expect(normalizeHex("#fff").ok).toBe(false)
    expect(normalizeHex("vermelho").ok).toBe(false)
  })

  it("dinheiro em string decimal pt-BR, HALF_UP pelo contrato P01, sem Number intermediário", () => {
    expect(parseOptionalMoney("49,90", 2, "Preço")).toEqual({ ok: true, value: 4990 })
    expect(parseOptionalMoney("R$ 1.234,56", 2, "Preço")).toEqual({ ok: true, value: 123456 })
    expect(parseOptionalMoney("0,005", 2, "Preço")).toEqual({ ok: true, value: 1 }) // HALF_UP
    expect(parseOptionalMoney("49.90", 2, "Preço")).toEqual({ ok: true, value: 4990 })
    expect(parseOptionalMoney("1.005", 2, "Preço").ok).toBe(false) // ambíguo: milhar ou decimal
    expect(parseOptionalMoney("1.005,00", 2, "Preço")).toEqual({ ok: true, value: 100500 })
    expect(parseOptionalMoney("20", 6, "Custo")).toEqual({ ok: true, value: 20_000_000 })
    expect(parseOptionalMoney("", 2, "Preço")).toEqual({ ok: true, value: null })
    expect(parseOptionalMoney("-1", 2, "Preço").ok).toBe(false)
    expect(parseOptionalMoney("1e3", 2, "Preço").ok).toBe(false)
  })

  it("situação é de cadastro, nunca de estoque; combinação serializada sem ambiguidade", () => {
    expect(variantSituacao({ ativo: true, sku: "A", barcodeInterno: null })).toBe("RASCUNHO")
    expect(variantSituacao({ ativo: true, sku: "A", barcodeInterno: "B" })).toBe("COMPLETA")
    expect(variantSituacao({ ativo: false, sku: "A", barcodeInterno: "B" })).toBe("INATIVA")
    expect(comboKey("a,b", "c")).not.toBe(comboKey("a", "b,c"))
  })
})
