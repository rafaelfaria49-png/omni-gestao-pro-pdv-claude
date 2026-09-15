import { describe, expect, it } from "vitest"
import {
  DENOMINACOES_CONTAGEM,
  chaveDraftContagem,
  contagemPreenchida,
  detalheContagem,
  lerDraftContagem,
  limparDraftContagem,
  quantidadeContagem,
  salvarDraftContagem,
  sanitizarQuantidade,
  totalContagemCentavos,
  type StorageContagem,
} from "./contagem-cedulas"

// ============================================================================
// GOAL CAIXA-FECHAMENTO-CALCULADORA-MODAL-PREMIUM-005 — aritmética da contagem por
// cédulas/moedas e rascunho escopado por loja + sessão de caixa.
// ============================================================================

function memoria(): StorageContagem & { dados: Map<string, string> } {
  const dados = new Map<string, string>()
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  }
}

const LOJA = "loja-1"
const SESSAO_A = "cmf-sessao-a"
const SESSAO_B = "cmf-sessao-b"

describe("contagem por cédulas e moedas — denominações e soma", () => {
  it("C. preserva as 13 denominações: 7 cédulas (R$ 200 → R$ 2) e 6 moedas (R$ 1 → R$ 0,01)", () => {
    const reais = (tipo: "cedula" | "moeda") =>
      DENOMINACOES_CONTAGEM.filter((d) => d.tipo === tipo).map((d) => d.centavos / 100)
    expect(reais("cedula")).toEqual([200, 100, 50, 20, 10, 5, 2])
    expect(reais("moeda")).toEqual([1, 0.5, 0.25, 0.1, 0.05, 0.01])
    expect(DENOMINACOES_CONTAGEM.filter((d) => d.discreta).map((d) => d.centavos)).toEqual([1])
  })

  it("D. soma quantidade × denominação em centavos, sem erro de ponto flutuante", () => {
    const q = { 20000: "2", 5000: "1", 25: "3", 10: "3", 1: "7" }
    expect(totalContagemCentavos(q)).toBe(40000 + 5000 + 75 + 30 + 7)
    expect(totalContagemCentavos(q) / 100).toBe(451.12)
    // 3 × R$ 0,10 em float daria 0.30000000000000004.
    expect(totalContagemCentavos({ 10: "3" }) / 100).toBe(0.3)
    expect(totalContagemCentavos({ 1: "1", 5: "1", 10: "1", 25: "1", 50: "1", 100: "1" })).toBe(191)
  })

  it("D. campo vazio, zero e texto não somam", () => {
    expect(totalContagemCentavos({})).toBe(0)
    expect(totalContagemCentavos({ 20000: "", 100: "0" })).toBe(0)
    expect(quantidadeContagem({ 500: "abc" }, 500)).toBe(0)
    expect(quantidadeContagem({ 500: "12" }, 500)).toBe(12)
  })

  it("sanitiza a digitação para inteiro ≥ 0", () => {
    expect(sanitizarQuantidade("")).toBe("")
    expect(sanitizarQuantidade("abc")).toBe("")
    expect(sanitizarQuantidade("-3")).toBe("3")
    expect(sanitizarQuantidade("2.5")).toBe("25")
    expect(sanitizarQuantidade("007")).toBe("7")
    expect(sanitizarQuantidade("0")).toBe("0")
  })

  it("E. detalhe aplicado: total em reais + todas as denominações com quantidade e subtotal", () => {
    const d = detalheContagem({ 20000: "2", 50: "3" })
    expect(d.total).toBe(401.5)
    expect(d.denominacoes).toHaveLength(13)
    expect(d.denominacoes[0]).toEqual({ valor: 200, quantidade: 2, subtotal: 400 })
    expect(d.denominacoes.find((x) => x.valor === 0.5)).toEqual({ valor: 0.5, quantidade: 3, subtotal: 1.5 })
    expect(d.denominacoes.find((x) => x.valor === 100)).toEqual({ valor: 100, quantidade: 0, subtotal: 0 })
  })

  it("contagem preenchida considera qualquer campo digitado, inclusive zero", () => {
    expect(contagemPreenchida({})).toBe(false)
    expect(contagemPreenchida({ 100: "" })).toBe(false)
    expect(contagemPreenchida({ 100: "0" })).toBe(true)
  })
})

