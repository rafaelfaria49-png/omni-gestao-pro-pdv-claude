import { describe, expect, it } from "vitest"
import { parsePdvScanPrefix } from "./pdv-scan-prefix"

describe("parsePdvScanPrefix", () => {
  it("extrai prefixo com 'x' minúsculo e maiúsculo", () => {
    expect(parsePdvScanPrefix("3x78912345")).toEqual({
      qty: 3,
      query: "78912345",
      hasPrefix: true,
    })
    expect(parsePdvScanPrefix("5XPROD-001")).toEqual({
      qty: 5,
      query: "PROD-001",
      hasPrefix: true,
    })
  })

  it("extrai prefixo com asterisco '*'", () => {
    expect(parsePdvScanPrefix("2*7890002")).toEqual({
      qty: 2,
      query: "7890002",
      hasPrefix: true,
    })
  })

  it("extrai prefixo com caractere unicode de multiplicação '×'", () => {
    expect(parsePdvScanPrefix("4×SKU-99")).toEqual({
      qty: 4,
      query: "SKU-99",
      hasPrefix: true,
    })
  })

  it("trata espaços ao redor do código ou da query", () => {
    expect(parsePdvScanPrefix("  10x  Cabo USB-C  ")).toEqual({
      qty: 10,
      query: "Cabo USB-C",
      hasPrefix: true,
    })
  })

  it("retorna quantidade 1 e query original quando não há prefixo", () => {
    expect(parsePdvScanPrefix("7891234567890")).toEqual({
      qty: 1,
      query: "7891234567890",
      hasPrefix: false,
    })
    expect(parsePdvScanPrefix("Coca Cola")).toEqual({
      qty: 1,
      query: "Coca Cola",
      hasPrefix: false,
    })
  })

  it("trata string vazia com segurança", () => {
    expect(parsePdvScanPrefix("")).toEqual({
      qty: 1,
      query: "",
      hasPrefix: false,
    })
    expect(parsePdvScanPrefix("   ")).toEqual({
      qty: 1,
      query: "",
      hasPrefix: false,
    })
  })

  it("garante quantidade mínima 1 mesmo se prefixo for 0", () => {
    expect(parsePdvScanPrefix("0x789")).toEqual({
      qty: 1,
      query: "789",
      hasPrefix: true,
    })
  })
})
