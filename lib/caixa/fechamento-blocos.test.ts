import { describe, expect, it } from "vitest"
import type { PaymentBreakdownFull, SaleRecord } from "@/lib/operations-sale-types"
import {
  aggregateCaixaOperacoes,
  buildComprovanteFechamentoHtml,
  computeFechamentoResumo,
  type CaixaOperacaoLinha,
  type FechamentoPosSnapshot,
  type FechamentoResumo,
} from "@/lib/caixa-fechamento-resumo"
import {
  linhasTextoFechamento,
  montarBlocosFechamento,
  type BlocoFechamento,
  type ResumoFechamentoPersistido,
} from "./fechamento-blocos"
import { aggregateRecebimentosSessao } from "./recebimentos-sessao"

// ============================================================================
// GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A — cenários obrigatórios.
// Mesmo encadeamento do `useCaixaResumo`: operações → agregados legados + recebimentos
// por origem/forma → `computeFechamentoResumo` → blocos de apresentação.
// ============================================================================

let seq = 0
function venda(
  total: number,
  pb: Partial<PaymentBreakdownFull>,
  opts: { inventoryId?: string; lineTotal?: number; status?: string; semBreakdown?: boolean } = {},
): SaleRecord {
  seq += 1
  return {
    id: `VDA-T-2026-${String(seq).padStart(6, "0")}`,
    at: new Date().toISOString(),
    total,
    status: opts.status ?? "concluida",
    lines: [{ inventoryId: opts.inventoryId ?? "prod-1", lineTotal: opts.lineTotal ?? total }],
    paymentBreakdown: opts.semBreakdown
      ? undefined
      : { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, ...pb },
  } as unknown as SaleRecord
}

function resumoDaSessao(
  sales: SaleRecord[],
  operacoes: CaixaOperacaoLinha[],
  saldoInicial = 0,
): FechamentoResumo {
  const agg = aggregateCaixaOperacoes(operacoes)
  return computeFechamentoResumo({
    sales,
    sangrias: agg.sangrias,
    suprimentos: agg.suprimentos,
    saldoInicial,
    recebimentosContas: agg.recebimentosContas,
    recebimentosContasDinheiro: agg.recebimentosContasDinheiro,
    qtdRecebimentosContas: agg.qtdRecebimentosContas,
    recebimentos: aggregateRecebimentosSessao(operacoes),
  })
}

const linha = (b: BlocoFechamento, id: string) => b.linhas.find((l) => l.id === id)
const total = (b: BlocoFechamento) => b.linhas.find((l) => l.tipo === "total")?.valor
/** Soma a composição do bloco (itens − deduções), sem o total e sem as linhas informativas. */
const composicao = (b: BlocoFechamento) =>
  Math.round(
    b.linhas.reduce((acc, l) => (l.tipo === "item" ? acc + l.valor : l.tipo === "deducao" ? acc - l.valor : acc), 0) *
      100,
  ) / 100

const recF5 = (valor: number, formaPagamento: string): CaixaOperacaoLinha => ({
  tipo: "recebimento_cr",
  valor,
  payload: { localId: `pdv-rc:loja:sessao:${valor}:${formaPagamento}`, formaPagamento },
})

