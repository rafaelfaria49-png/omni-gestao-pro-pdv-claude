/**
 * OMNI-PDV-TROCAS-…-MERGE-READINESS-004 — histórico do caixa com snapshot de fechamento
 * incompleto (tela e impressão) e sessão antiga sem dinheiro esperado gravado.
 */
import { describe, expect, it } from "vitest"
import {
  dinheiroEsperadoGravado,
  htmlBlocosFechamento,
  montarBlocosFechamento,
  normalizarResumoFechamento,
} from "./fechamento-blocos"

describe("normalizarResumoFechamento", () => {
  it("snapshot sem porOrigem/porPagamento (ex.: fechamento via API só com reembolsos) → null", () => {
    expect(normalizarResumoFechamento({ reembolsosDinheiro: 10 })).toBeNull()
    expect(normalizarResumoFechamento({ porOrigem: [] })).toBeNull()
    expect(normalizarResumoFechamento({ porOrigem: "x", porPagamento: {} })).toBeNull()
    expect(normalizarResumoFechamento(null)).toBeNull()
    expect(normalizarResumoFechamento("texto")).toBeNull()
    expect(normalizarResumoFechamento([1, 2])).toBeNull()
  })

  it("itens de origem inválidos são descartados e blocos 003A parciais caem no recálculo legado", () => {
    const r = normalizarResumoFechamento({
      porOrigem: [null, 3, { key: "pdv", label: "PDV", valorBruto: 50, qtdItens: 1 }],
      porPagamento: { dinheiro: 50 },
      recebidoPorOrigem: { total: 50 },
      // recebidoPorForma/gavetaDinheiro ausentes → os três são ignorados
    })
    expect(r).not.toBeNull()
    expect(r!.porOrigem).toHaveLength(1)
    expect(r!.recebidoPorOrigem).toBeUndefined()
    const blocos = montarBlocosFechamento(r!, { operacoes: [] })
    expect(blocos.legado).toBe(true)
    const html = htmlBlocosFechamento(blocos)
    expect(html).toContain("GAVETA · DINHEIRO FÍSICO")
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it("snapshot mínimo (só porOrigem vazio e porPagamento vazio) monta tela e impressão sem NaN", () => {
    const r = normalizarResumoFechamento({ porOrigem: [], porPagamento: {} })!
    const html = htmlBlocosFechamento(montarBlocosFechamento(r, { operacoes: [] }))
    expect(html).not.toMatch(/NaN|undefined/)
  })
})

describe("dinheiroEsperadoGravado", () => {
  it("usa o valor gravado no payload; depois o do resumo", () => {
    expect(dinheiroEsperadoGravado({ saldoDinheiroEsperado: 120 }, null)).toBe(120)
    const r = normalizarResumoFechamento({ porOrigem: [], porPagamento: {}, saldoDinheiroEsperado: 80 })
    expect(dinheiroEsperadoGravado({}, r)).toBe(80)
  })

  it("sessão antiga sem o valor → null (nunca o saldoFinal de todas as formas)", () => {
    expect(dinheiroEsperadoGravado({ saldoFinal: 636.89 }, null)).toBeNull()
    expect(dinheiroEsperadoGravado({ saldoDinheiroEsperado: "636.89" }, null)).toBeNull()
    expect(dinheiroEsperadoGravado(null, null)).toBeNull()
  })
})
