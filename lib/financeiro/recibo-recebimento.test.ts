import { describe, expect, it } from "vitest"
import { operacoesDoTitulo, pagamentosDoLedger, reconstruirReciboRecebimento, type TituloLedger } from "./recibo-recebimento"

const t = (o: Partial<TituloLedger> & { historico: unknown[] }): TituloLedger => ({
  id: o.id ?? "id-1",
  localKey: o.localKey ?? "lk-1",
  descricao: o.descricao ?? "Crediário",
  cliente: o.cliente ?? "Ana",
  valor: o.valor ?? 180,
  payload: { historico: o.historico },
})

describe("pagamentosDoLedger", () => {
  it("saldo depois de cada pagamento segue a ordem do ledger (parcial → parcial → quitação)", () => {
    const p = pagamentosDoLedger(
      { historico: [{ tipo: "pagamento", valor: 100, at: "a" }, { tipo: "cancelamento" }, { tipo: "pagamento", valor: 31.82, at: "b" }, { tipo: "liquidacao", valor: 48.18, at: "c" }] },
      180,
    )
    expect(p.map((x) => [x.index, x.saldoDepois])).toEqual([[0, 80], [2, 48.18], [3, 0]])
  })

  it("estorno_pagamento marca o pagamento referenciado e devolve o saldo", () => {
    const p = pagamentosDoLedger(
      { historico: [{ tipo: "pagamento", valor: 50 }, { tipo: "pagamento", valor: 30 }, { tipo: "estorno_pagamento", valor: 30, refHistoricoIndex: 1 }, { tipo: "pagamento", valor: 10 }] },
      100,
    )
    expect(p.map((x) => x.estornado)).toEqual([false, true, false])
    expect(p[2]!.saldoDepois).toBe(40)
  })

  it("estorno_titulo invalida todos os pagamentos anteriores a ele", () => {
    const p = pagamentosDoLedger({ historico: [{ tipo: "pagamento", valor: 50 }, { tipo: "estorno_titulo" }] }, 100)
    expect(p[0]!.estornado).toBe(true)
  })

  it("payload sem histórico não inventa pagamento", () => {
    expect(pagamentosDoLedger(null, 10)).toEqual([])
    expect(pagamentosDoLedger({ historico: "x" }, 10)).toEqual([])
  })
})

describe("reconstruirReciboRecebimento", () => {
  it("lote: junta as entradas da operação em N títulos num comprovante só", () => {
    const a = t({ id: "a", localKey: "A", descricao: "Venda 1", valor: 100, historico: [{ tipo: "liquidacao", valor: 100, loteId: "op1", formaPagamento: "pix", at: "2026-11-08T10:00:00.000Z" }] })
    const b = t({ id: "b", localKey: "B", descricao: "Venda 2", valor: 80, historico: [{ tipo: "pagamento", valor: 30, loteId: "op1", formaPagamento: "pix", at: "2026-11-08T10:00:00.010Z" }, { tipo: "pagamento", valor: 5, loteId: "op2" }] })
    const r = reconstruirReciboRecebimento([a, b], { loteId: "op1" })
    expect(r).toEqual({
      ok: true,
      recibo: {
        operacaoId: "op1",
        cliente: "Ana",
        recebidoEm: "2026-11-08T10:00:00.000Z",
        formaPagamento: "pix",
        itens: [
          { localKey: "A", descricao: "Venda 1", valorRecebido: 100, saldoRestante: 0 },
          { localKey: "B", descricao: "Venda 2", valorRecebido: 30, saldoRestante: 50 },
        ],
        totalRecebido: 130,
      },
    })
  })

  it("pagamento avulso antigo (sem loteId): usa o índice da entrada; forma ausente fica null (não inventa)", () => {
    const x = t({ historico: [{ tipo: "pagamento", valor: 20, at: "2026-01-01T00:00:00.000Z" }] })
    const r = reconstruirReciboRecebimento([x], { localKey: "lk-1", index: 0 })
    expect(r.ok && r.recibo).toMatchObject({ operacaoId: null, formaPagamento: null, totalRecebido: 20, itens: [{ saldoRestante: 160 }] })
  })

  it("recusa pagamento estornado e operação inexistente", () => {
    const x = t({ historico: [{ tipo: "pagamento", valor: 20, loteId: "op" }, { tipo: "estorno_pagamento", valor: 20, refHistoricoIndex: 0 }] })
    expect(reconstruirReciboRecebimento([x], { loteId: "op" })).toEqual({ ok: false, code: "pagamento_estornado" })
    expect(reconstruirReciboRecebimento([x], { loteId: "nao-existe" })).toEqual({ ok: false, code: "pagamento_nao_encontrado" })
    expect(reconstruirReciboRecebimento([x], { localKey: "outro", index: 0 })).toEqual({ ok: false, code: "pagamento_nao_encontrado" })
  })

  it("operação que atravessa dois clientes não vira comprovante", () => {
    const a = t({ id: "a", localKey: "A", cliente: "Ana", historico: [{ tipo: "pagamento", valor: 1, loteId: "op" }] })
    const b = t({ id: "b", localKey: "B", cliente: "Bia", historico: [{ tipo: "pagamento", valor: 1, loteId: "op" }] })
    expect(reconstruirReciboRecebimento([a, b], { loteId: "op" })).toEqual({ ok: false, code: "operacao_incompleta" })
  })

  it("operacoesDoTitulo lista mais recente primeiro", () => {
    const x = t({ historico: [{ tipo: "pagamento", valor: 1, at: "a" }, { tipo: "pagamento", valor: 2, at: "b" }] })
    expect(operacoesDoTitulo(x).map((o) => o.valor)).toEqual([2, 1])
  })
})

describe("revisão independente — fail-closed na 2ª via", () => {
  it("estorno sem referência (ou dois estornos no mesmo índice) bloqueia a 2ª via de TODOS os pagamentos", () => {
    const semRef = pagamentosDoLedger({ historico: [{ tipo: "pagamento", valor: 50 }, { tipo: "estorno_pagamento", valor: 50 }] }, 100)
    expect(semRef[0]!.estornado).toBe(true)
    const duplo = pagamentosDoLedger(
      { historico: [
        { tipo: "pagamento", valor: 30 },
        { tipo: "pagamento", valor: 20 },
        { tipo: "estorno_pagamento", valor: 20, refHistoricoIndex: 1 },
        { tipo: "estorno_pagamento", valor: 20, refHistoricoIndex: 1 },
      ] },
      100,
    )
    expect(duplo.map((x) => x.estornado)).toEqual([true, true])
  })

  it("mesma pessoa com grafias diferentes no mesmo lote não quebra a 2ª via", () => {
    const a = t({ id: "a", localKey: "A", cliente: "João Lima", historico: [{ tipo: "pagamento", valor: 1, loteId: "op" }] })
    const b = t({ id: "b", localKey: "B", cliente: "joao  lima", historico: [{ tipo: "pagamento", valor: 2, loteId: "op" }] })
    const r = reconstruirReciboRecebimento([a, b], { loteId: "op" })
    expect(r.ok && r.recibo.totalRecebido).toBe(3)
  })

  it("momentoDaOperacao devolve a hora gravada no ledger", async () => {
    const { momentoDaOperacao } = await import("./recibo-recebimento")
    expect(momentoDaOperacao({ historico: [{ tipo: "pagamento", valor: 1, loteId: "k", at: "2026-11-01T10:00:00.000Z" }] }, "k")).toBe("2026-11-01T10:00:00.000Z")
    expect(momentoDaOperacao({ historico: [] }, "k")).toBeNull()
  })
})
