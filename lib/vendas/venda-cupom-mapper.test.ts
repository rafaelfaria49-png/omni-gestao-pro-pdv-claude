/**
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 §4 — mapeamento único do comprovante.
 *
 * A reimpressão da Conferência e a do Histórico de Vendas passam por ESTA função. Os
 * casos abaixo travam a aritmética que antes vivia inline em `vendas-arquivo-geral`:
 * subtotal reconstituído, imposto residual e troco só quando houve dinheiro.
 */
import { describe, expect, it } from "vitest"
import type { VendaDetalhe } from "./venda-detalhe-contract"
import { mapVendaDetalheToCupom } from "./venda-cupom-mapper"

const loja = { nome: "Rafacell", cnpj: "00.000.000/0001-00", endereco: "Rua A, 1" }

function venda(over: Partial<VendaDetalhe> = {}): VendaDetalhe {
  return {
    id: "VDA-L01-2026-000407",
    dbId: "ck1",
    at: "2026-03-10T12:00:00.000Z",
    clienteNome: null,
    clienteId: null,
    clienteCpf: null,
    total: 100,
    desconto: 0,
    cashTendered: null,
    status: "concluida",
    operador: "Ana",
    canceladaEm: null,
    canceladaPor: null,
    motivoCancelamento: null,
    sessaoId: "sess-1",
    observacao: null,
    correcoes: [],
    pagamentos: [{ label: "Dinheiro", valor: 100 }],
    itens: [{ id: "i1", nome: "Capa", quantidade: 1, precoUnitario: 100, lineTotal: 100 }],
    devolucoes: [],
    ...over,
  }
}

describe("mapVendaDetalheToCupom · identidade e loja", () => {
  it("imprime o NÚMERO comercial (não o id técnico) e os dados da loja", () => {
    const c = mapVendaDetalheToCupom(venda(), loja)
    expect(c.numeroPedido).toBe("VDA-L01-2026-000407")
    expect(c.lojaNome).toBe("Rafacell")
    expect(c.lojaCnpj).toBe("00.000.000/0001-00")
  })

  it("reflete a venda ORIGINAL: itens e pagamentos passam sem reconstrução", () => {
    const v = venda()
    const c = mapVendaDetalheToCupom(v, loja)
    expect(c.itens).toBe(v.itens)
    expect(c.pagamentos).toBe(v.pagamentos)
    expect(c.total).toBe(100)
    expect(c.operador).toBe("Ana")
    expect(c.sessaoId).toBe("sess-1")
  })
})

describe("mapVendaDetalheToCupom · subtotal, desconto e imposto", () => {
  it("sem desconto: subtotal = soma das linhas e imposto zero", () => {
    const c = mapVendaDetalheToCupom(venda(), loja)
    expect(c.subtotal).toBe(100)
    expect(c.desconto).toBe(0)
    expect(c.taxes).toBe(0)
  })

  it("com desconto: subtotal volta ao bruto e o imposto continua zero", () => {
    const c = mapVendaDetalheToCupom(
      venda({
        desconto: 10,
        total: 90,
        itens: [{ id: "i1", nome: "Capa", quantidade: 1, precoUnitario: 100, lineTotal: 100 }],
      }),
      loja,
    )
    expect(c.subtotal).toBe(110)
    expect(c.taxes).toBe(0)
  })

  it("total acima das linhas vira imposto estimado (nunca negativo)", () => {
    expect(mapVendaDetalheToCupom(venda({ total: 105 }), loja).taxes).toBe(5)
    expect(mapVendaDetalheToCupom(venda({ total: 90 }), loja).taxes).toBe(0)
  })

  it("desconto negativo no payload é tratado como zero", () => {
    expect(mapVendaDetalheToCupom(venda({ desconto: -5 }), loja).desconto).toBe(0)
  })

  it("venda sem itens (legada) não quebra o comprovante", () => {
    const c = mapVendaDetalheToCupom(venda({ itens: [] }), loja)
    expect(c.subtotal).toBe(0)
    expect(c.taxes).toBe(100)
  })
})

describe("mapVendaDetalheToCupom · troco (§28: venda antiga com campo faltando)", () => {
  it("dinheiro + cashTendered gravado → troco calculado e arredondado", () => {
    const c = mapVendaDetalheToCupom(venda({ cashTendered: 150 }), loja)
    expect(c.cashTendered).toBe(150)
    expect(c.troco).toBe(50)
  })

  it("sem cashTendered → troco AUSENTE (não imprime R$ 0,00 inventado)", () => {
    const c = mapVendaDetalheToCupom(venda(), loja)
    expect(c.troco).toBeUndefined()
    expect(c.cashTendered).toBeUndefined()
  })

  it("pagamento sem dinheiro (Pix) → sem troco, mesmo com cashTendered", () => {
    const c = mapVendaDetalheToCupom(
      venda({ pagamentos: [{ label: "Pix", valor: 100 }], cashTendered: 150 }),
      loja,
    )
    expect(c.troco).toBeUndefined()
  })

  it("pagamento múltiplo soma só a parcela em dinheiro para o troco", () => {
    const c = mapVendaDetalheToCupom(
      venda({
        pagamentos: [{ label: "Dinheiro", valor: 60 }, { label: "Pix", valor: 40 }],
        cashTendered: 100,
      }),
      loja,
    )
    expect(c.troco).toBe(40)
  })

  it("cashTendered menor que o dinheiro não gera troco negativo", () => {
    expect(mapVendaDetalheToCupom(venda({ cashTendered: 80 }), loja).troco).toBe(0)
  })

  it("troco fracionado não acumula erro de ponto flutuante", () => {
    const c = mapVendaDetalheToCupom(
      venda({ pagamentos: [{ label: "Dinheiro", valor: 0.1 }], cashTendered: 0.3 }),
      loja,
    )
    expect(c.troco).toBe(0.2)
  })
})

describe("mapVendaDetalheToCupom · venda estornada", () => {
  it("o status acompanha o cupom para a segunda via sair marcada", () => {
    expect(mapVendaDetalheToCupom(venda({ status: "cancelada" }), loja).status).toBe("cancelada")
  })
})
