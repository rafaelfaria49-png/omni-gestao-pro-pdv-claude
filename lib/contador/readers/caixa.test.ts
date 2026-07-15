import { describe, it, expect } from "vitest"
import { agregarCaixa, type SessaoRow, type CaixaOperacaoRow } from "./caixa"

describe("agregarCaixa", () => {
  it("conta sessões, abertas, sangrias e suprimentos", () => {
    const sessoes: SessaoRow[] = [
      { status: "ABERTA", saldoFinal: null, saldoContado: null },
      { status: "FECHADA", saldoFinal: 500, saldoContado: 495 },
    ]
    const operacoes: CaixaOperacaoRow[] = [
      { tipo: "sangria", valor: 100 },
      { tipo: "sangria", valor: 50 },
      { tipo: "suprimento", valor: 200 },
    ]
    const r = agregarCaixa({ sessoes, operacoes })
    expect(r.sessoes.valor).toBe(2)
    expect(r.sessoesAbertas.valor).toBe(1)
    expect(r.sangriasTotal.valor).toBe(150)
    expect(r.sangriasQuantidade.valor).toBe(2)
    expect(r.suprimentosTotal.valor).toBe(200)
  })

  it("diferença: real quando todas as fechadas têm conferência", () => {
    const r = agregarCaixa({
      sessoes: [{ status: "FECHADA", saldoFinal: 500, saldoContado: 490 }],
      operacoes: [],
    })
    expect(r.diferencas.disponibilidade).toBe("real")
    expect(r.diferencas.valor).toBe(-10)
  })

  it("diferença: parcial quando só parte das fechadas foi conferida", () => {
    const r = agregarCaixa({
      sessoes: [
        { status: "FECHADA", saldoFinal: 500, saldoContado: 495 },
        { status: "FECHADA", saldoFinal: 300, saldoContado: null },
      ],
      operacoes: [],
    })
    expect(r.diferencas.disponibilidade).toBe("parcial")
    expect(r.diferencas.valor).toBe(-5)
  })

  it("diferença: indisponível sem sessão fechada (nunca vira 0 silencioso)", () => {
    const r = agregarCaixa({ sessoes: [{ status: "ABERTA", saldoFinal: null, saldoContado: null }], operacoes: [] })
    expect(r.diferencas.disponibilidade).toBe("indisponivel")
    expect(r.diferencas.valor).toBeNull()
  })
})
