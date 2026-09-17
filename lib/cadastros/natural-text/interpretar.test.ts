import { afterEach, describe, expect, it, vi } from "vitest"
import {
  interpretarTextoProduto,
  AVISO_IA_INDISPONIVEL,
  type DepsInterpretacao,
} from "./interpretar"
import type { SugestaoTextoLivre } from "./types"

/**
 * CAD-R2-016 — interpretação server-side (LLM mockado; sem rede, sem banco).
 * Prova: extraídos preservados, ausentes não inventados, proibidos rejeitados,
 * divergência resolvida pelo texto, degradação honesta sem LLM.
 */

const AGORA_FIXA = new Date("2026-09-17T12:00:00.000Z")
const depsBase: DepsInterpretacao = { agora: () => AGORA_FIXA }

function mockModelo(payload: Record<string, unknown>): DepsInterpretacao {
  return { ...depsBase, chamarModelo: async () => payload }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("interpretar: exemplos canonicos end-to-end", () => {
  it("1. nome/categoria simples: seguro inferido, sensivel ausente", async () => {
    const s = await interpretarTextoProduto(
      "Película 3D para iPhone 15",
      mockModelo({ nome: "Película 3D iPhone 15", marca: null, categoria: "Películas", descricao: "Película de proteção 3D para iPhone 15.", preco: null, custo: null, estoque: null, fornecedor: null, sku: null, ean: null, garantia_dias: null }),
    )
    expect(s.campos.nome.valor).toBe("Película 3D iPhone 15")
    expect(s.campos.categoria.valor).toBe("Películas")
    expect(s.campos.categoria.estado).toBe("inferido")
    expect(s.campos.preco).toEqual({ valor: null, estado: "ausente" })
    expect(s.campos.custo.estado).toBe("ausente")
    expect(s.campos.estoque.estado).toBe("ausente")
    expect(s.campos.fornecedor.estado).toBe("ausente")
    expect(s.campos.sku.estado).toBe("ausente")
    expect(s.campos.ean.estado).toBe("ausente")
    expect(s.campos.garantia.estado).toBe("ausente")
    expect(s.proveniencia.source).toBe("natural_text")
    expect(s.proveniencia.backend).toBe("openrouter")
    expect(s.proveniencia.interpretedAt).toBe(AGORA_FIXA.toISOString())
  })

  it("2. preco explicito preservado; 3. custo explicito preservado", async () => {
    const s = await interpretarTextoProduto(
      "Película 3D para iPhone 15, custa 4 reais e vendo por 25",
      mockModelo({ nome: "Película 3D iPhone 15", categoria: "Películas", preco: 25, custo: 4 }),
    )
    expect(s.campos.preco).toEqual({ valor: 25, estado: "extraido" })
    expect(s.campos.custo).toEqual({ valor: 4, estado: "extraido" })
    expect(s.proveniencia.camposExtraidos).toEqual(expect.arrayContaining(["preco", "custo"]))
  })

  it("4. estoque explicito; 5. fornecedor explicito; 6. EAN/SKU explicitos", async () => {
    const s = await interpretarTextoProduto(
      "Carregador turbo Kaidi 20W, estoque inicial 10 unidades, custo 18, venda 39,90, SKU KDI-20W, EAN 7891234567895, fornecedor Center Cell, garantia de 1 ano",
      mockModelo({ nome: "Carregador turbo Kaidi 20W", marca: "Kaidi" }),
    )
    expect(s.campos.estoque).toEqual({ valor: 10, estado: "extraido" })
    expect(s.campos.fornecedor).toEqual({ valor: "Center Cell", estado: "extraido" })
    expect(s.campos.sku).toEqual({ valor: "KDI-20W", estado: "extraido" })
    expect(s.campos.ean).toEqual({ valor: "7891234567895", estado: "extraido" })
    expect(s.campos.custo).toEqual({ valor: 18, estado: "extraido" })
    expect(s.campos.preco).toEqual({ valor: 39.9, estado: "extraido" })
    expect(s.campos.garantia).toEqual({ valor: 365, estado: "extraido" })
    // "Kaidi" está verbatim no texto → extraído; o resto, inferido.
    expect(s.campos.marca).toEqual({ valor: "Kaidi", estado: "extraido" })
  })
})

describe("interpretar: IA nunca inventa sensivel/fiscal", () => {
  it("7. ausencia total: LLM com valores sem ancora e descartado", async () => {
    const s = await interpretarTextoProduto(
      "Capinha bonita azul",
      mockModelo({ nome: "Capinha azul", preco: 99.9, custo: 10, estoque: 5, fornecedor: "Xpto", sku: "ABC", ean: "123", garantia_dias: 90 }),
    )
    expect(s.campos.preco.estado).toBe("ausente")
    expect(s.campos.custo.estado).toBe("ausente")
    expect(s.campos.estoque.estado).toBe("ausente")
    expect(s.campos.fornecedor.estado).toBe("ausente")
    expect(s.campos.sku.estado).toBe("ausente")
    expect(s.campos.ean.estado).toBe("ausente")
    expect(s.campos.garantia.estado).toBe("ausente")
    expect(s.avisos.some((a) => a.includes("sem evidência no texto"))).toBe(true)
  })

  it("8. payload com campo proibido e desconhecido: rejeitado e listado", async () => {
    const s = await interpretarTextoProduto(
      "Película iPhone",
      mockModelo({ nome: "Película iPhone", ncm: "85065010", cest: "1700600", metadata: { x: 1 }, score: 0.99, campoMisterioso: "zzz", preco: null }),
    )
    expect(s.campos.ncm).toEqual({ valor: null, estado: "ausente" })
    expect(s.campos.cest).toEqual({ valor: null, estado: "ausente" })
    expect(s.rejeitados).toEqual(expect.arrayContaining(["ncm", "cest", "metadata", "score", "campoMisterioso"]))
    expect(s.avisos.some((a) => a.includes("fora do contrato"))).toBe(true)
    // Nada de fiscal/lixo vaza para os campos.
    expect(JSON.stringify(s.campos)).not.toContain("85065010")
  })

  it("8b. NCM explicito NO TEXTO e considerado; do LLM, jamais", async () => {
    const s = await interpretarTextoProduto(
      "Peça X, NCM 85065010",
      mockModelo({ nome: "Peça X", ncm: "99999999" }),
    )
    expect(s.campos.ncm).toEqual({ valor: "85065010", estado: "extraido" })
    expect(s.rejeitados).toContain("ncm")
  })

  it("divergencia: deterministico (evidencia) vence o LLM + aviso", async () => {
    const s = await interpretarTextoProduto(
      "Cabo, custa 4 reais",
      mockModelo({ nome: "Cabo", custo: 5 }),
    )
    expect(s.campos.custo).toEqual({ valor: 4, estado: "extraido" })
    expect(s.avisos.some((a) => a.includes("divergiu"))).toBe(true)
  })

  it("gap-fill ancorado: numero por extenso com keyword vira extraido", async () => {
    const s = await interpretarTextoProduto(
      "Carregador, estoque de dez unidades",
      mockModelo({ nome: "Carregador", estoque: 10 }),
    )
    expect(s.campos.estoque).toEqual({ valor: 10, estado: "extraido" })
  })
})

describe("interpretar: resposta invalida, timeout e indisponibilidade", () => {
  it("9. LLM quebrado: degradacao honesta, explicitos preservados", async () => {
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const s = await interpretarTextoProduto("Película iPhone, custa 4 reais e vendo por 25", {
      ...depsBase,
      chamarModelo: async () => {
        throw new Error("LLM_TIMEOUT")
      },
    })
    expect(s.proveniencia.backend).toBe("local-deterministico")
    expect(s.proveniencia.degradadoLocal).toBe(true)
    expect(s.avisos).toContain(AVISO_IA_INDISPONIVEL)
    expect(s.campos.preco.valor).toBe(25)
    expect(s.campos.custo.valor).toBe(4)
    // Nome cai no fallback determinístico (as palavras do operador).
    expect(s.campos.nome.estado).toBe("inferido")
    erroSpy.mockRestore()
  })

  it("10. texto ambiguo: preco sem rotulo vira ambiguo + aviso", async () => {
    const s = await interpretarTextoProduto(
      "Fone bluetooth 50 reais",
      mockModelo({ nome: "Fone bluetooth" }),
    )
    expect(s.campos.preco.valor).toBe(50)
    expect(s.campos.preco.estado).toBe("ambiguo")
    expect(s.avisos.some((a) => a.includes("sem rótulo"))).toBe(true)
  })

  it("11/12. timeout/provider indisponivel: local-deterministico, sem vazar segredo", async () => {
    const fakeKey = "sk-fake-secret-key-00-abcdef"
    vi.stubEnv("OPENROUTER_API_KEY", fakeKey)
    vi.stubEnv("OPENAI_API_KEY", "")
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.stubEnv("GOOGLE_AI_API_KEY", "")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`boom de rede contendo ${fakeKey}`)
      }),
    )
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const s: SugestaoTextoLivre = await interpretarTextoProduto(
      "Película iPhone, custa 4 reais e vendo por 25",
      { agora: () => AGORA_FIXA },
    )
    expect(s.proveniencia.backend).toBe("local-deterministico")
    expect(s.proveniencia.model).toBeNull()
    expect(s.proveniencia.degradadoLocal).toBe(true)
    expect(s.avisos).toContain(AVISO_IA_INDISPONIVEL)
    expect(s.campos.preco).toEqual({ valor: 25, estado: "extraido" })
    expect(s.campos.custo).toEqual({ valor: 4, estado: "extraido" })
    // Segredo jamais na resposta, jamais no log.
    expect(JSON.stringify(s)).not.toContain(fakeKey)
    for (const call of erroSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(fakeKey)
    }
    erroSpy.mockRestore()
  })

  it("texto vazio e texto longo: erros sanitizados fail-closed", async () => {
    await expect(interpretarTextoProduto("   ", depsBase)).rejects.toThrow()
    await expect(interpretarTextoProduto("x".repeat(2001), depsBase)).rejects.toThrow()
  })
})

describe("interpretar: contrato e limites", () => {
  it("sem score numerico de confianca em lugar nenhum", async () => {
    const s = await interpretarTextoProduto("Película iPhone", mockModelo({ nome: "Película iPhone" }))
    const serializado = JSON.stringify(s)
    expect(serializado).not.toMatch(/confianca|confidence|score/i)
    expect(Object.keys(s)).toEqual(["campos", "avisos", "rejeitados", "proveniencia"])
  })

  it("limites de texto aplicados (nome truncado, numero negativo descartado)", async () => {
    const s = await interpretarTextoProduto(
      "Produto X",
      mockModelo({ nome: "N".repeat(500), preco: -10, estoque: 1.9 }),
    )
    expect((s.campos.nome.valor ?? "").length).toBeLessThanOrEqual(120)
    expect(s.campos.preco).toEqual({ valor: null, estado: "ausente" })
  })

  it("proveniencia sem texto do operador, prompt ou resposta bruta", async () => {
    const texto = "Película secreta XPTO-123"
    const s = await interpretarTextoProduto(texto, mockModelo({ nome: "Película XPTO" }))
    expect(JSON.stringify(s.proveniencia)).not.toContain("XPTO-123")
  })
})
