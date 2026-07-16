import { describe, it, expect } from "vitest"
import { agregarVendas, type VendaRow } from "./vendas"

const pb = (o: Record<string, number>) => ({ paymentBreakdown: o })

describe("agregarVendas", () => {
  it("exclui vendas canceladas do total mas as reporta", () => {
    const rows: VendaRow[] = [
      { total: 100, status: "concluida", payload: pb({ dinheiro: 100 }) },
      { total: 40, status: "cancelada", payload: pb({ pix: 40 }) },
      { total: 60, status: null, payload: pb({ pix: 60 }) },
    ]
    const r = agregarVendas(rows)
    expect(r.quantidade.valor).toBe(2)
    expect(r.total.valor).toBe(160)
    expect(r.canceladasQuantidade.valor).toBe(1)
    expect(r.canceladasTotal.valor).toBe(40)
  })

  it("classifica formas de pagamento e reconcilia disponibilidade real", () => {
    const rows: VendaRow[] = [
      { total: 100, status: "concluida", payload: pb({ dinheiro: 100 }) },
      { total: 50, status: "concluida", payload: pb({ pix: 30, cartaoCredito: 20 }) },
    ]
    const r = agregarVendas(rows)
    expect(r.formaPagamentoDisponibilidade).toBe("real")
    expect(r.naoIdentificadoQuantidade.valor).toBe(0)
    const dinheiro = r.formasPagamento.find((f) => f.chave === "dinheiro")
    expect(dinheiro?.valor).toBe(100)
    const pix = r.formasPagamento.find((f) => f.chave === "pix")
    expect(pix?.valor).toBe(30)
  })

  it("payload inválido vira não identificado (parcial), sem derrubar o reader", () => {
    const rows: VendaRow[] = [
      { total: 100, status: "concluida", payload: pb({ dinheiro: 100 }) },
      { total: 80, status: "concluida", payload: null },
      { total: 20, status: "concluida", payload: { paymentBreakdown: "lixo" } },
    ]
    const r = agregarVendas(rows)
    expect(r.formaPagamentoDisponibilidade).toBe("parcial")
    expect(r.naoIdentificadoQuantidade.valor).toBe(2)
    expect(r.naoIdentificadoValor.valor).toBe(100)
  })

  it("nenhuma venda classificada → forma de pagamento indisponível", () => {
    const rows: VendaRow[] = [{ total: 10, status: "concluida", payload: null }]
    const r = agregarVendas(rows)
    expect(r.formaPagamentoDisponibilidade).toBe("indisponivel")
  })

  it("desconto: cobertura total = real, parcial = parcial, nenhuma = indisponível", () => {
    const todas = agregarVendas([
      { total: 100, status: "concluida", payload: { paymentBreakdown: { dinheiro: 100 }, discountTotal: 10 } },
      { total: 50, status: "concluida", payload: { paymentBreakdown: { pix: 50 }, discountTotal: 5 } },
    ])
    expect(todas.descontoTotal.disponibilidade).toBe("real")
    expect(todas.descontoTotal.valor).toBe(15)

    const parcial = agregarVendas([
      { total: 100, status: "concluida", payload: { paymentBreakdown: { dinheiro: 100 }, discountTotal: 10 } },
      { total: 50, status: "concluida", payload: { paymentBreakdown: { pix: 50 } } },
    ])
    expect(parcial.descontoTotal.disponibilidade).toBe("parcial")
    expect(parcial.descontoTotal.valor).toBe(10)

    const nenhuma = agregarVendas([{ total: 50, status: "concluida", payload: { paymentBreakdown: { pix: 50 } } }])
    expect(nenhuma.descontoTotal.disponibilidade).toBe("indisponivel")
    expect(nenhuma.descontoTotal.valor).toBeNull()
  })

  it("forma futura desconhecida vira residual não identificado e nunca mantém disponibilidade real", () => {
    const r = agregarVendas([
      { total: 100, status: "concluida", payload: pb({ dinheiro: 80, boleto: 20 }) },
      { total: 50, status: "concluida", payload: pb({ voucherParceiro: 50 }) },
    ])
    expect(r.formaPagamentoDisponibilidade).toBe("parcial")
    expect(r.formasPagamento.find((f) => f.chave === "dinheiro")?.valor).toBe(80)
    expect(r.naoIdentificadoQuantidade.valor).toBe(2)
    expect(r.naoIdentificadoValor.valor).toBe(70)
  })

  it("breakdown conhecido que não reconcilia com Venda.total expõe o residual", () => {
    const r = agregarVendas([{ total: 100, status: "concluida", payload: pb({ pix: 60 }) }])
    expect(r.formaPagamentoDisponibilidade).toBe("parcial")
    expect(r.naoIdentificadoQuantidade.valor).toBe(1)
    expect(r.naoIdentificadoValor.valor).toBe(40)
    expect(r.divergenciaPagamentoQuantidade.valor).toBe(1)
    expect(r.divergenciaPagamentoValor.valor).toBe(40)
  })

  it("quantifica breakdown conhecido acima de Venda.total", () => {
    const r = agregarVendas([{ total: 100, status: "concluida", payload: pb({ pix: 120 }) }])
    expect(r.formaPagamentoDisponibilidade).toBe("parcial")
    expect(r.naoIdentificadoQuantidade.valor).toBe(1)
    expect(r.divergenciaPagamentoQuantidade.valor).toBe(1)
    expect(r.divergenciaPagamentoValor.valor).toBe(20)
  })

  it("quantifica breakdown desconhecido acima de Venda.total sem inflar o faturamento", () => {
    const r = agregarVendas([{ total: 100, status: "concluida", payload: pb({ boleto: 120 }) }])
    expect(r.total.valor).toBe(100)
    expect(r.formaPagamentoDisponibilidade).toBe("parcial")
    expect(r.naoIdentificadoValor.valor).toBe(100)
    expect(r.divergenciaPagamentoValor.valor).toBe(20)
  })

  it("reconhece o formato histórico cartao como débito sem perder disponibilidade", () => {
    const r = agregarVendas([{ total: 75, status: "concluida", payload: pb({ cartao: 75 }) }])
    expect(r.formaPagamentoDisponibilidade).toBe("real")
    expect(r.formasPagamento.find((f) => f.chave === "cartaoDebito")?.valor).toBe(75)
    expect(r.naoIdentificadoQuantidade.valor).toBe(0)
  })
})
