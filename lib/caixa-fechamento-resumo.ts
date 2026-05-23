/**
 * Consolidação operacional do Fechamento de Caixa (estilo ERP / Gestão Click).
 *
 * Helper **puro** (sem React) que recebe as vendas de uma sessão de caixa e
 * produz três visões reutilizadas pelo modal de fechamento e pelo relatório de
 * caixa — evitando cálculos duplicados/divergentes:
 *
 *  1. `porOrigem`    — receita bruta por origem (PDV/Balcão, Item Avulso, O.S.).
 *  2. `porPagamento` — soma por forma de pagamento (dinheiro, pix, débito…).
 *  3. consolidação   — subtotal bruto, descontos, líquido, recebido à vista,
 *                      a prazo, sangrias, suprimentos, saldo em dinheiro
 *                      esperado, qtd de vendas, ticket médio.
 *
 * Convenção alinhada ao financeiro já estabilizado:
 *  - `MovimentacaoFinanceira(origem:"venda")` lança apenas o valor à vista
 *    (`total − aPrazo`). Aqui, `totalRecebido = totalLiquido − aPrazo` segue a
 *    mesma definição (carnê é tratado como recebimento imediato, igual ao
 *    `upsertVendaInTransaction`).
 *  - O saldo em dinheiro da gaveta considera **somente** dinheiro físico:
 *    `saldoInicial + dinheiro + suprimentos − sangrias`.
 */

