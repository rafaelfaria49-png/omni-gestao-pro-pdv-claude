import { describe, it, expect } from "vitest"
import { montarDados, type FontesContador } from "./index"

const vazio: FontesContador = {
  vendas: [],
  devolucoes: [],
  movimentacoes: [],
  receber: [],
  pagar: [],
  sessoes: [],
  operacoes: [],
}

describe("montarDados", () => {
  it("líquido = vendas.total − devoluções.total (subtração única)", () => {
    const fontes: FontesContador = {
      ...vazio,
      vendas: [{ total: 300, status: "concluida", payload: { paymentBreakdown: { dinheiro: 300 } } }],
      devolucoes: [{ valorTotal: 50 }],
    }
    const dto = montarDados(fontes, { ano: 2026, mes: 6 })
    expect(dto.vendas.total.valor).toBe(300)
    expect(dto.devolucoes.total.valor).toBe(50)
    expect(dto.liquidoCompetencia.valor).toBe(250)
  })

  it("fiscal é sempre indisponível nesta fase", () => {
    const dto = montarDados(vazio, { ano: 2026, mes: 6 })
    expect(dto.fiscal.disponibilidade).toBe("indisponivel")
    expect(dto.fiscal.valor).toBeNull()
    expect(dto.alertas.some((a) => a.titulo.includes("fiscal"))).toBe(true)
  })

  it("gera alerta quando há vendas sem forma de pagamento identificada", () => {
    const fontes: FontesContador = {
      ...vazio,
      vendas: [{ total: 100, status: "concluida", payload: null }],
    }
    const dto = montarDados(fontes, { ano: 2026, mes: 6 })
    expect(dto.alertas.some((a) => a.nivel === "atencao")).toBe(true)
  })
})
