/**
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 — política do menu ⋮ da Conferência.
 *
 * Trava o contrato do GOAL §26/§27: ação de consulta nunca pede autorização e só cai
 * quando a venda não existe no servidor; ação destrutiva só é oferecida quando pode
 * de fato ser executada; ação bloqueada mostra razão REAL (nunca "Em breve").
 */
import { describe, expect, it } from "vitest"
import {
  ACAO_BLOQUEADA_FISCAL,
  ACAO_BLOQUEADA_RECEBIVEL_QUITADO,
  ACAO_BLOQUEADA_JA_ESTORNADA,
  ACAO_BLOQUEADA_NAO_SINCRONIZADA,
  ACAO_BLOQUEADA_POS_VENDA,
  ACAO_BLOQUEADA_SESSAO_FECHADA,
  FISCAL_BLOQUEIA_ESTORNO,
  MOTIVO_MIN_CARACTERES,
  avaliarAcoesVenda,
  motivoEstornoValido,
} from "./conferencia-acoes"

const base = {
  status: "concluida",
  servidorConfirmada: true,
  sessaoAberta: true,
} as const

describe("avaliarAcoesVenda · consulta (§7: sem nova senha)", () => {
  it("venda normal libera detalhes, histórico, reimpressão e cópia", () => {
    const a = avaliarAcoesVenda({ ...base })
    expect(a.detalhes.habilitada).toBe(true)
    expect(a.historico.habilitada).toBe(true)
    expect(a.reimprimir.habilitada).toBe(true)
    expect(a.copiar.habilitada).toBe(true)
    expect(a.detalhes.motivo).toBeUndefined()
  })

  it("venda ESTORNADA continua consultável — auditoria não some com o estorno", () => {
    const a = avaliarAcoesVenda({ ...base, status: "cancelada" })
    expect(a.detalhes.habilitada).toBe(true)
    expect(a.historico.habilitada).toBe(true)
    expect(a.reimprimir.habilitada).toBe(true)
  })

  it("venda parcialmente devolvida segue consultável e estornável", () => {
    const a = avaliarAcoesVenda({ ...base, status: "parcialmente_devolvida" })
    expect(a.detalhes.habilitada).toBe(true)
    expect(a.estorno.habilitada).toBe(true)
  })

  it("venda só local bloqueia consulta com razão real, mas NUNCA a cópia do número", () => {
    const a = avaliarAcoesVenda({ ...base, servidorConfirmada: false })
    expect(a.detalhes).toEqual({ habilitada: false, motivo: ACAO_BLOQUEADA_NAO_SINCRONIZADA })
    expect(a.reimprimir.habilitada).toBe(false)
    expect(a.copiar).toEqual({ habilitada: true })
  })
})

describe("avaliarAcoesVenda · estorno (§26: razão real em cada bloqueio)", () => {
  it("venda concluída em sessão aberta pode ser estornada", () => {
    expect(avaliarAcoesVenda({ ...base }).estorno).toEqual({ habilitada: true })
  })

  it("já estornada → 'Venda já estornada'", () => {
    expect(avaliarAcoesVenda({ ...base, status: "cancelada" }).estorno).toEqual({
      habilitada: false,
      motivo: ACAO_BLOQUEADA_JA_ESTORNADA,
    })
  })

  it("sessão fechada → não injeta dinheiro em sessão histórica (§21)", () => {
    expect(avaliarAcoesVenda({ ...base, sessaoAberta: false }).estorno).toEqual({
      habilitada: false,
      motivo: ACAO_BLOQUEADA_SESSAO_FECHADA,
    })
  })

  it.each(FISCAL_BLOQUEIA_ESTORNO)("fiscalStatus %s → bloqueio fiscal (§20)", (fiscalStatus) => {
    expect(avaliarAcoesVenda({ ...base, fiscalStatus }).estorno).toEqual({
      habilitada: false,
      motivo: ACAO_BLOQUEADA_FISCAL,
    })
  })

  it.each(["NAO_FISCAL", "PENDENTE", "REJEITADA", "", null, undefined])(
    "fiscalStatus %s NÃO bloqueia — venda não fiscal estorna normalmente",
    (fiscalStatus) => {
      expect(avaliarAcoesVenda({ ...base, fiscalStatus }).estorno.habilitada).toBe(true)
    },
  )

  it("fiscalStatus é comparado sem depender de caixa/espaços do servidor", () => {
    expect(avaliarAcoesVenda({ ...base, fiscalStatus: " autorizada " }).estorno.motivo).toBe(
      ACAO_BLOQUEADA_FISCAL,
    )
  })

  it("precedência: não sincronizada vence 'já estornada' e o bloqueio fiscal", () => {
    const a = avaliarAcoesVenda({
      ...base,
      servidorConfirmada: false,
      status: "cancelada",
      fiscalStatus: "AUTORIZADA",
    })
    expect(a.estorno.motivo).toBe(ACAO_BLOQUEADA_NAO_SINCRONIZADA)
  })

  it("precedência: 'já estornada' vence sessão fechada — o estado da venda é mais informativo", () => {
    const a = avaliarAcoesVenda({ ...base, status: "cancelada", sessaoAberta: false })
    expect(a.estorno.motivo).toBe(ACAO_BLOQUEADA_JA_ESTORNADA)
  })
})