describe("GOAL 003A — Vendas × Recebido × Forma × Gaveta", () => {
  it("1. venda à prazo recebida na mesma sessão NÃO duplica o recebido", () => {
    const r = resumoDaSessao([venda(100, { aPrazo: 100 })], [recF5(100, "dinheiro")])
    const b = montarBlocosFechamento(r)

    expect(r.receitaTotalDia).toBe(200) // campo legado continua gravado (duplicava) — não é exibido
    expect(linha(b.vendas, "vendas.liquidas")?.valor).toBe(100)
    expect(linha(b.recebidoPorOrigem, "recebido.vendas-a-vista")?.valor).toBe(0)
    expect(linha(b.recebidoPorOrigem, "recebido.contas")?.valor).toBe(100)
    expect(b.totais.recebidoSessao).toBe(100)
    expect(total(b.recebidoPorForma)).toBe(100)
    expect(linhasTextoFechamento(b).join("\n")).not.toMatch(/receita total/i)
  })

  it("2. venda à prazo aparece em Vendas como 'A receber' e fica fora do recebido e da gaveta", () => {
    const r = resumoDaSessao([venda(300, { aPrazo: 300 })], [], 50)
    const b = montarBlocosFechamento(r)

    expect(linha(b.vendas, "vendas.a-prazo")).toMatchObject({ tipo: "info", valor: 300 })
    expect(b.totais.recebidoSessao).toBe(0)
    expect(b.recebidoPorForma.linhas.some((l) => l.id === "forma.aPrazo")).toBe(false)
    expect(b.totais.dinheiroEsperado).toBe(50)
    expect(r.saldoDinheiroEsperado).toBe(50)
  })

  it("3. conta recebida em dinheiro entra em Contas, em Dinheiro e na gaveta", () => {
    const r = resumoDaSessao([], [{ tipo: "recebimento_cr", valor: 80, payload: { origem: "financeiro", formaPagamento: "dinheiro" } }])
    const b = montarBlocosFechamento(r)

    expect(linha(b.recebidoPorOrigem, "recebido.contas")?.valor).toBe(80)
    expect(linha(b.recebidoPorForma, "forma.dinheiro")?.valor).toBe(80)
    expect(linha(b.gaveta, "gaveta.dinheiro-contas")?.valor).toBe(80)
    expect(r.saldoDinheiroEsperado).toBe(80)
  })

  it("4. conta recebida via PIX entra em Contas e em PIX, mas NÃO na gaveta", () => {
    const r = resumoDaSessao([], [recF5(120, "pix")])
    const b = montarBlocosFechamento(r)

    expect(linha(b.recebidoPorOrigem, "recebido.contas")?.valor).toBe(120)
    expect(linha(b.recebidoPorForma, "forma.pix")?.valor).toBe(120)
    expect(linha(b.gaveta, "gaveta.dinheiro-contas")).toBeUndefined()
    expect(r.saldoDinheiroEsperado).toBe(0)
  })

  it("5. debito, cartao_debito e 'Cartão de Débito' somam na MESMA forma", () => {
    const r = resumoDaSessao(
      [venda(5, { cartaoDebito: 5 })],
      [
        { tipo: "recebimento_cr", valor: 10, payload: { origem: "operacoes-v3-os", formaPagamento: "debito" } },
        recF5(20, "cartao_debito"),
        { tipo: "recebimento_cr", valor: 30, payload: { origem: "financeiro", formaPagamento: "cartão de débito" } },
      ],
    )
    const b = montarBlocosFechamento(r)
    const formas = b.recebidoPorForma.linhas.filter((l) => l.tipo === "item")

    expect(formas).toEqual([expect.objectContaining({ id: "forma.cartaoDebito", rotulo: "Débito", valor: 65 })])
  })

  it("6. crédito/vale é informativo: fora do recebido e da gaveta", () => {
    const r = resumoDaSessao([venda(100, { dinheiro: 60, creditoVale: 40 })], [])
    const b = montarBlocosFechamento(r)

    expect(linha(b.vendas, "vendas.credito-vale")).toMatchObject({ tipo: "info", valor: 40 })
    expect(b.totais.recebidoSessao).toBe(60)
    expect(linha(b.recebidoPorForma, "forma.creditoVale")).toBeUndefined()
    expect(b.totais.dinheiroEsperado).toBe(60)
  })

  it("7. pagamento múltiplo entra por componente, sem linha 'Múltiplo'", () => {
    const r = resumoDaSessao([venda(100, { dinheiro: 50, pix: 30, cartaoCredito: 20 })], [])
    const b = montarBlocosFechamento(r)
    const todas = [b.vendas, b.recebidoPorOrigem, b.recebidoPorForma, b.gaveta].flatMap((x) => x.linhas)

    expect(linha(b.recebidoPorForma, "forma.dinheiro")?.valor).toBe(50)
    expect(linha(b.recebidoPorForma, "forma.pix")?.valor).toBe(30)
    expect(linha(b.recebidoPorForma, "forma.cartaoCredito")?.valor).toBe(20)
    expect(total(b.recebidoPorForma)).toBe(100)
    expect(todas.some((l) => /m[uú]ltipl/i.test(l.rotulo))).toBe(false)
  })

  it("8. suprimento entra na gaveta e não é venda nem recebimento", () => {
    const r = resumoDaSessao([], [{ tipo: "suprimento", valor: 200 }], 100)
    const b = montarBlocosFechamento(r)

    expect(linha(b.gaveta, "gaveta.suprimentos")?.valor).toBe(200)
    expect(b.totais.dinheiroEsperado).toBe(300)
    expect(b.totais.vendasLiquidas).toBe(0)
    expect(b.totais.recebidoSessao).toBe(0)
    expect(r.receitaTotalDia).toBe(0)
  })

  it("9. sangria reduz a gaveta e não reduz as vendas", () => {
    const r = resumoDaSessao([venda(100, { dinheiro: 100 })], [{ tipo: "sangria", valor: 30 }])
    const b = montarBlocosFechamento(r)

    expect(linha(b.gaveta, "gaveta.sangrias")).toMatchObject({ tipo: "deducao", valor: 30 })
    expect(b.totais.dinheiroEsperado).toBe(70)
    expect(b.totais.vendasLiquidas).toBe(100)
    expect(b.totais.recebidoSessao).toBe(100)
  })

  it("11. estorno sem forma: não inventa forma, aparece à parte e não mexe na gaveta", () => {
    const r = resumoDaSessao(
      [],
      [
        { tipo: "recebimento_cr", valor: 100, payload: { origem: "operacoes-v3-os", formaPagamento: "dinheiro" } },
        { tipo: "estorno_recebimento_cr", valor: 40, payload: { origem: "operacoes-v3-os" } },
      ],
    )
    const b = montarBlocosFechamento(r)

    expect(linha(b.recebidoPorOrigem, "recebido.os")?.valor).toBe(100)
    expect(linha(b.recebidoPorOrigem, "recebido.estornos")).toMatchObject({ tipo: "deducao", valor: 40 })
    expect(b.totais.recebidoSessao).toBe(60)
    expect(linha(b.recebidoPorForma, "forma.dinheiro")?.valor).toBe(100)
    expect(linha(b.recebidoPorForma, "forma.estornos-sem-forma")).toMatchObject({ tipo: "deducao", valor: 40 })
    expect(total(b.recebidoPorForma)).toBe(60)
    expect(b.recebidoPorForma.notas.join(" ")).toMatch(/sem forma/i)
    expect(linha(b.gaveta, "gaveta.estornos-dinheiro")).toBeUndefined()
    expect(b.totais.dinheiroEsperado).toBe(100)
    expect(r.saldoDinheiroEsperado).toBe(100)
  })

  it("origem e forma reconciliam, e a gaveta fecha com a fórmula preservada", () => {
    const r = resumoDaSessao(
      [
        venda(150, { dinheiro: 100, cartaoDebito: 50 }, { inventoryId: "__os_servico__os-1" }),
        venda(90, { pix: 90 }, { lineTotal: 100 }),
        venda(40, { carne: 40 }, { inventoryId: "__avulso__x" }),
        venda(70, { aPrazo: 70 }),
        venda(500, { dinheiro: 500 }, { status: "cancelada" }),
      ],
      [
        recF5(60, "dinheiro"),
        { tipo: "recebimento_cr", valor: 45, payload: { origem: "pdv_lote", formaPagamento: "pix" } },
        { tipo: "recebimento_cr", valor: 35, payload: { origem: "operacoes-v3-os", formaPagamento: "credito" } },
        { tipo: "recebimento_cr", valor: 15, payload: { origem: "financeiro", formaPagamento: "transferencia" } },
        { tipo: "estorno_recebimento_cr", valor: 10, payload: { origem: "operacoes-v3-os" } },
        { tipo: "suprimento", valor: 25 },
        { tipo: "sangria", valor: 80 },
      ],
      100,
    )
    const b = montarBlocosFechamento(r)

    expect(b.totais.recebidoSessao).toBe(r.totalRecebido + 60 + 45 + 35 + 15 - 10)
    expect(total(b.recebidoPorForma)).toBe(b.totais.recebidoSessao)
    expect(composicao(b.recebidoPorForma)).toBe(b.totais.recebidoSessao)
    expect(composicao(b.recebidoPorOrigem)).toBe(b.totais.recebidoSessao)
    expect(composicao(b.gaveta)).toBe(r.saldoDinheiroEsperado)
    expect(linha(b.vendas, "vendas.os")?.rotulo).toBe("O.S. faturadas no PDV")
    expect(linha(b.vendas, "vendas.avulso")?.rotulo).toBe("Itens avulsos")
    expect(linha(b.vendas, "vendas.descontos")?.valor).toBe(10)
    expect(linha(b.recebidoPorForma, "forma.nao-identificada")?.valor).toBe(15)
    expect(b.recebidoPorForma.notas.join(" ")).toMatch(/carnê/i)
  })

  it("venda sem forma registrada aparece como tal, sem ser atribuída a uma forma", () => {
    const r = resumoDaSessao([venda(30, {}, { semBreakdown: true })], [])
    const b = montarBlocosFechamento(r)

    expect(linha(b.recebidoPorForma, "forma.vendas-sem-forma")?.valor).toBe(30)
    expect(total(b.recebidoPorForma)).toBe(b.totais.recebidoSessao)
  })
})

