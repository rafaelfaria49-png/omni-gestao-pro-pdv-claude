import { describe, expect, it } from "vitest"
import { mapearHeader, parseNumeroBr, sanitizarCodigoFiscal } from "./normalizar"

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

describe("mapearHeader — campos fiscais NCM/CEST (vão para Produto.metadata)", () => {
  it("'Código NCM' / 'NCM' agora mapeiam para o campo ncm", () => {
    expect(mapearHeader("Código NCM")).toBe("ncm")
    expect(mapearHeader("Codigo NCM")).toBe("ncm")
    expect(mapearHeader("NCM")).toBe("ncm")
    expect(mapearHeader("NCM Produto")).toBe("ncm")
  })

  it("'Código CEST' / 'CEST' agora mapeiam para o campo cest", () => {
    expect(mapearHeader("Código CEST")).toBe("cest")
    expect(mapearHeader("Codigo CEST")).toBe("cest")
    expect(mapearHeader("CEST")).toBe("cest")
    expect(mapearHeader("CEST Produto")).toBe("cest")
  })

  it("NCM/CEST nunca caem em SKU (era bug: contains de 'codigo')", () => {
    // mapearHeader retorna o campo correto, sku NÃO aparece.
    expect(mapearHeader("Código NCM")).not.toBe("sku")
    expect(mapearHeader("Código CEST")).not.toBe("sku")
    expect(mapearHeader("Codigo NCM")).not.toBe("sku")
    expect(mapearHeader("Codigo CEST")).not.toBe("sku")
  })

  it("'Descrição NCM' / 'Descrição CEST' continuam null (texto descritivo, não código)", () => {
    expect(mapearHeader("Descrição NCM")).toBeNull()
    expect(mapearHeader("Descricao NCM")).toBeNull()
    expect(mapearHeader("Descrição CEST")).toBeNull()
    expect(mapearHeader("Descricao CEST")).toBeNull()
  })
})

describe("mapearHeader — stoplist (Gestão Clique e similares)", () => {
  it("CFOP/CST/origem mercadoria são ignorados (fiscais sem schema)", () => {
    expect(mapearHeader("CFOP")).toBeNull()
    expect(mapearHeader("CST")).toBeNull()
    expect(mapearHeader("CST PIS")).toBeNull()
    expect(mapearHeader("CST COFINS")).toBeNull()
    expect(mapearHeader("Origem Mercadoria")).toBeNull()
  })

  it("'Estoque mínimo'/'Estoque máximo' NÃO viram 'estoque' (era bug: contains)", () => {
    expect(mapearHeader("Estoque mínimo")).toBeNull()
    expect(mapearHeader("Estoque maximo")).toBeNull()
    expect(mapearHeader("Estoque min")).toBeNull()
    expect(mapearHeader("Estoque max")).toBeNull()
    expect(mapearHeader("Qtde mínima")).toBeNull()
    expect(mapearHeader("Qtde maxima")).toBeNull()
  })

  it("'Estoque atual' continua mapeando para estoque (não confundir)", () => {
    expect(mapearHeader("Estoque atual")).toBe("estoque")
    expect(mapearHeader("Estoque")).toBe("estoque")
  })

  it("Datas e IDs genéricos são ignorados", () => {
    expect(mapearHeader("Data Cadastro")).toBeNull()
    expect(mapearHeader("Data Alteração")).toBeNull()
    expect(mapearHeader("ID")).toBeNull()
    expect(mapearHeader("ID Externo")).toBeNull()
  })

  it("'Descrição NCM' / 'Descrição CEST' NÃO viram NOME (era bug: contains de 'descricao')", () => {
    expect(mapearHeader("Descrição NCM")).toBeNull()
    expect(mapearHeader("Descricao NCM")).toBeNull()
    expect(mapearHeader("Descrição CEST")).toBeNull()
    expect(mapearHeader("Descricao CEST")).toBeNull()
    expect(mapearHeader("Descrição CFOP")).toBeNull()
    expect(mapearHeader("Descrição CST")).toBeNull()
  })

  it("'Lucro %' / margem / promocional não viram preço", () => {
    expect(mapearHeader("Lucro %")).toBeNull()
    expect(mapearHeader("Lucro")).toBeNull()
    expect(mapearHeader("Margem")).toBeNull()
    expect(mapearHeader("Margem %")).toBeNull()
    expect(mapearHeader("Preço Promocional")).toBeNull()
    expect(mapearHeader("Valor Promocional")).toBeNull()
  })

  it("'P. Prom. R$' (preço promocional Smart Genius) é ignorado", () => {
    // norm("P. Prom. R$") → "p prom r"
    expect(mapearHeader("P. Prom. R$")).toBeNull()
    expect(mapearHeader("P Prom")).toBeNull()
  })

  it("Dimensões e peso (Gestão Clique) são ignorados — não há campo no schema", () => {
    expect(mapearHeader("Peso")).toBeNull()
    expect(mapearHeader("Peso bruto")).toBeNull()
    expect(mapearHeader("Peso líquido")).toBeNull()
    expect(mapearHeader("Largura")).toBeNull()
    expect(mapearHeader("Altura")).toBeNull()
    expect(mapearHeader("Comprimento")).toBeNull()
    expect(mapearHeader("Profundidade")).toBeNull()
  })

  it("'Nome' e 'Produto' continuam mapeando para nome — stoplist não vaza", () => {
    expect(mapearHeader("Nome")).toBe("nome")
    expect(mapearHeader("Produto")).toBe("nome")
    expect(mapearHeader("Descrição")).toBe("nome")
    expect(mapearHeader("Descrição do produto")).toBe("nome")
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

describe("sanitizarCodigoFiscal", () => {
  it("remove pontos do NCM com separadores", () => {
    expect(sanitizarCodigoFiscal("3926.90.90")).toBe("39269090")
    expect(sanitizarCodigoFiscal("4202.12.20")).toBe("42021220")
    expect(sanitizarCodigoFiscal("8506.50.10")).toBe("85065010")
  })

  it("aceita NCM sem separadores", () => {
    expect(sanitizarCodigoFiscal("39269090")).toBe("39269090")
    expect(sanitizarCodigoFiscal("42021220")).toBe("42021220")
  })

  it("aceita CEST com e sem separadores", () => {
    expect(sanitizarCodigoFiscal("28.106.00")).toBe("2810600")
    expect(sanitizarCodigoFiscal("2810600")).toBe("2810600")
  })

  it("aceita NCM/CEST como número (planilhas que entregam Number)", () => {
    expect(sanitizarCodigoFiscal(39269090)).toBe("39269090")
    expect(sanitizarCodigoFiscal(2810600)).toBe("2810600")
  })

  it("retorna vazio para lixo / null / undefined", () => {
    expect(sanitizarCodigoFiscal("")).toBe("")
    expect(sanitizarCodigoFiscal("—")).toBe("")
    expect(sanitizarCodigoFiscal("n/a")).toBe("")
    expect(sanitizarCodigoFiscal(null)).toBe("")
    expect(sanitizarCodigoFiscal(undefined)).toBe("")
  })

  it("não valida comprimento — aceita NCM curto (4 dígitos de capítulo)", () => {
    expect(sanitizarCodigoFiscal("3926")).toBe("3926")
  })
})

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
