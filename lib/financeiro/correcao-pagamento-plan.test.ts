import { describe, it, expect } from "vitest"
import {
  computeCorrecaoPagamentoPlan,
  normalizeBreakdown,
  breakdownEquals,
  cashReal,
  sumBreakdown,
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
