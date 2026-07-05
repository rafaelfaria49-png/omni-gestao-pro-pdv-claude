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
 *                      a prazo, sangrias, suprimentos, recebimentos de contas
 *                      (PDV F5 / `recebimento_cr`), saldo em dinheiro esperado,
 *                      qtd de vendas, ticket médio.
 *
 * Convenção alinhada ao financeiro já estabilizado (REGRA OFICIAL ÚNICA —
 * GOAL_FATURAMENTO_VALE_ALINHAMENTO, ver `valorAVistaVenda`):
 *  - `MovimentacaoFinanceira(origem:"venda")` lança apenas o valor à vista
 *    (`total − aPrazo − creditoVale`). Aqui, `totalRecebido = totalLiquido − aPrazo
 *    − creditoVale` segue a MESMA definição (carnê é recebimento imediato, igual ao
 *    `upsertVendaInTransaction`; creditoVale abate saldo do cliente, não é dinheiro novo).
 *  - O saldo em dinheiro da gaveta considera **somente** dinheiro físico:
 *    `saldoInicial + dinheiro(vendas) + suprimentos + recebimentos CR em dinheiro − sangrias`.
 *  - `recebimento_cr` (CaixaOperacao) **não** entra em vendas nem em `porOrigem`/`porPagamento`
 *    de vendas — evita inflar faturamento. Soma à gaveta conforme forma (dinheiro no físico).
 *  - `estorno_recebimento_cr` (CaixaOperacao) abate `recebimentosContas`/`recebimentosContasDinheiro`
 *    (GOAL CAIXA-FIX-ESTORNO-OS-002) — sem isso o saldo esperado ficava inflado após um estorno
 *    de recebimento de OS/CR na mesma sessão.
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
  /** totalLiquido − aPrazo − creditoVale (recebido à vista; alinhado ao MovimentacaoFinanceira). */
  totalRecebido: number
  /** Σ paymentBreakdown.aPrazo (fiado — vira ContaReceberTitulo). */
  aPrazo: number
  sangrias: number
  suprimentos: number
  /** Σ CaixaOperacao `recebimento_cr` (baixa de título no PDV — não é venda). */
  recebimentosContas: number
  /** Parcela de recebimentos CR em dinheiro (impacta gaveta). */
  recebimentosContasDinheiro: number
  qtdRecebimentosContas: number
  /**
   * Outras entradas operacionais tratadas como RECEITA (hoje sempre 0).
   * Suprimento NÃO entra aqui (é reforço de gaveta, não faturamento).
   */
  outrosRecebimentos: number
  /**
   * Receita total do dia (faturamento) = vendas líquidas (`totalLiquido`)
   * + serviços recebidos (`recebimentosContas`) + `outrosRecebimentos`.
   * NÃO inclui abertura de caixa nem suprimentos; sangria reduz gaveta, não receita.
   */
  receitaTotalDia: number
  /** Devoluções/estornos da sessão (informativo). */
  totalDevolucoes: number
  saldoInicial: number
  /** Caixa físico esperado: abertura + dinheiro(vendas) + suprimentos + CR(dinheiro) − sangrias. */
  saldoDinheiroEsperado: number
  /** Saldo total movimentado: abertura + recebido(vendas) + suprimentos + CR − sangrias. */
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
/** Linha mínima de `CaixaOperacao` para agregação no fechamento. */
export type CaixaOperacaoLinha = {
  tipo: string
  valor: number
  payload?: unknown
}

function readFormaPagamentoPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const raw = (payload as Record<string, unknown>).formaPagamento
  return typeof raw === "string" ? raw.trim().toLowerCase() : ""
}

/**
 * Agrega sangrias, suprimentos e recebimentos CR a partir das operações da sessão (servidor).
 *
 * `estorno_recebimento_cr` (GOAL CAIXA-FIX-ESTORNO-OS-002) abate o líquido de
 * `recebimentosContas`/`recebimentosContasDinheiro` — sem isso, um estorno de recebimento
 * de OS/CR inflava o saldo esperado do caixa. A operação continua íntegra no banco
 * (auditoria/histórico) — só o AGREGADO do fechamento passa a considerar o abatimento.
 */
