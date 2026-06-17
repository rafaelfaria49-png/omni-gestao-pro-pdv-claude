/**
 * Resumo financeiro PURO de uma venda — para o Workspace de Correção (read-only, F1).
 *
 * Deriva, a partir das movimentações financeiras e dos títulos à prazo que a venda
 * gerou, um retrato honesto do status financeiro. NÃO toca o banco e NÃO altera nada.
 *
 * Convenções (alinhadas a `ops-upsert-venda` / `caixa-fechamento-resumo`):
 *  - Entrada à vista da venda  → MovimentacaoFinanceira(tipo:"entrada", origem:"venda").
 *  - Estorno (cancelamento)    → MovimentacaoFinanceira(tipo:"saida", origem:"cancelamento_pdv" | "estorno_receber").
 *  - À prazo                   → ContaReceberTitulo(localKey: pdv-aprazo-*); pagamentos no payload.historico.
 *  - Vale/crédito              → paymentBreakdown.creditoVale (abate saldo, não é receita nova).
 */

import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

export interface MovimentacaoLite {
  tipo: string // "entrada" | "saida"
  origem: string
  valor: number
}

export interface TituloLite {
  status: string | null
  valor: number
  /** payload com `historico[]` de pagamentos/estornos (opcional). */
  payload?: unknown
}

export interface VendaStatusFinanceiro {
  totalVenda: number
  /** Σ entradas origem "venda". */
  recebidoAVista: number
  /** Σ saídas de estorno (cancelamento/estorno). */
  estornado: number
  /** recebidoAVista − estornado. */
  entradaLiquida: number
  /** Σ valor de títulos à prazo ativos (não cancelados/estornados). */
  aPrazoTotal: number
  /** Σ pagamentos registrados nos títulos. */
  aPrazoPago: number
  /** aPrazoTotal − aPrazoPago (≥ 0). */
  aPrazoAberto: number
  /** Quantidade de títulos cancelados/estornados. */
  titulosCancelados: number
  /** Vale/crédito usado (do paymentBreakdown). */
  creditoValeUsado: number
  temAPrazo: boolean
  temEstorno: boolean
  /** entradaLiquida + aPrazoAberto + aPrazoPago + creditoVale ≈ total da venda. */
  conciliado: boolean
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** Soma líquida de pagamentos no `historico` do payload de um título. */
export function sumPagamentosHistorico(payload: unknown): number {
  const h = isRecord(payload) ? payload.historico : undefined
  if (!Array.isArray(h)) return 0
  let s = 0
  for (const e of h) {
    if (!isRecord(e)) continue
    const t = String(e.tipo ?? "").toLowerCase()
    const v = typeof e.valor === "number" && Number.isFinite(e.valor) ? e.valor : 0
    if (t === "pagamento" || t === "liquidacao") s += v
    else if (t === "estorno_pagamento") s -= v
  }
  return round2(s)
}

const STATUS_ENCERRADO = new Set(["cancelado", "cancelada", "estornado", "estornada"])
const ESTORNO_ORIGENS = new Set(["cancelamento_pdv", "estorno_receber", "estorno_venda", "devolucao_pdv"])

export function computeVendaStatusFinanceiro(input: {
  total: number
  paymentBreakdown?: Partial<PaymentBreakdownFull> | null
  movimentacoes?: MovimentacaoLite[]
  titulos?: TituloLite[]
}): VendaStatusFinanceiro {
  const totalVenda = round2(input.total)
  const movs = input.movimentacoes ?? []
  const titulos = input.titulos ?? []

  let recebidoAVista = 0
  let estornado = 0
  for (const m of movs) {
    const valor = round2(Number(m.valor) || 0)
    if (valor <= 0) continue
    const tipo = String(m.tipo || "").toLowerCase()
    const origem = String(m.origem || "").toLowerCase()
    if (tipo === "entrada" && origem === "venda") recebidoAVista += valor
    else if (tipo === "saida" && ESTORNO_ORIGENS.has(origem)) estornado += valor
  }
  recebidoAVista = round2(recebidoAVista)
  estornado = round2(estornado)

  let aPrazoTotal = 0
  let aPrazoPago = 0
  let titulosCancelados = 0
  for (const t of titulos) {
    const status = String(t.status ?? "").toLowerCase()
    if (STATUS_ENCERRADO.has(status)) {
      titulosCancelados += 1
      continue
    }
    aPrazoTotal += round2(Number(t.valor) || 0)
    aPrazoPago += sumPagamentosHistorico(t.payload)
  }
  aPrazoTotal = round2(aPrazoTotal)
  aPrazoPago = round2(Math.max(0, aPrazoPago))
  const aPrazoAberto = round2(Math.max(0, aPrazoTotal - aPrazoPago))

  const creditoValeUsado = round2(Number(input.paymentBreakdown?.creditoVale) || 0)
  const entradaLiquida = round2(recebidoAVista - estornado)

  const somaConferida = round2(entradaLiquida + aPrazoTotal + creditoValeUsado)
  const conciliado = Math.abs(somaConferida - totalVenda) <= 0.05 || estornado > 0

  return {
    totalVenda,
    recebidoAVista,
    estornado,
    entradaLiquida,
    aPrazoTotal,
    aPrazoPago,
    aPrazoAberto,
    titulosCancelados,
    creditoValeUsado,
    temAPrazo: aPrazoTotal > 0.005 || aPrazoPago > 0.005,
    temEstorno: estornado > 0.005,
    conciliado,
  }
}
