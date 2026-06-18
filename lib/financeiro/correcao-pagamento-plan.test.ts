import { describe, it, expect } from "vitest"
import {
  computeCorrecaoPagamentoPlan,
  normalizeBreakdown,
  breakdownEquals,
  cashReal,
  sumBreakdown,
  valorAVistaVenda,
} from "./correcao-pagamento-plan"

const T = 100

describe("normalizeBreakdown", () => {
  it("preenche zeros e descarta negativos/ruído", () => {
    const n = normalizeBreakdown({ dinheiro: 50, pix: -5 } as never)
    expect(n).toEqual({
      dinheiro: 50,
      pix: 0,
      cartaoDebito: 0,
      cartaoCredito: 0,
      carne: 0,
      aPrazo: 0,
      creditoVale: 0,
    })
  })
  it("arredonda a 2 casas", () => {
    expect(normalizeBreakdown({ dinheiro: 33.333 }).dinheiro).toBe(33.33)
  })
})

describe("helpers", () => {
  it("cashReal exclui aPrazo e creditoVale", () => {
    expect(cashReal(normalizeBreakdown({ dinheiro: 40, aPrazo: 30, creditoVale: 30 }))).toBe(40)
  })
  it("sumBreakdown soma todas as formas", () => {
    expect(sumBreakdown(normalizeBreakdown({ dinheiro: 40, aPrazo: 30, creditoVale: 30 }))).toBe(100)
  })
  it("breakdownEquals tolera centavos", () => {
    expect(
      breakdownEquals(normalizeBreakdown({ dinheiro: 100 }), normalizeBreakdown({ dinheiro: 100.004 })),
    ).toBe(true)
  })
})

describe("valorAVistaVenda — REGRA OFICIAL ÚNICA (total − aPrazo − creditoVale)", () => {
  it("dinheiro puro: à vista = total", () => {
    expect(valorAVistaVenda(100, { dinheiro: 100 })).toBe(100)
  })
  it("vale puro: à vista = 0 (vale não é dinheiro novo)", () => {
    expect(valorAVistaVenda(100, { creditoVale: 100 })).toBe(0)
  })
  it("dinheiro + vale: à vista = só o dinheiro", () => {
    expect(valorAVistaVenda(100, { dinheiro: 60, creditoVale: 40 })).toBe(60)
  })
  it("múltiplo (dinheiro+pix+débito+crédito+carnê): à vista = soma das formas à vista", () => {
    expect(
      valorAVistaVenda(100, { dinheiro: 20, pix: 20, cartaoDebito: 20, cartaoCredito: 20, carne: 20 }),
    ).toBe(100)
  })
  it("entrada + à prazo: à vista exclui o saldo à prazo", () => {
    expect(valorAVistaVenda(100, { dinheiro: 40, aPrazo: 60 })).toBe(40)
  })
  it("à prazo + vale: à vista exclui ambos", () => {
    expect(valorAVistaVenda(100, { aPrazo: 50, creditoVale: 50 })).toBe(0)
  })
  it("breakdown ausente (replay legado): cai em total (sem regressão histórica)", () => {
    expect(valorAVistaVenda(100, undefined)).toBe(100)
    expect(valorAVistaVenda(100, null)).toBe(100)
  })
  it("equivale a cashReal quando o breakdown fecha o total", () => {
    const pb = normalizeBreakdown({ dinheiro: 30, pix: 10, aPrazo: 40, creditoVale: 20 })
    expect(valorAVistaVenda(100, pb)).toBe(cashReal(pb)) // ambos = 40
  })
})

describe("consistência venda↔correção (uma única regra)", () => {
  // O motor de venda grava `valorAVistaVenda(total, pb)`; a correção grava
  // `plan.cashTarget`. Para o MESMO breakdown-alvo os dois DEVEM coincidir —
  // é exatamente o que elimina a divergência da auditoria.
  const casos: Array<{ nome: string; pb: Record<string, number> }> = [
    { nome: "dinheiro", pb: { dinheiro: 100 } },
    { nome: "vale", pb: { creditoVale: 100 } },
    { nome: "dinheiro+vale", pb: { dinheiro: 60, creditoVale: 40 } },
    { nome: "múltiplo", pb: { dinheiro: 50, pix: 50 } },
    { nome: "à prazo", pb: { aPrazo: 100 } },
    { nome: "entrada+prazo+vale", pb: { dinheiro: 30, aPrazo: 40, creditoVale: 30 } },
  ]
  for (const c of casos) {
    it(`${c.nome}: entrada da venda == cashTarget da correção`, () => {
      const vendaEntrada = valorAVistaVenda(T, c.pb)
      // Correção para o mesmo alvo (partindo de dinheiro:100, à vista pura).
      const plan = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: c.pb })
      const correcaoEntrada = plan.cashTarget
      expect(correcaoEntrada).toBe(vendaEntrada)
    })
  }
})

