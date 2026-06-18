import { describe, expect, it } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { computeFechamentoResumo, receitaTotalDoDia } from "./caixa-fechamento-resumo"

/** Venda mínima para o agregador (apenas os campos que o helper lê). */
function venda(opts: {
  total: number
  dinheiro?: number
  pix?: number
  lineTotal?: number
  inventoryId?: string
  status?: string
}): SaleRecord {
  const lineTotal = opts.lineTotal ?? opts.total
  return {
    id: "v" + Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    total: opts.total,
    status: opts.status ?? "concluida",
    lines: [{ inventoryId: opts.inventoryId ?? "prod-1", lineTotal }],
    paymentBreakdown: {
      dinheiro: opts.dinheiro ?? 0,
      pix: opts.pix ?? 0,
      cartaoDebito: 0,
      cartaoCredito: 0,
      carne: 0,
      aPrazo: 0,
      creditoVale: 0,
    },
  } as unknown as SaleRecord
}

const base = {
  sangrias: 0,
  suprimentos: 0,
  saldoInicial: 0,
  recebimentosContas: 0,
  recebimentosContasDinheiro: 0,
  qtdRecebimentosContas: 0,
}

describe("receita total do dia — fechamento de caixa", () => {
  it("soma vendas líquidas + serviços recebidos (exemplo do GOAL: 239,97 + 30 = 269,97)", () => {
    const resumo = computeFechamentoResumo({
      ...base,
      sales: [venda({ total: 239.97, dinheiro: 239.97 })],
      recebimentosContas: 30,
      recebimentosContasDinheiro: 30,
      qtdRecebimentosContas: 1,
    })
    expect(resumo.totalLiquido).toBe(239.97)
    expect(resumo.recebimentosContas).toBe(30)
    expect(resumo.outrosRecebimentos).toBe(0)
    expect(resumo.receitaTotalDia).toBe(269.97)
  })

  it("abertura, suprimento e sangria NÃO entram na receita", () => {
    const resumo = computeFechamentoResumo({
      ...base,
      sales: [venda({ total: 100, dinheiro: 100 })],
      saldoInicial: 500, // abertura — não é receita
      suprimentos: 200, // reforço de gaveta — não é receita
      sangrias: 50, // reduz gaveta, não receita
    })
    expect(resumo.receitaTotalDia).toBe(100)
    // a gaveta continua somando abertura/suprimento e descontando sangria:
    expect(resumo.saldoDinheiroEsperado).toBe(750) // 500 + 100 + 200 - 50
  })

  it("desconto reduz a venda líquida e, portanto, a receita", () => {
    const resumo = computeFechamentoResumo({
      ...base,
      sales: [venda({ total: 90, dinheiro: 90, lineTotal: 100 })], // bruto 100, líquido 90
    })
    expect(resumo.descontos).toBe(10)
    expect(resumo.receitaTotalDia).toBe(90)
  })

  it("venda cancelada não entra na receita", () => {
    const resumo = computeFechamentoResumo({
      ...base,
      sales: [venda({ total: 100, dinheiro: 100 }), venda({ total: 500, dinheiro: 500, status: "cancelada" })],
    })
    expect(resumo.receitaTotalDia).toBe(100)
  })

  it("receitaTotalDoDia recalcula com segurança (resumo antigo sem outrosRecebimentos)", () => {
    expect(receitaTotalDoDia({ totalLiquido: 100, recebimentosContas: 20 })).toBe(120)
    expect(receitaTotalDoDia({ totalLiquido: 239.97, recebimentosContas: 30 })).toBe(269.97)
    expect(receitaTotalDoDia({ totalLiquido: 80, recebimentosContas: 0 })).toBe(80)
  })
})

describe("creditoVale no fechamento — REGRA OFICIAL ÚNICA (GOAL_FATURAMENTO_VALE_ALINHAMENTO)", () => {
  /** Venda com vale: 60 em dinheiro + 40 em vale/crédito. */
  function vendaComVale(): SaleRecord {
    return {
      id: "v-vale",
      at: new Date().toISOString(),
      total: 100,
      status: "concluida",
      lines: [{ inventoryId: "prod-1", lineTotal: 100 }],
      paymentBreakdown: {
        dinheiro: 60,
        pix: 0,
        cartaoDebito: 0,
        cartaoCredito: 0,
        carne: 0,
        aPrazo: 0,
        creditoVale: 40,
      },
    } as unknown as SaleRecord
  }

  it("recebido à vista EXCLUI o vale (alinhado ao MovimentacaoFinanceira)", () => {
    const r = computeFechamentoResumo({ ...base, sales: [vendaComVale()] })
    expect(r.totalRecebido).toBe(60) // 100 − 0 (aPrazo) − 40 (vale)
    expect(r.porPagamento.creditoVale).toBe(40) // vale segue rastreado à parte
  })

  it("dinheiro físico da gaveta ignora o vale (só dinheiro)", () => {
    const r = computeFechamentoResumo({ ...base, sales: [vendaComVale()], saldoInicial: 0 })
    expect(r.saldoDinheiroEsperado).toBe(60) // só o dinheiro entra na gaveta
  })

  it("faturamento (receita do dia) CONTINUA incluindo o vale — é receita", () => {
    const r = computeFechamentoResumo({ ...base, sales: [vendaComVale()] })
    expect(r.totalLiquido).toBe(100)
    expect(r.receitaTotalDia).toBe(100)
  })
})