describe("avaliarAcoesVenda · recebível quitado (007A · BLOCKER-2)", () => {
  it("venda com conta a receber JÁ QUITADA não oferece estorno", () => {
    expect(avaliarAcoesVenda({ ...base, recebivelQuitado: true }).estorno).toEqual({
      habilitada: false,
      motivo: ACAO_BLOQUEADA_RECEBIVEL_QUITADO,
    })
  })

  it("a razão manda regularizar no Financeiro — não promete fluxo inexistente", () => {
    expect(ACAO_BLOQUEADA_RECEBIVEL_QUITADO).toMatch(/Financeiro/)
    expect(ACAO_BLOQUEADA_RECEBIVEL_QUITADO).not.toMatch(/em breve/i)
  })

  it("sem recebível quitado (ausente ou false) o estorno segue disponível", () => {
    expect(avaliarAcoesVenda({ ...base }).estorno.habilitada).toBe(true)
    expect(avaliarAcoesVenda({ ...base, recebivelQuitado: false }).estorno.habilitada).toBe(true)
  })

  it("consulta continua liberada numa venda com recebível quitado", () => {
    const a = avaliarAcoesVenda({ ...base, recebivelQuitado: true })
    expect(a.detalhes.habilitada).toBe(true)
    expect(a.historico.habilitada).toBe(true)
    expect(a.reimprimir.habilitada).toBe(true)
  })

  it("precedência: 'já estornada' e bloqueio fiscal vêm antes do recebível", () => {
    expect(avaliarAcoesVenda({ ...base, status: "cancelada", recebivelQuitado: true }).estorno.motivo)
      .toBe(ACAO_BLOQUEADA_JA_ESTORNADA)
    expect(avaliarAcoesVenda({ ...base, fiscalStatus: "AUTORIZADA", recebivelQuitado: true }).estorno.motivo)
      .toBe(ACAO_BLOQUEADA_FISCAL)
  })

  it("recebível quitado vence sessão fechada — é o motivo mais acionável", () => {
    expect(avaliarAcoesVenda({ ...base, recebivelQuitado: true, sessaoAberta: false }).estorno.motivo)
      .toBe(ACAO_BLOQUEADA_RECEBIVEL_QUITADO)
  })
})

describe("avaliarAcoesVenda · pós-venda bloqueado por reconciliação de gaveta (§11/§35)", () => {
  it("troca e devolução ficam SEMPRE desabilitadas nesta tela, com razão estrutural", () => {
    for (const input of [
      { ...base },
      { ...base, status: "parcialmente_devolvida" },
      { ...base, sessaoAberta: false },
      { ...base, servidorConfirmada: false },
    ]) {
      const a = avaliarAcoesVenda(input)
      expect(a.troca).toEqual({ habilitada: false, motivo: ACAO_BLOQUEADA_POS_VENDA })
      expect(a.devolucao).toEqual({ habilitada: false, motivo: ACAO_BLOQUEADA_POS_VENDA })
    }
  })

  it("a razão não é promessa de futuro: nada de 'Em breve'", () => {
    for (const texto of [
      ACAO_BLOQUEADA_POS_VENDA,
      ACAO_BLOQUEADA_JA_ESTORNADA,
      ACAO_BLOQUEADA_SESSAO_FECHADA,
      ACAO_BLOQUEADA_NAO_SINCRONIZADA,
      ACAO_BLOQUEADA_FISCAL,
    ]) {
      expect(texto).not.toMatch(/em breve/i)
      expect(texto.trim().length).toBeGreaterThan(10)
    }
  })

  it("aponta o caminho REAL que continua funcionando (PDV)", () => {
    expect(ACAO_BLOQUEADA_POS_VENDA).toMatch(/PDV/)
  })
})

describe("motivoEstornoValido (§8)", () => {
  it("recusa vazio, espaço e motivo curto demais", () => {
    expect(motivoEstornoValido("")).toBe(false)
    expect(motivoEstornoValido("    ")).toBe(false)
    expect(motivoEstornoValido("x")).toBe(false)
    expect(motivoEstornoValido("a".repeat(MOTIVO_MIN_CARACTERES - 1))).toBe(false)
  })

  it("aceita a partir do mínimo, ignorando espaços nas bordas", () => {
    expect(motivoEstornoValido("a".repeat(MOTIVO_MIN_CARACTERES))).toBe(true)
    expect(motivoEstornoValido("  erro de digitação  ")).toBe(true)
  })
})