describe("computeCorrecaoPagamentoPlan — transições do GOAL Parte 3", () => {
  it("Vista → À Prazo: zera caixa, cria título 100", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { aPrazo: 100 } })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(0)
    expect(p.reconcileTitulos).toBe(true)
    expect(p.cancelAllAPrazo).toBe(false)
    expect(p.criarTituloValor).toBe(100)
    expect(p.creditoTarget).toBe(0)
    expect(p.mudouNatureza).toBe(true)
  })

  it("À Prazo → Vista: caixa 100, cancela todos os títulos", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { aPrazo: 100 }, newBreakdown: { dinheiro: 100 } })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(100)
    expect(p.reconcileTitulos).toBe(true)
    expect(p.cancelAllAPrazo).toBe(true)
    expect(p.criarTituloValor).toBeNull()
    expect(p.mudouNatureza).toBe(true)
  })

  it("Vista → Vale: zera caixa, alvo de crédito 100, sem título", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { creditoVale: 100 } })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(0)
    expect(p.creditoTarget).toBe(100)
    expect(p.reconcileTitulos).toBe(false)
    expect(p.mudouNatureza).toBe(true)
  })

  it("Vale → Vista: caixa 100, alvo de crédito 0 (restaura)", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { creditoVale: 100 }, newBreakdown: { dinheiro: 100 } })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(100)
    expect(p.oldCreditoVale).toBe(100)
    expect(p.creditoTarget).toBe(0)
    expect(p.reconcileTitulos).toBe(false)
  })

  it("Pix → À Prazo: zera caixa, cria título 100", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { pix: 100 }, newBreakdown: { aPrazo: 100 } })
    expect(p.cashTarget).toBe(0)
    expect(p.criarTituloValor).toBe(100)
  })

  it("Múltiplo → À Prazo: zera caixa, cria título 100", () => {
    const p = computeCorrecaoPagamentoPlan({
      total: T,
      oldBreakdown: { dinheiro: 50, pix: 50 },
      newBreakdown: { aPrazo: 100 },
    })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(0)
    expect(p.criarTituloValor).toBe(100)
    expect(p.cancelAllAPrazo).toBe(false)
  })

  it("À Prazo → Múltiplo: caixa 100, cancela títulos", () => {
    const p = computeCorrecaoPagamentoPlan({
      total: T,
      oldBreakdown: { aPrazo: 100 },
      newBreakdown: { dinheiro: 50, pix: 50 },
    })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(100)
    expect(p.cancelAllAPrazo).toBe(true)
    expect(p.criarTituloValor).toBeNull()
  })

  it("Entrada + saldo à prazo (parcial): caixa 40, título 60", () => {
    const p = computeCorrecaoPagamentoPlan({
      total: T,
      oldBreakdown: { dinheiro: 100 },
      newBreakdown: { dinheiro: 40, aPrazo: 60 },
    })
    expect(p.cashTarget).toBe(40)
    expect(p.criarTituloValor).toBe(60)
    expect(p.reconcileTitulos).toBe(true)
  })

  it("Dinheiro → Pix (mesma natureza): caixa permanece 100, sem título nem crédito", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { pix: 100 } })
    expect(p.ok).toBe(true)
    expect(p.cashTarget).toBe(100)
    expect(p.reconcileTitulos).toBe(false)
    expect(p.mudouNatureza).toBe(false)
  })
})

describe("computeCorrecaoPagamentoPlan — guardas", () => {
  it("total_mismatch quando o novo breakdown não fecha com o total", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { dinheiro: 90 } })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("total_mismatch")
  })

  it("no_change quando o breakdown é idêntico (idempotência / repetir 2×)", () => {
    const p = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { dinheiro: 100 } })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("no_change")
  })

  it("reaplicar o MESMO alvo após corrigir = no_change (convergência)", () => {
    // 1ª correção: dinheiro → aPrazo
    const p1 = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { dinheiro: 100 }, newBreakdown: { aPrazo: 100 } })
    expect(p1.ok).toBe(true)
    // estado agora é aPrazo:100; repetir a mesma correção
    const p2 = computeCorrecaoPagamentoPlan({ total: T, oldBreakdown: { aPrazo: 100 }, newBreakdown: { aPrazo: 100 } })
    expect(p2.ok).toBe(false)
    expect(p2.errorCode).toBe("no_change")
  })
})
