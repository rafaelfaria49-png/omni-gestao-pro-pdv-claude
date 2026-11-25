import { describe, expect, it } from "vitest"
import { resumoDevolucoesCaixa } from "./troca-caixa"
import { recebimentoDaVenda } from "./troca-recebimento"
import { computeFechamentoResumo } from "@/lib/caixa-fechamento-resumo"

const nova = (reembolso: { valor: number; forma: string } | null, tipo = "devolucao") => ({
  id: Math.random().toString(36),
  tipo,
  valorTotal: reembolso?.valor ?? 50,
  payload: { schema: "pdv-troca-v1", resultado: { reembolso } },
})

describe("resumoDevolucoesCaixa", () => {
  it("só dinheiro desconta a gaveta; Pix separado; estorno de cartão, vale e estoque não descontam", () => {
    const r = resumoDevolucoesCaixa([
      nova({ valor: 15, forma: "dinheiro" }),
      nova({ valor: 14.99, forma: "dinheiro" }, "troca"), // sobra de troca devolvida em dinheiro
      nova({ valor: 20, forma: "pix" }),
      nova({ valor: 30, forma: "estorno_cartao" }),
      nova(null, "vale_credito"),
      nova(null, "somente_estoque"),
      nova(null, "troca"), // troca sem sobra: crédito consumido na nova venda
    ])
    expect(r).toEqual({ qtd: 7, reembolsosDinheiro: 29.99, reembolsosPix: 20, estornosCartaoPendentes: 30, legadoSemForma: 0 })
  })

  it("reembolso legado sem forma não é presumido dinheiro: vai para conferência", () => {
    const r = resumoDevolucoesCaixa([{ id: "x", tipo: "devolucao", valorTotal: 40, payload: { saleId: "VDA-1" } }, { id: "y", tipo: "vale_credito", valorTotal: 10, payload: null }])
    expect(r).toMatchObject({ reembolsosDinheiro: 0, legadoSemForma: 40 })
  })
})

describe("computeFechamentoResumo com reembolsos", () => {
  const base = { sales: [], sangrias: 5, suprimentos: 0, saldoInicial: 100 }
  it("desconta reembolso em dinheiro da gaveta e do movimentado; Pix só do movimentado", () => {
    const sem = computeFechamentoResumo(base)
    const com = computeFechamentoResumo({ ...base, reembolsosDinheiro: 15, reembolsosPix: 20 })
    expect(com.saldoDinheiroEsperado).toBe(sem.saldoDinheiroEsperado - 15)
    expect(com.saldoMovimentadoEsperado).toBe(sem.saldoMovimentadoEsperado - 35)
    expect(com.gavetaDinheiro.reembolsosDinheiro).toBe(15)
    expect(com.gavetaDinheiro.esperado).toBe(com.saldoDinheiroEsperado)
    expect(com).toMatchObject({ reembolsosDinheiro: 15, reembolsosPix: 20 })
  })
  it("sem reembolso o resumo não muda de forma (snapshots antigos preservados)", () => {
    const r = computeFechamentoResumo(base)
    expect("reembolsosDinheiro" in r).toBe(false)
    expect("reembolsosDinheiro" in r.gavetaDinheiro).toBe(false)
  })
})

describe("recebimentoDaVenda", () => {
  it("à vista: tudo recebido", () => {
    expect(recebimentoDaVenda(119.9, { cartaoCredito: 119.9 }, [])).toMatchObject({ recebido: 119.9, saldoAberto: 0 })
  })
  it("a prazo em aberto, parcial e quitado; carnê nunca presumido pago; estornado não conta", () => {
    expect(recebimentoDaVenda(100, { aPrazo: 100 }, [{ status: "pendente", valor: 100, pago: 0 }])).toMatchObject({ recebido: 0, saldoAberto: 100 })
    expect(recebimentoDaVenda(100, { aPrazo: 100 }, [{ status: "parcial", valor: 100, pago: 40 }])).toMatchObject({ recebido: 40, saldoAberto: 60 })
    expect(recebimentoDaVenda(100, { aPrazo: 100 }, [{ status: "pago", valor: 100, pago: 0 }])).toMatchObject({ recebido: 100, saldoAberto: 0 })
    expect(recebimentoDaVenda(100, { dinheiro: 70, carne: 30 }, [])).toMatchObject({ recebido: 70, saldoAberto: 30 })
    expect(recebimentoDaVenda(100, { dinheiro: 50, aPrazo: 50 }, [{ status: "estornado", valor: 50, pago: 50 }])).toMatchObject({ recebido: 50, saldoAberto: 50 })
  })
  it("pagamento acima do título não cria recebido além da parcela a prazo", () => {
    expect(recebimentoDaVenda(100, { dinheiro: 50, aPrazo: 50 }, [{ status: "parcial", valor: 50, pago: 80 }])).toMatchObject({ recebido: 100, saldoAberto: 0 })
  })
})