describe("rascunho da contagem — escopo por loja + sessão de caixa", () => {
  it("L. chave inclui loja e sessão; nunca é global", () => {
    expect(chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A })).toBe(
      `omnigestao:caixa-count-draft:${LOJA}:${SESSAO_A}`,
    )
    expect(chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_B })).not.toBe(
      chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A }),
    )
    expect(chaveDraftContagem({ storeId: "loja-2", sessaoId: SESSAO_A })).not.toBe(
      chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A }),
    )
    expect(chaveDraftContagem({ storeId: null, sessaoId: SESSAO_A })).toBeNull()
    expect(chaveDraftContagem({ storeId: "  ", sessaoId: SESSAO_A })).toBeNull()
    expect(chaveDraftContagem({ storeId: LOJA, sessaoId: null })).toBeNull()
    expect(chaveDraftContagem({ storeId: LOJA, sessaoId: "", dataAbertura: new Date("invalid") })).toBeNull()
  })

  it("L. sessão legada sem sessaoId usa a abertura local do caixa como identidade", () => {
    const abertura = new Date("2026-09-14T11:00:00.000Z")
    const chave = chaveDraftContagem({ storeId: LOJA, sessaoId: null, dataAbertura: abertura })
    expect(chave).toBe(`omnigestao:caixa-count-draft:${LOJA}:abertura-${abertura.getTime()}`)
    // Caixa reaberto depois = outra identidade.
    expect(
      chaveDraftContagem({ storeId: LOJA, sessaoId: null, dataAbertura: new Date("2026-09-14T15:00:00.000Z") }),
    ).not.toBe(chave)
  })

  it("H. grava e restaura exatamente a contagem (fechar e reabrir a calculadora/fechamento)", () => {
    const s = memoria()
    const chave = chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A })
    salvarDraftContagem(s, chave, { 20000: "2", 1000: "", 25: "4", 1: "0" })
    expect(lerDraftContagem(s, chave)).toEqual({ 20000: "2", 25: "4", 1: "0" })
  })

  it("M. rascunho de uma sessão não aparece em outra sessão nem em outra loja", () => {
    const s = memoria()
    salvarDraftContagem(s, chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A }), { 10000: "5" })
    expect(lerDraftContagem(s, chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_B }))).toEqual({})
    expect(lerDraftContagem(s, chaveDraftContagem({ storeId: "loja-2", sessaoId: SESSAO_A }))).toEqual({})
    expect(lerDraftContagem(s, chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A }))).toEqual({ 10000: "5" })
  })

  it("K/N. limpar remove só o rascunho daquela sessão", () => {
    const s = memoria()
    const a = chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A })
    const b = chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_B })
    salvarDraftContagem(s, a, { 5000: "1" })
    salvarDraftContagem(s, b, { 200: "3" })
    limparDraftContagem(s, a)
    expect(s.dados.has(a!)).toBe(false)
    expect(lerDraftContagem(s, a)).toEqual({})
    expect(lerDraftContagem(s, b)).toEqual({ 200: "3" })
  })

  it("J/K. contagem toda vazia apaga o rascunho em vez de gravar lixo", () => {
    const s = memoria()
    const chave = chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A })
    salvarDraftContagem(s, chave, { 5000: "1" })
    salvarDraftContagem(s, chave, { 5000: "" })
    expect(s.dados.size).toBe(0)
  })

  it("rascunho corrompido, de outra versão ou com denominação estranha não contamina a contagem", () => {
    const s = memoria()
    const chave = chaveDraftContagem({ storeId: LOJA, sessaoId: SESSAO_A })!
    s.dados.set(chave, "{nao-e-json")
    expect(lerDraftContagem(s, chave)).toEqual({})
    s.dados.set(chave, JSON.stringify({ v: 99, quantidades: { 20000: "1" } }))
    expect(lerDraftContagem(s, chave)).toEqual({})
    s.dados.set(chave, JSON.stringify({ v: 1, quantidades: { 20000: "-2", 300: "9", 50: 4, 10: "x" } }))
    expect(lerDraftContagem(s, chave)).toEqual({ 20000: "2" })
  })

  it("sem storage ou sem sessão identificável não grava nada e não quebra", () => {
    const s = memoria()
    salvarDraftContagem(s, null, { 20000: "1" })
    expect(s.dados.size).toBe(0)
    expect(lerDraftContagem(null, "qualquer")).toEqual({})
    expect(() => salvarDraftContagem(null, "qualquer", { 20000: "1" })).not.toThrow()
    const quebrado: StorageContagem = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
      removeItem: () => {
        throw new Error("SecurityError")
      },
    }
    expect(lerDraftContagem(quebrado, "k")).toEqual({})
    expect(() => salvarDraftContagem(quebrado, "k", { 100: "1" })).not.toThrow()
    expect(() => limparDraftContagem(quebrado, "k")).not.toThrow()
  })
})