describe("10. snapshot antigo continua abrindo", () => {
  /** Formato gravado antes do 003A (sem recebidoPorOrigem/recebidoPorForma/gavetaDinheiro). */
  const antigo = {
    porOrigem: [{ key: "os", label: "O.S. / Assistência", valorBruto: 239.97, qtdItens: 1 }],
    porPagamento: { dinheiro: 239.97, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, total: 239.97 },
    subtotalBruto: 239.97,
    descontos: 0,
    totalLiquido: 239.97,
    totalRecebido: 239.97,
    aPrazo: 0,
    sangrias: 0,
    suprimentos: 0,
    recebimentosContas: 30,
    recebimentosContasDinheiro: 30,
    qtdRecebimentosContas: 1,
    outrosRecebimentos: 0,
    receitaTotalDia: 269.97,
    totalDevolucoes: 0,
    saldoInicial: 0,
    saldoDinheiroEsperado: 269.97,
    saldoMovimentadoEsperado: 269.97,
    qtdVendas: 1,
    qtdVendasMultiplas: 0,
    ticketMedio: 239.97,
  } satisfies ResumoFechamentoPersistido

  it("monta os quatro blocos a partir dos campos legados, sem inventar a divisão contas × O.S.", () => {
    const b = montarBlocosFechamento(antigo)

    expect(b.legado).toBe(true)
    expect(linha(b.vendas, "vendas.os")?.rotulo).toBe("O.S. faturadas no PDV")
    expect(linha(b.recebidoPorOrigem, "recebido.contas-os")?.valor).toBe(30)
    expect(b.totais.recebidoSessao).toBe(269.97)
    expect(total(b.recebidoPorForma)).toBe(269.97)
    expect(linha(b.gaveta, "gaveta.dinheiro-contas")?.rotulo).toBe("Dinheiro de contas e O.S. recebidas")
    expect(composicao(b.gaveta)).toBe(antigo.saldoDinheiroEsperado)
  })

  it("com as operações da sessão, recupera a separação real", () => {
    const b = montarBlocosFechamento(antigo, {
      operacoes: [{ tipo: "recebimento_cr", valor: 30, payload: { origem: "operacoes-v3-os", formaPagamento: "dinheiro" } }],
    })

    expect(linha(b.recebidoPorOrigem, "recebido.os")?.valor).toBe(30)
    expect(linha(b.recebidoPorOrigem, "recebido.contas")).toBeUndefined()
    expect(b.totais.recebidoSessao).toBe(269.97)
  })

  it("resumo incompleto não quebra a renderização", () => {
    expect(() => montarBlocosFechamento({ totalLiquido: 50 } as unknown as ResumoFechamentoPersistido)).not.toThrow()
  })

  it("o comprovante térmico de um snapshot antigo renderiza com os conceitos novos", () => {
    const snapshot: FechamentoPosSnapshot = {
      loja: "Loja",
      sessaoId: "sessao-antiga",
      terminalLabel: "PDV1",
      operadores: ["RAFAEL"],
      dataAbertura: null,
      fechadaEm: null,
      saldoInicial: 0,
      totalEntradas: 269.97,
      totalSaidas: 0,
      saldoDinheiroEsperado: 269.97,
      saldoMovimentadoEsperado: 269.97,
      valorContado: null,
      diferenca: null,
      observacao: "",
      resumo: antigo as unknown as FechamentoResumo,
    }
    const html = buildComprovanteFechamentoHtml(snapshot)

    expect(html).toContain("VENDAS DA SESSÃO")
    expect(html).toContain("RECEBIDO NA SESSÃO · POR ORIGEM")
    expect(html).toContain("GAVETA · DINHEIRO FÍSICO")
    expect(html).not.toMatch(/receita total|servi[çc]os recebidos/i)
  })
})
