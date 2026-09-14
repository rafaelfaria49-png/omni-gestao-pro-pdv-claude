import { describe, expect, it } from "vitest"
import {
  aggregateRecebimentosSessao,
  canalRecebimentoLabel,
  classificarRecebimentoCaixa,
  recebimentosDeTotaisLegados,
} from "./recebimentos-sessao"

describe("classificarRecebimentoCaixa — origem e canal só pelo que foi gravado", () => {
  it("recebimento na O.S. (Operações V3) é O.S. recebida", () => {
    expect(
      classificarRecebimentoCaixa({
        tipo: "recebimento_cr",
        payload: { origem: "operacoes-v3-os", formaPagamento: "debito" },
      }),
    ).toEqual({ natureza: "recebimento", origem: "os", canal: "os", forma: "cartaoDebito" })
  })

  it("PDV F5 (sem origem, localId pdv-rc:) é conta recebida pelo PDV (F5)", () => {
    const c = classificarRecebimentoCaixa({
      tipo: "recebimento_cr",
      payload: { localId: "pdv-rc:loja-1:sessao-1:chave", formaPagamento: "cartao_credito" },
    })
    expect(c).toEqual({ natureza: "recebimento", origem: "contas", canal: "pdv_f5", forma: "cartaoCredito" })
    expect(canalRecebimentoLabel(c!.canal)).toBe("PDV (F5)")
  })

  it("lote do PDV e tela Financeiro são contas recebidas com canal próprio", () => {
    const lote = classificarRecebimentoCaixa({
      tipo: "recebimento_cr",
      payload: { origem: "pdv_lote", localId: "pdv-rc-lote:loja-1:sessao-1:k", formaPagamento: "pix" },
    })
    const fin = classificarRecebimentoCaixa({
      tipo: "recebimento_cr",
      payload: { origem: "financeiro", localId: "rc-caixa:loja-1:mov-1", formaPagamento: "cartão de débito" },
    })
    expect(lote).toMatchObject({ origem: "contas", canal: "pdv_lote", forma: "pix" })
    expect(fin).toMatchObject({ origem: "contas", canal: "financeiro", forma: "cartaoDebito" })
  })

  it("sem origem nem localId conhecido: conta recebida, canal não identificado (não inventa)", () => {
    const c = classificarRecebimentoCaixa({ tipo: "recebimento_cr", payload: { formaPagamento: "dinheiro" } })
    expect(c).toMatchObject({ origem: "contas", canal: "nao_identificado" })
    expect(canalRecebimentoLabel(c!.canal)).toBeNull()
  })

  it("estorno de O.S. sem forma: natureza estorno, forma nula", () => {
    expect(
      classificarRecebimentoCaixa({ tipo: "estorno_recebimento_cr", payload: { origem: "operacoes-v3-os" } }),
    ).toEqual({ natureza: "estorno", origem: "os", canal: "os", forma: null })
  })

  it("sangria, suprimento e devolução não são recebimentos", () => {
    for (const tipo of ["sangria", "suprimento", "devolucao"]) {
      expect(classificarRecebimentoCaixa({ tipo, payload: { origem: "pdv" } })).toBeNull()
    }
  })
})

describe("aggregateRecebimentosSessao", () => {
  it("separa contas × O.S. e soma cada recebimento na forma usada", () => {
    const r = aggregateRecebimentosSessao([
      { tipo: "recebimento_cr", valor: 100, payload: { localId: "pdv-rc:l:s:k1", formaPagamento: "dinheiro" } },
      { tipo: "recebimento_cr", valor: 50, payload: { origem: "pdv_lote", formaPagamento: "pix" } },
      { tipo: "recebimento_cr", valor: 30, payload: { origem: "financeiro", formaPagamento: "cartão de débito" } },
      { tipo: "recebimento_cr", valor: 80, payload: { origem: "operacoes-v3-os", formaPagamento: "dinheiro" } },
      { tipo: "recebimento_cr", valor: 20, payload: { origem: "operacoes-v3-os", formaPagamento: "credito" } },
      { tipo: "sangria", valor: 10, payload: { origem: "pdv" } },
    ])
    expect(r.contas).toEqual({ valor: 180, qtd: 3, dinheiro: 100 })
    expect(r.os).toEqual({ valor: 100, qtd: 2, dinheiro: 80 })
    expect(r.porForma).toMatchObject({ dinheiro: 180, pix: 50, cartaoDebito: 30, cartaoCredito: 20 })
    expect(r.formaNaoIdentificada).toBe(0)
    expect(r.origemSeparada).toBe(true)
  })

  it("estorno sem forma fica à parte — nenhuma forma e nenhum dinheiro são abatidos", () => {
    const r = aggregateRecebimentosSessao([
      { tipo: "recebimento_cr", valor: 100, payload: { origem: "operacoes-v3-os", formaPagamento: "dinheiro" } },
      { tipo: "estorno_recebimento_cr", valor: 40, payload: { origem: "operacoes-v3-os" } },
    ])
    expect(r.estornos).toEqual({ valor: 40, qtd: 1, dinheiro: 0, semForma: 40 })
    expect(r.porForma.dinheiro).toBe(100)
    expect(r.os.dinheiro).toBe(100)
  })

  it("estorno com forma abate a própria forma (e o dinheiro, quando é dinheiro)", () => {
    const r = aggregateRecebimentosSessao([
      { tipo: "recebimento_cr", valor: 100, payload: { formaPagamento: "dinheiro" } },
      { tipo: "estorno_recebimento_cr", valor: 40, payload: { formaPagamento: "dinheiro" } },
    ])
    expect(r.porForma.dinheiro).toBe(60)
    expect(r.estornos).toEqual({ valor: 40, qtd: 1, dinheiro: 40, semForma: 0 })
  })

  it("forma desconhecida vai para 'forma não identificada'", () => {
    const r = aggregateRecebimentosSessao([
      { tipo: "recebimento_cr", valor: 25, payload: { origem: "financeiro", formaPagamento: "transferencia" } },
    ])
    expect(r.contas.valor).toBe(25)
    expect(r.formaNaoIdentificada).toBe(25)
  })
})

describe("recebimentosDeTotaisLegados — snapshot antigo sem a separação", () => {
  it("tudo em contas, com a parte em dinheiro conhecida e o resto sem forma", () => {
    const r = recebimentosDeTotaisLegados({
      recebimentosContas: 150,
      recebimentosContasDinheiro: 100,
      qtdRecebimentosContas: 2,
    })
    expect(r.origemSeparada).toBe(false)
    expect(r.contas).toEqual({ valor: 150, qtd: 2, dinheiro: 100 })
    expect(r.formaNaoIdentificada).toBe(50)
  })

  it("dinheiro acima do total legado é o estorno sem forma que só abateu o total", () => {
    const r = recebimentosDeTotaisLegados({ recebimentosContas: 60, recebimentosContasDinheiro: 100 })
    expect(r.estornos.semForma).toBe(40)
    expect(r.formaNaoIdentificada).toBe(0)
  })
})
