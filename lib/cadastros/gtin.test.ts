import { describe, expect, it } from "vitest"
import { validarGtin } from "./gtin"

describe("validarGtin", () => {
  it("aceita EAN-8 e EAN-13 com dígito verificador válido", () => {
    expect(validarGtin("96385074")).toMatchObject({ valid: true, gtin: "96385074", formato: "EAN-8" })
    expect(validarGtin("4006381333931")).toMatchObject({ valid: true, gtin: "4006381333931", formato: "EAN-13" })
  })

  it("normaliza UPC-A para EAN-13 e busca também o valor legado de 12 dígitos", () => {
    expect(validarGtin("036000291452")).toEqual({
      valid: true,
      gtin: "0036000291452",
      formato: "UPC-A",
      interno: false,
      lookupCandidates: ["0036000291452", "036000291452"],
    })
  })

  it("classifica prefixo 20–29 como interno e o mantém apto apenas à busca local", () => {
    expect(validarGtin("2012345678903")).toEqual({
      valid: true,
      gtin: "2012345678903",
      formato: "interno-2xx",
      interno: true,
      lookupCandidates: ["2012345678903"],
    })
  })

  it("rejeita caracteres não numéricos, comprimento inválido e dígito verificador incorreto", () => {
    expect(validarGtin("4006-381333931")).toMatchObject({ valid: false })
    expect(validarGtin("1234567")).toMatchObject({ valid: false })
    expect(validarGtin("4006381333932")).toEqual({
      valid: false,
      message: "Código de barras inválido: dígito verificador não confere.",
    })
  })
})