export function aggregateCaixaOperacoes(operacoes: CaixaOperacaoLinha[]): {
  sangrias: number
  suprimentos: number
  recebimentosContas: number
  recebimentosContasDinheiro: number
  qtdRecebimentosContas: number
} {
  let sangrias = 0
  let suprimentos = 0
  let recebimentosContas = 0
  let recebimentosContasDinheiro = 0
  let qtdRecebimentosContas = 0

  for (const op of operacoes) {
    const v = round2(Number(op.valor) || 0)
    if (!(v > 0)) continue
    const tipo = (op.tipo || "").trim().toLowerCase()
    if (tipo === "sangria") sangrias += v
    else if (tipo === "suprimento") suprimentos += v
    else if (tipo === "recebimento_cr") {
      recebimentosContas += v
      qtdRecebimentosContas += 1
      if (readFormaPagamentoPayload(op.payload) === "dinheiro") {
        recebimentosContasDinheiro += v
      }
    } else if (tipo === "estorno_recebimento_cr") {
      recebimentosContas -= v
      if (readFormaPagamentoPayload(op.payload) === "dinheiro") {
        recebimentosContasDinheiro -= v
      }
    }
  }

  return {
    sangrias: round2(sangrias),
    suprimentos: round2(suprimentos),
    recebimentosContas: round2(Math.max(0, recebimentosContas)),
    recebimentosContasDinheiro: round2(Math.max(0, recebimentosContasDinheiro)),
    qtdRecebimentosContas,
  }
}

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
  recebimentosContas?: number
  recebimentosContasDinheiro?: number
  qtdRecebimentosContas?: number
}): FechamentoResumo {
  const {
    sales,
    sangrias,
    suprimentos,
    saldoInicial,
    totalDevolucoes = 0,
    recebimentosContas = 0,
    recebimentosContasDinheiro = 0,
    qtdRecebimentosContas = 0,
  } = input

  // Exclui vendas canceladas de TODOS os cálculos financeiros.
  // Vendas canceladas permanecem no array para auditoria/histórico, mas não entram no fechamento.
  const activeSales = sales.filter((s) => s.status !== "cancelada")

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

  for (const sale of activeSales) {
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
  // Recebido à vista = REGRA OFICIAL ÚNICA (GOAL_FATURAMENTO_VALE_ALINHAMENTO):
  // total − aPrazo − creditoVale. Igual à entrada `MovimentacaoFinanceira(origem:"venda")`
  // gravada por `valorAVistaVenda`. creditoVale não é dinheiro novo (abate saldo do cliente).
  // O faturamento (`totalLiquido`/`receitaTotalDia`) CONTINUA incluindo o vale — é receita.
  const totalRecebido = round2(totalLiquido - aPrazo - pg.creditoVale)
  const qtdVendas = activeSales.length
  const ticketMedio = qtdVendas > 0 ? round2(totalLiquido / qtdVendas) : 0
  const recCr = round2(recebimentosContas)
  const recCrDin = round2(recebimentosContasDinheiro)
  // Receita = faturamento do dia. Vendas líquidas (já sem desconto e sem canceladas)
  // + serviços recebidos (recebimento_cr) + outras entradas operacionais reais.
  // Abertura, suprimento e sangria NÃO afetam a receita (são conferência de gaveta).
  const outrosRecebimentos = 0
  const receitaTotalDia = round2(totalLiquido + recCr + outrosRecebimentos)
  const saldoDinheiroEsperado = round2(
    saldoInicial + pg.dinheiro + suprimentos + recCrDin - sangrias,
  )
  const saldoMovimentadoEsperado = round2(
    saldoInicial + totalRecebido + suprimentos + recCr - sangrias,
  )

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
    recebimentosContas: recCr,
    recebimentosContasDinheiro: recCrDin,
    qtdRecebimentosContas,
    outrosRecebimentos,
    receitaTotalDia,
    totalDevolucoes: round2(totalDevolucoes),
    saldoInicial: round2(saldoInicial),
    saldoDinheiroEsperado,
    saldoMovimentadoEsperado,
    qtdVendas,
    qtdVendasMultiplas,
    ticketMedio,
  }
}

/**
 * Receita total do dia (faturamento) a partir de um resumo já calculado.
 *
 * Centraliza a definição única usada pelo modal de fechamento E pela reimpressão
 * do histórico — inclusive para sessões antigas cujo `resumoFechamento` persistido
 * não tinha os campos `outrosRecebimentos`/`receitaTotalDia` (recalcula com segurança
 * a partir de `totalLiquido` + `recebimentosContas`).
 *
 * Regras: abertura de caixa e suprimento NÃO são receita; sangria reduz a gaveta,
 * não a receita; desconto já está refletido em `totalLiquido` (vendas líquidas);
 * vendas canceladas já foram excluídas do agregado.
 */
export function receitaTotalDoDia(
  resumo: Pick<FechamentoResumo, "totalLiquido" | "recebimentosContas"> & { outrosRecebimentos?: number },
): number {
  return round2(
    (Number(resumo.totalLiquido) || 0) +
      (Number(resumo.recebimentosContas) || 0) +
      (Number(resumo.outrosRecebimentos) || 0),
  )
}