import type { SaleRecord } from "@/lib/operations-sale-types"
import { isAvulsoSaleLine, isOsVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"

export type OrigemVendaKey = "pdv" | "avulso" | "os"

export interface ResumoOrigemLinha {
  key: OrigemVendaKey
  label: string
  /** Receita bruta (soma de lineTotal das linhas dessa origem). */
  valorBruto: number
  /** Quantidade de linhas (itens) dessa origem. */
  qtdItens: number
}

export interface ResumoPagamento {
  dinheiro: number
  pix: number
  cartaoDebito: number
  cartaoCredito: number
  carne: number
  aPrazo: number
  creditoVale: number
  /** Soma de todas as formas (≈ total líquido das vendas). */
  total: number
}

export interface FechamentoResumo {
  porOrigem: ResumoOrigemLinha[]
  porPagamento: ResumoPagamento
  /** Σ lineTotal de todas as linhas (antes de desconto de venda). */
  subtotalBruto: number
  /** subtotalBruto − totalLiquido (descontos aplicados na finalização). */
  descontos: number
  /** Σ Venda.total (após desconto). */
  totalLiquido: number
  /** totalLiquido − aPrazo (recebido à vista; alinhado ao MovimentacaoFinanceira). */
  totalRecebido: number
  /** Σ paymentBreakdown.aPrazo (fiado — vira ContaReceberTitulo). */
  aPrazo: number
  sangrias: number
  suprimentos: number
  /** Devoluções/estornos da sessão (informativo). */
  totalDevolucoes: number
  saldoInicial: number
  /** Caixa físico esperado: saldoInicial + dinheiro + suprimentos − sangrias. */
  saldoDinheiroEsperado: number
  /** Saldo total movimentado: saldoInicial + totalLiquido + suprimentos − sangrias (≈ getSaldoAtual). */
  saldoMovimentadoEsperado: number
  qtdVendas: number
  /** Vendas liquidadas com 2+ formas de pagamento (conceito "múltiplo"). */
  qtdVendasMultiplas: number
  ticketMedio: number
}

const ORIGEM_LABEL: Record<OrigemVendaKey, string> = {
  pdv: "PDV / Balcão",
  avulso: "Item Avulso",
  os: "O.S. / Assistência",
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Classifica uma linha de venda pela sua origem (a partir do `inventoryId`). */
export function classifyLineOrigem(inventoryId: string): OrigemVendaKey {
  if (isOsVirtualSaleLine(inventoryId)) return "os"
  if (isAvulsoSaleLine(inventoryId)) return "avulso"
  return "pdv"
}

/**
 * Filtra as vendas pertencentes a uma sessão de caixa.
 * - Quando há `sessaoId`, casa por `sale.sessaoId` (preciso).
 * - Sem `sessaoId` (legado), cai para a janela desde `dataAbertura` (ou o dia atual).
 */
export function filterSalesDaSessao(
  sales: SaleRecord[],
  opts: { sessaoId?: string | null; dataAbertura?: Date | null },
): SaleRecord[] {
  const sid = opts.sessaoId?.trim()
  if (sid) return sales.filter((s) => s.sessaoId === sid)
  if (opts.dataAbertura) {
    const desde = opts.dataAbertura.getTime()
    return sales.filter((s) => {
      const t = new Date(s.at).getTime()
      return Number.isFinite(t) && t >= desde
    })
  }
  const hoje = new Date().toISOString().split("T")[0]
  return sales.filter((s) => String(s.at).startsWith(hoje))
}

export function computeFechamentoResumo(input: {
  sales: SaleRecord[]
  sangrias: number
  suprimentos: number
  saldoInicial: number
  totalDevolucoes?: number
}): FechamentoResumo {
  const { sales, sangrias, suprimentos, saldoInicial, totalDevolucoes = 0 } = input

  const origemAcc: Record<OrigemVendaKey, { valorBruto: number; qtdItens: number }> = {
    pdv: { valorBruto: 0, qtdItens: 0 },
    avulso: { valorBruto: 0, qtdItens: 0 },
    os: { valorBruto: 0, qtdItens: 0 },
  }
  const pg: ResumoPagamento = {
    dinheiro: 0,
    pix: 0,
    cartaoDebito: 0,
    cartaoCredito: 0,
    carne: 0,
    aPrazo: 0,
    creditoVale: 0,
    total: 0,
  }

  let subtotalBruto = 0
  let totalLiquido = 0
  let qtdVendasMultiplas = 0

  for (const sale of sales) {
    for (const line of sale.lines ?? []) {
      const key = classifyLineOrigem(line.inventoryId)
      const lineTotal =
        typeof line.lineTotal === "number" && Number.isFinite(line.lineTotal) ? line.lineTotal : 0
      origemAcc[key].valorBruto += lineTotal
      origemAcc[key].qtdItens += 1
      subtotalBruto += lineTotal
    }

    totalLiquido += typeof sale.total === "number" && Number.isFinite(sale.total) ? sale.total : 0

    const pb = sale.paymentBreakdown
    if (pb) {
      pg.dinheiro += pb.dinheiro ?? 0
      pg.pix += pb.pix ?? 0
      pg.cartaoDebito += pb.cartaoDebito ?? 0
      pg.cartaoCredito += pb.cartaoCredito ?? 0
      pg.carne += pb.carne ?? 0
      pg.aPrazo += pb.aPrazo ?? 0
      pg.creditoVale += pb.creditoVale ?? 0
      const formasUsadas = [
        pb.dinheiro,
        pb.pix,
        pb.cartaoDebito,
        pb.cartaoCredito,
        pb.carne,
        pb.aPrazo,
        pb.creditoVale,
      ].filter((v) => (v ?? 0) > 0.001).length
      if (formasUsadas >= 2) qtdVendasMultiplas += 1
    }
  }

  pg.dinheiro = round2(pg.dinheiro)
  pg.pix = round2(pg.pix)
  pg.cartaoDebito = round2(pg.cartaoDebito)
  pg.cartaoCredito = round2(pg.cartaoCredito)
  pg.carne = round2(pg.carne)
  pg.aPrazo = round2(pg.aPrazo)
  pg.creditoVale = round2(pg.creditoVale)
  pg.total = round2(
    pg.dinheiro + pg.pix + pg.cartaoDebito + pg.cartaoCredito + pg.carne + pg.aPrazo + pg.creditoVale,
  )

  subtotalBruto = round2(subtotalBruto)
  totalLiquido = round2(totalLiquido)
  const descontos = round2(Math.max(0, subtotalBruto - totalLiquido))
  const aPrazo = pg.aPrazo
  const totalRecebido = round2(totalLiquido - aPrazo)
  const qtdVendas = sales.length
  const ticketMedio = qtdVendas > 0 ? round2(totalLiquido / qtdVendas) : 0
  const saldoDinheiroEsperado = round2(saldoInicial + pg.dinheiro + suprimentos - sangrias)
  const saldoMovimentadoEsperado = round2(saldoInicial + totalLiquido + suprimentos - sangrias)

  const porOrigem: ResumoOrigemLinha[] = (Object.keys(origemAcc) as OrigemVendaKey[])
    .map((key) => ({
      key,
      label: ORIGEM_LABEL[key],
      valorBruto: round2(origemAcc[key].valorBruto),
      qtdItens: origemAcc[key].qtdItens,
    }))
    .filter((o) => o.qtdItens > 0 || o.valorBruto > 0)

  return {
    porOrigem,
    porPagamento: pg,
    subtotalBruto,
    descontos,
    totalLiquido,
    totalRecebido,
    aPrazo,
    sangrias: round2(sangrias),
    suprimentos: round2(suprimentos),
    totalDevolucoes: round2(totalDevolucoes),
    saldoInicial: round2(saldoInicial),
    saldoDinheiroEsperado,
    saldoMovimentadoEsperado,
    qtdVendas,
    qtdVendasMultiplas,
    ticketMedio,
  }
}
