import { describe, expect, it } from "vitest"
import { extrairDeterministico, textoAncoraCampo } from "./extracao-deterministica"

/**
 * CAD-R2-016 — extração determinística (pura: sem rede, sem banco, sem LLM).
 * Âncora de evidência dos campos sensíveis: sem evidência textual, nada é extraído.
 */
describe("extracao deterministica: exemplos canonicos do GOAL", () => {
  it("1. pelicula: custo rotulado + venda rotulada, sem invencao", () => {
    const r = extrairDeterministico("Película 3D para iPhone 15, custa 4 reais e vendo por 25")
    expect(r.custo?.valor).toBe(4)
    expect(r.preco?.valor).toBe(25)
    expect(r.custo?.rotulado).toBe(true)
    expect(r.preco?.rotulado).toBe(true)
    expect(r.estoque).toBeNull()
    expect(r.fornecedor).toBeNull()
    expect(r.sku).toBeNull()
    expect(r.ean).toBeNull()
    expect(r.garantiaDias).toBeNull()
    expect(r.ncm).toBeNull()
    expect(r.cest).toBeNull()
    // "15" do iPhone 15 não é dinheiro.
    expect(r.valoresSoltos).toEqual([])
  })

  it("2. carregador: estoque + custo + venda; 20W nao vira dinheiro", () => {
    const r = extrairDeterministico(
      "Carregador turbo Kaidi 20W USB-C, estoque inicial 10 unidades, custo 18, venda 39,90",
    )
    expect(r.estoque?.valor).toBe(10)
    expect(r.custo?.valor).toBe(18)
    expect(r.preco?.valor).toBe(39.9)
    expect(r.valoresSoltos).toEqual([])
  })

  it("3. capinha: fornecedor explicito; A15 nao vira dinheiro", () => {
    const r = extrairDeterministico("Capinha transparente Samsung A15, fornecedor Center Cell")
    expect(r.fornecedor?.valor).toBe("Center Cell")
    expect(r.preco).toBeNull()
    expect(r.custo).toBeNull()
    expect(r.estoque).toBeNull()
  })
})

describe("extracao deterministica: identificadores e garantia", () => {
  it("4. EAN-13 valido explicito e passado pelo validarGtin", () => {
    const r = extrairDeterministico("Película iPhone 15, EAN 7891234567895, vendo por 25")
    expect(r.ean?.valor).toBe("7891234567895")
    expect(r.preco?.valor).toBe(25)
  })

  it("5. EAN com digito invalido: mantem o declarado + aviso", () => {
    const r = extrairDeterministico("Película iPhone, EAN 7891234567890")
    expect(r.ean?.valor).toBe("7891234567890")
    expect(r.avisos.some((a) => a.includes("dígito verificador"))).toBe(true)
  })

  it("6. SKU explicito normalizado", () => {
    const r = extrairDeterministico("Capinha A15, SKU CAP-A15-TR, custo 5")
    expect(r.sku?.valor).toBe("CAP-A15-TR")
    expect(r.custo?.valor).toBe(5)
  })

  it("7. garantia em meses convertida para dias", () => {
    const r = extrairDeterministico("Carregador turbo, garantia de 3 meses, vendo por 40")
    expect(r.garantiaDias?.valor).toBe(90)
    expect(r.preco?.valor).toBe(40)
  })

  it("8. garantia mencionada sem prazo: ausente + aviso", () => {
    const r = extrairDeterministico("Carregador com garantia")
    expect(r.garantiaDias).toBeNull()
    expect(r.avisos.some((a) => a.includes("Garantia mencionada"))).toBe(true)
  })
})

describe("extracao deterministica: ausencia e ambiguidade", () => {
  it("9. sem valores: tudo ausente, nada inventado", () => {
    const r = extrairDeterministico("Capinha bonita azul")
    expect(r.preco).toBeNull()
    expect(r.custo).toBeNull()
    expect(r.estoque).toBeNull()
    expect(r.fornecedor).toBeNull()
    expect(r.sku).toBeNull()
    expect(r.ean).toBeNull()
    expect(r.garantiaDias).toBeNull()
    expect(r.valoresSoltos).toEqual([])
    expect(r.avisos).toEqual([])
  })

  it("10. valor unico com moeda mas sem rotulo: preco ambiguo preservado", () => {
    const r = extrairDeterministico("Fone bluetooth 50 reais")
    expect(r.preco?.valor).toBe(50)
    expect(r.preco?.rotulado).toBe(false)
    expect(r.ambiguos).toContain("preco")
    expect(r.avisos.some((a) => a.includes("sem rótulo"))).toBe(true)
  })

  it("11. dois valores sem rotulo: preco ambiguo nulo + aviso", () => {
    const r = extrairDeterministico("Cabo 10 reais e 20 reais")
    expect(r.preco).toBeNull()
    expect(r.ambiguos).toContain("preco")
    expect(r.avisos.some((a) => a.includes("10 e 20"))).toBe(true)
  })

  it("12. inteiro solto sem moeda/keyword nao e dinheiro (iPhone 15, 10 unidades)", () => {
    const r = extrairDeterministico("iPhone 15 com 10 unidades no estoque? não, só olhando")
    // "10 unidades" É estoque; "15" não é dinheiro.
    expect(r.estoque?.valor).toBe(10)
    expect(r.preco).toBeNull()
    expect(r.custo).toBeNull()
  })

  it("13. milhares pt-BR e R$ prefixado", () => {
    const r = extrairDeterministico("Notebook, vendo por R$ 1.299,90")
    expect(r.preco?.valor).toBe(1299.9)
  })
})

describe("extracao deterministica: fiscal explicito e conflitos", () => {
  it("14. NCM/CEST explicitos entram; sem keyword fiscal, ausentes", () => {
    const comFiscal = extrairDeterministico("Peça X, NCM 85065010, CEST 1700600")
    expect(comFiscal.ncm?.valor).toBe("85065010")
    expect(comFiscal.cest?.valor).toBe("1700600")
    const semFiscal = extrairDeterministico("Peça X, vendo por 10")
    expect(semFiscal.ncm).toBeNull()
    expect(semFiscal.cest).toBeNull()
  })

  it("15. valores conflitantes no mesmo papel: ambiguo + aviso", () => {
    const r = extrairDeterministico("Cabo, custo 5, custo 7")
    expect(r.custo).toBeNull()
    expect(r.ambiguos).toContain("custo")
  })

  it("16. dois EANs distintos: ambiguo + aviso", () => {
    const r = extrairDeterministico("EAN 7891234567895 ou 7891234567048")
    expect(r.ean).toBeNull()
    expect(r.ambiguos).toContain("ean")
  })
})

describe("textoAncoraCampo: gate do gap-fill do LLM", () => {
  it("keyword do campo ancora valor por extenso", () => {
    expect(textoAncoraCampo("estoque de dez unidades", "estoque", 10)).toBe(true)
  })
  it("digitos do valor ancoram sem keyword", () => {
    expect(textoAncoraCampo("7891234567895 na caixa", "ean", "7891234567895")).toBe(true)
  })
  it("sem keyword e sem digitos: sem ancora", () => {
    expect(textoAncoraCampo("Capinha bonita", "preco", 99)).toBe(false)
    expect(textoAncoraCampo("Capinha bonita", "fornecedor", "Xpto")).toBe(false)
  })
})
