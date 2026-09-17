import { describe, expect, it } from "vitest"
import { calcularAplicacaoTextoLivre } from "./aplicar"
import type { SugestaoTextoLivre } from "./types"

/**
 * CAD-R2-016 — aplicar sugestão preenche o formulário local (suggestion →
 * formulário). Nunca persiste: função pura, sem Prisma/StockLedger/write.
 */

function sugestaoFixture(): SugestaoTextoLivre {
  return {
    campos: {
      nome: { valor: "Película 3D iPhone 15", estado: "extraido" },
      marca: { valor: "Apple", estado: "inferido" },
      categoria: { valor: "Películas", estado: "inferido" },
      descricao: { valor: "Película de proteção 3D.", estado: "inferido" },
      preco: { valor: 25, estado: "extraido" },
      custo: { valor: 4, estado: "extraido" },
      estoque: { valor: 10, estado: "extraido" },
      fornecedor: { valor: "Center Cell", estado: "extraido" },
      sku: { valor: null, estado: "ausente" },
      ean: { valor: null, estado: "ausente" },
      garantia: { valor: null, estado: "ausente" },
      ncm: { valor: null, estado: "ausente" },
      cest: { valor: null, estado: "ausente" },
    },
    avisos: [],
    rejeitados: [],
    proveniencia: {
      source: "natural_text",
      backend: "openrouter",
      model: "openrouter/auto",
      interpretedAt: "2026-09-17T12:00:00.000Z",
      camposExtraidos: ["nome", "preco", "custo", "estoque", "fornecedor"],
      camposInferidos: ["marca", "categoria", "descricao"],
      degradadoLocal: false,
    },
  }
}

describe("aplicar sugestao ao formulario (sem persistir)", () => {
  it("13. formulario vazio: aplica tudo com valor", () => {
    const r = calcularAplicacaoTextoLivre(sugestaoFixture(), {})
    const campos = r.aplicacoes.map((a) => a.campo)
    expect(campos).toEqual(expect.arrayContaining(["nome", "marca", "categoria", "descricao", "preco", "custo", "estoque", "fornecedor"]))
    expect(campos).not.toContain("sku")
    expect(r.aplicacoes.find((a) => a.campo === "preco")?.valor).toBe("25")
    expect(r.aplicacoes.find((a) => a.campo === "estoque")?.valor).toBe("10")
  })

  it("nunca sobrescreve o operador: preenchido e preservado", () => {
    const r = calcularAplicacaoTextoLivre(sugestaoFixture(), { nome: "Meu nome", preco: "30" })
    expect(r.aplicacoes.find((a) => a.campo === "nome")).toBeUndefined()
    expect(r.aplicacoes.find((a) => a.campo === "preco")).toBeUndefined()
    expect(r.ignorados).toEqual(
      expect.arrayContaining([
        { campo: "nome", motivo: "ja-preenchido" },
        { campo: "preco", motivo: "ja-preenchido" },
      ]),
    )
  })

  it("modo edicao: estoque ignorado (saldo somente leitura)", () => {
    const r = calcularAplicacaoTextoLivre(sugestaoFixture(), {}, { modoEdicao: true })
    expect(r.aplicacoes.find((a) => a.campo === "estoque")).toBeUndefined()
    expect(r.ignorados).toContainEqual({ campo: "estoque", motivo: "estoque-somente-leitura" })
  })

  it("14. campos excluidos pelo operador nao aplicados; ausentes nunca aplicados", () => {
    const r = calcularAplicacaoTextoLivre(sugestaoFixture(), {}, { excluir: ["marca", "preco"] })
    expect(r.aplicacoes.find((a) => a.campo === "marca")).toBeUndefined()
    expect(r.aplicacoes.find((a) => a.campo === "preco")).toBeUndefined()
    expect(r.ignorados).toContainEqual({ campo: "marca", motivo: "excluido-pelo-operador" })
    expect(r.ignorados).not.toContainEqual(
      expect.objectContaining({ campo: "sku", motivo: "excluido-pelo-operador" }),
    )
    expect(r.ignorados).toContainEqual({ campo: "sku", motivo: "ausente" })
  })
})
