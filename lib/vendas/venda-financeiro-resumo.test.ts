import { describe, it, expect } from "vitest"
import { computeVendaStatusFinanceiro, sumPagamentosHistorico } from "./venda-financeiro-resumo"

describe("sumPagamentosHistorico", () => {
  it("soma pagamentos/liquidações e desconta estornos", () => {
    const payload = {
      historico: [
        { tipo: "pagamento", valor: 30 },
        { tipo: "liquidacao", valor: 20 },
        { tipo: "estorno_pagamento", valor: 10 },
        { tipo: "cancelamento" },
      ],
    }
    expect(sumPagamentosHistorico(payload)).toBe(40)
  })
  it("retorna 0 para payload sem historico", () => {
    expect(sumPagamentosHistorico({})).toBe(0)
    expect(sumPagamentosHistorico(null)).toBe(0)
  })
})

describe("computeVendaStatusFinanceiro", () => {
  it("venda à vista simples (Dinheiro 100)", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 100 },
      movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 100 }],
      titulos: [],
    })
    expect(r.recebidoAVista).toBe(100)
    expect(r.entradaLiquida).toBe(100)
    expect(r.aPrazoTotal).toBe(0)
    expect(r.temAPrazo).toBe(false)
    expect(r.conciliado).toBe(true)
  })

  it("venda à prazo com título aberto", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { aPrazo: 100 },
      movimentacoes: [],
      titulos: [{ status: "pendente", valor: 100 }],
    })
    expect(r.recebidoAVista).toBe(0)
    expect(r.aPrazoTotal).toBe(100)
    expect(r.aPrazoAberto).toBe(100)
    expect(r.aPrazoPago).toBe(0)
    expect(r.temAPrazo).toBe(true)
    expect(r.conciliado).toBe(true)
  })

  it("venda à prazo parcialmente paga", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { aPrazo: 100 },
      titulos: [{ status: "parcial", valor: 100, payload: { historico: [{ tipo: "pagamento", valor: 40 }] } }],
    })
    expect(r.aPrazoTotal).toBe(100)
    expect(r.aPrazoPago).toBe(40)
    expect(r.aPrazoAberto).toBe(60)
  })

  it("entrada + saldo à prazo (misto)", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 40, aPrazo: 60 },
      movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 40 }],
      titulos: [{ status: "pendente", valor: 60 }],
    })
    expect(r.entradaLiquida).toBe(40)
    expect(r.aPrazoTotal).toBe(60)
    expect(r.conciliado).toBe(true)
  })

  it("venda cancelada (entrada estornada)", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 100 },
      movimentacoes: [
        { tipo: "entrada", origem: "venda", valor: 100 },
        { tipo: "saida", origem: "cancelamento_pdv", valor: 100 },
      ],
      titulos: [],
    })
    expect(r.recebidoAVista).toBe(100)
    expect(r.estornado).toBe(100)
    expect(r.entradaLiquida).toBe(0)
    expect(r.temEstorno).toBe(true)
  })

  it("vale/crédito não conta como entrada à vista", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { creditoVale: 100 },
      movimentacoes: [],
      titulos: [],
    })
    expect(r.creditoValeUsado).toBe(100)
    expect(r.recebidoAVista).toBe(0)
    expect(r.conciliado).toBe(true)
  })

  it("dinheiro + vale: entrada à vista = só dinheiro (regra alinhada) → concilia", () => {
    // GOAL_FATURAMENTO_VALE_ALINHAMENTO: o motor grava MovFin = valorAVista = 60.
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 60, creditoVale: 40 },
      movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 60 }],
      titulos: [],
    })
    expect(r.recebidoAVista).toBe(60)
    expect(r.creditoValeUsado).toBe(40)
    expect(r.conciliado).toBe(true) // 60 + 0 (aPrazo) + 40 (vale) = 100
  })

  it("regressão travada: entrada incluindo o vale (bug antigo) NÃO concilia", () => {
    // Antes do GOAL o motor gravava MovFin = total − aPrazo = 100 (incluía o vale),
    // o que fazia o Workspace exibir "não conciliado" para toda venda com vale.
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 60, creditoVale: 40 },
      movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 100 }],
      titulos: [],
    })
    expect(r.conciliado).toBe(false) // 100 + 40 = 140 ≠ 100 — sintoma eliminado pelo fix
  })

  it("conta títulos cancelados separadamente", () => {
    const r = computeVendaStatusFinanceiro({
      total: 100,
      paymentBreakdown: { dinheiro: 100 },
      movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 100 }],
      titulos: [{ status: "cancelado", valor: 100 }],
    })
    expect(r.titulosCancelados).toBe(1)
    expect(r.aPrazoTotal).toBe(0)
  })
})
