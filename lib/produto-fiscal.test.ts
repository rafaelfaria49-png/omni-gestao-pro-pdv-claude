/**
 * GOAL_004 — identidade fiscal do produto (lib/produto-fiscal).
 * Cobre: cadastro, edição, importação (legado), leitura, produto antigo, produto novo.
 */
import { describe, it, expect } from "vitest"
import {
  fiscalInputFromBody,
  getProdutoFiscal,
  isProdutoFiscalVazio,
  mergeProdutoFiscalIntoMetadata,
  sanitizeProdutoFiscal,
  PRODUTO_FISCAL_VAZIO,
} from "./produto-fiscal"

describe("sanitizeProdutoFiscal", () => {
  it("normaliza formatos (digits/length) e aceita aliases origem/unidade", () => {
    const f = sanitizeProdutoFiscal({
      ncm: "8517.62.00",
      cest: "2106400",
      cfop: "5102",
      origem: "0",
      unidade: "un",
      cst: "00",
      csosn: "102",
    })
    expect(f.ncm).toBe("85176200")
    expect(f.cest).toBe("2106400")
    expect(f.cfop).toBe("5102")
    expect(f.origemMercadoria).toBe("0")
    expect(f.unidadeComercial).toBe("UN")
    expect(f.cst).toBe("00")
    expect(f.csosn).toBe("102")
  })

  it("descarta valores inválidos (NCM curto, origem fora de 0-8)", () => {
    const f = sanitizeProdutoFiscal({ ncm: "123", origemMercadoria: "9", cfop: "ab" })
    expect(f.ncm).toBe("")
    expect(f.origemMercadoria).toBe("")
    expect(f.cfop).toBe("")
  })

  it("CEST curto é preenchido com zeros à esquerda", () => {
    expect(sanitizeProdutoFiscal({ cest: "106400" }).cest).toBe("0106400")
  })

  it("entrada nula → contrato vazio", () => {
    expect(sanitizeProdutoFiscal(null)).toEqual(PRODUTO_FISCAL_VAZIO)
  })
})

describe("getProdutoFiscal — leitura canônica", () => {
  it("PRODUTO NOVO: lê metadata.fiscal (canônico)", () => {
    const produto = { metadata: { fiscal: { ncm: "85176200", cfop: "5102", origemMercadoria: "0" } } }
    const f = getProdutoFiscal(produto)
    expect(f.ncm).toBe("85176200")
    expect(f.cfop).toBe("5102")
    expect(f.origemMercadoria).toBe("0")
  })

  it("PRODUTO IMPORTADO LEGADO: fallback para metadata.ncm/cest no topo", () => {
    const produto = { metadata: { ncm: "85176200", cest: "2106400", sinonimos: ["x"] } }
    const f = getProdutoFiscal(produto)
    expect(f.ncm).toBe("85176200")
    expect(f.cest).toBe("2106400")
  })

  it("metadata.fiscal tem precedência sobre o legado topo", () => {
    const produto = { metadata: { ncm: "00000000", fiscal: { ncm: "85176200" } } }
    expect(getProdutoFiscal(produto).ncm).toBe("85176200")
  })

  it("PRODUTO ANTIGO sem dado fiscal: contrato vazio, nunca lança", () => {
    expect(getProdutoFiscal({ metadata: {} })).toEqual(PRODUTO_FISCAL_VAZIO)
    expect(getProdutoFiscal({ metadata: null })).toEqual(PRODUTO_FISCAL_VAZIO)
    expect(getProdutoFiscal({})).toEqual(PRODUTO_FISCAL_VAZIO)
    expect(getProdutoFiscal(null)).toEqual(PRODUTO_FISCAL_VAZIO)
    expect(getProdutoFiscal(undefined)).toEqual(PRODUTO_FISCAL_VAZIO)
  })

  it("aceita receber diretamente o objeto metadata", () => {
    expect(getProdutoFiscal({ fiscal: { ncm: "85176200" } }).ncm).toBe("85176200")
  })
})

describe("mergeProdutoFiscalIntoMetadata — escrita canônica", () => {
  it("CADASTRO: cria metadata.fiscal com campos não-vazios", () => {
    const meta = mergeProdutoFiscalIntoMetadata({}, { ncm: "85176200", cfop: "5102", cest: "" })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cfop: "5102" })
  })

  it("EDIÇÃO: preserva outras chaves do metadata (merge não-destrutivo)", () => {
    const base = { sinonimos: ["cabo"], iaGeradoPor: "importador", foto: "x.jpg" }
    const meta = mergeProdutoFiscalIntoMetadata(base, { ncm: "85176200" })
    expect(meta.sinonimos).toEqual(["cabo"])
    expect(meta.iaGeradoPor).toBe("importador")
    expect(meta.foto).toBe("x.jpg")
    expect((meta.fiscal as Record<string, string>).ncm).toBe("85176200")
  })

  it("EDIÇÃO: roundtrip merge → getProdutoFiscal devolve o que foi gravado", () => {
    const meta = mergeProdutoFiscalIntoMetadata({ outro: 1 }, { ncm: "85176200", origem: "1" })
    expect(getProdutoFiscal({ metadata: meta })).toMatchObject({ ncm: "85176200", origemMercadoria: "1" })
  })

  it("nada fiscal informado → não adiciona a chave fiscal (JSONB enxuto)", () => {
    const meta = mergeProdutoFiscalIntoMetadata({ a: 1 }, { ncm: "", cest: "" })
    expect("fiscal" in meta).toBe(false)
    expect(meta.a).toBe(1)
  })
})

describe("fiscalInputFromBody — API (top-level ou metadata.fiscal)", () => {
  it("extrai campos fiscais top-level do body", () => {
    const inp = fiscalInputFromBody({ name: "x", ncm: "85176200", cfop: "5102" })
    expect(inp).not.toBeNull()
    expect(sanitizeProdutoFiscal(inp).ncm).toBe("85176200")
  })

  it("extrai de metadata.fiscal quando não há top-level", () => {
    const inp = fiscalInputFromBody({ metadata: { fiscal: { ncm: "85176200" } } })
    expect(sanitizeProdutoFiscal(inp).ncm).toBe("85176200")
  })

  it("body sem nada fiscal → null (não mexe em metadata)", () => {
    expect(fiscalInputFromBody({ name: "x", stock: 1, price: 2 })).toBeNull()
  })
})

describe("isProdutoFiscalVazio", () => {
  it("true para contrato vazio, false quando há algo", () => {
    expect(isProdutoFiscalVazio(PRODUTO_FISCAL_VAZIO)).toBe(true)
    expect(isProdutoFiscalVazio(sanitizeProdutoFiscal({ ncm: "85176200" }))).toBe(false)
  })
})
