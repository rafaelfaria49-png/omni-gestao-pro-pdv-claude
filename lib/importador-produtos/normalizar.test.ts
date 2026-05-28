import { describe, expect, it } from "vitest"
import { mapearHeader, parseNumeroBr } from "./normalizar"

// ── mapeamento de headers ─────────────────────────────────────
// Cobre o bug do "Venda R$" não mapear para `preco` (todos os
// produtos importados ficavam com precoVenda = 0).

describe("mapearHeader — campos canônicos básicos", () => {
  it("nome em variações comuns", () => {
    expect(mapearHeader("Nome")).toBe("nome")
    expect(mapearHeader("Produto")).toBe("nome")
    expect(mapearHeader("Descrição")).toBe("nome")
    expect(mapearHeader("Descrição do produto")).toBe("nome")
  })

  it("sku/código em variações comuns", () => {
    expect(mapearHeader("SKU")).toBe("sku")
    expect(mapearHeader("Código")).toBe("sku")
    expect(mapearHeader("Referência")).toBe("sku")
  })

  it("barcode/EAN", () => {
    expect(mapearHeader("EAN")).toBe("barcode")
    expect(mapearHeader("GTIN")).toBe("barcode")
    expect(mapearHeader("Código de Barras")).toBe("barcode")
  })

  it("estoque", () => {
    expect(mapearHeader("Estoque")).toBe("estoque")
    expect(mapearHeader("Quantidade")).toBe("estoque")
    expect(mapearHeader("Qtd")).toBe("estoque")
  })

  it("categoria", () => {
    expect(mapearHeader("Categoria")).toBe("categoria")
    expect(mapearHeader("Departamento")).toBe("categoria")
  })
})

describe("mapearHeader — custo R$ via contains", () => {
  it("'Custo R$' bate em 'custo' via contains (startsWith)", () => {
    // norm("Custo R$") → "custo r" — alias "custo" tem startsWith match.
    expect(mapearHeader("Custo R$")).toBe("custo")
  })

  it("'Custo' puro", () => {
    expect(mapearHeader("Custo")).toBe("custo")
  })

  it("'Preço de Custo'", () => {
    expect(mapearHeader("Preço de Custo")).toBe("custo")
  })
})

describe("mapearHeader — preço de venda (BUG 'Venda R$')", () => {
  it("'Venda R$' agora mapeia para preco (era o bug reportado)", () => {
    // norm("Venda R$") → "venda r". Antes do fix nenhum alias casava.
    expect(mapearHeader("Venda R$")).toBe("preco")
  })

  it("variantes BR de Venda R$", () => {
    expect(mapearHeader("VENDA R$")).toBe("preco")
    expect(mapearHeader("Venda r$")).toBe("preco")
    expect(mapearHeader("Venda (R$)")).toBe("preco")
  })

  it("variantes Vlr/VL", () => {
    expect(mapearHeader("Vlr Venda")).toBe("preco")
    expect(mapearHeader("VL Venda")).toBe("preco")
  })

  it("variantes 'Preço R$' / 'Preco R$'", () => {
    expect(mapearHeader("Preço R$")).toBe("preco")
    expect(mapearHeader("Preco R$")).toBe("preco")
  })

  it("aliases já existentes continuam funcionando", () => {
    expect(mapearHeader("Preço")).toBe("preco")
    expect(mapearHeader("Preço de Venda")).toBe("preco")
    expect(mapearHeader("Valor")).toBe("preco")
    expect(mapearHeader("Valor Unitário")).toBe("preco")
  })

  it("header desconhecido continua null", () => {
    expect(mapearHeader("Coluna Random")).toBeNull()
    expect(mapearHeader("")).toBeNull()
  })
})

// ── parseNumeroBr — sanity check ──────────────────────────────

describe("parseNumeroBr", () => {
  it("aceita R$ brasileiro", () => {
    expect(parseNumeroBr("R$ 1.234,56")).toBe(1234.56)
    expect(parseNumeroBr("1.234,56")).toBe(1234.56)
    expect(parseNumeroBr("12,50")).toBe(12.5)
  })

  it("aceita formato US", () => {
    expect(parseNumeroBr("1234.56")).toBe(1234.56)
    expect(parseNumeroBr("1,234.56")).toBe(1234.56)
  })

  it("retorna null para vazio/inválido", () => {
    expect(parseNumeroBr("")).toBeNull()
    expect(parseNumeroBr(null)).toBeNull()
    expect(parseNumeroBr("abc")).toBeNull()
  })

  it("passa números nativos", () => {
    expect(parseNumeroBr(42)).toBe(42)
    expect(parseNumeroBr(0)).toBe(0)
  })
})
