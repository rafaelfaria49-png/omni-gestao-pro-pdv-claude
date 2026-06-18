/**
 * Planner PURO da correção de forma de pagamento de uma venda (F-01).
 *
 * Dado o pagamento ANTIGO e o NOVO `paymentBreakdown` + o total da venda, calcula
 * o que precisa ser reconciliado nos três subsistemas que uma venda gera:
 *
 *   1. Caixa/Financeiro à vista — `MovimentacaoFinanceira(origem:"venda")`.
 *   2. Contas a Receber          — `ContaReceberTitulo(localKey: pdv-aprazo-*)`.
 *   3. Crédito/Vale do cliente   — `ClienteCredito`/`UsoCreditoCliente`.
 *
 * Este módulo NÃO toca o banco — só decide. A aplicação (rota `corrigir`) executa
 * o plano reutilizando o MESMO motor do cancelamento (`estornarMovimentacaoPorReferencia`,
 * `cancelContaReceber`, `upsertContaReceber`) + o padrão de `upsertVendaInTransaction`.
 *
 * Convenção de "dinheiro real" (caixa/financeiro à vista):
 *   cashReal = dinheiro + pix + cartaoDebito + cartaoCredito + carne
 * Ou seja, à vista EXCLUI `aPrazo` (vira título) e `creditoVale` (abate saldo existente,
 * não é dinheiro novo). Isso garante a invariante do GOAL: "nunca deixar dinheiro
 * sobrando no caixa" ao corrigir para À Prazo/Vale.
 *
 * Reconciliação CONVERGENTE (idempotente): o plano sempre leva o estado atual ao
 * estado-alvo do novo breakdown. Reaplicar o mesmo alvo é no-op (ver `errorCode:"no_change"`).
 */

import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

export const PAYMENT_FORM_KEYS: (keyof PaymentBreakdownFull)[] = [
  "dinheiro",
  "pix",
  "cartaoDebito",
  "cartaoCredito",
  "carne",
  "aPrazo",
  "creditoVale",
]

/** Formas que entram no caixa/financeiro à vista (dinheiro real recebido na hora). */
export const AVISTA_CASH_KEYS: (keyof PaymentBreakdownFull)[] = [
  "dinheiro",
  "pix",
  "cartaoDebito",
  "cartaoCredito",
  "carne",
]

const EPS = 0.005

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Normaliza um breakdown parcial: arredonda, descarta negativos/ruído, preenche zeros. */
export function normalizeBreakdown(pb?: Partial<PaymentBreakdownFull> | null): PaymentBreakdownFull {
  const out = {
    dinheiro: 0,
    pix: 0,
    cartaoDebito: 0,
    cartaoCredito: 0,
    carne: 0,
    aPrazo: 0,
    creditoVale: 0,
  } as PaymentBreakdownFull
  if (!pb || typeof pb !== "object") return out
  for (const k of PAYMENT_FORM_KEYS) {
    const v = round2(Number((pb as Record<string, unknown>)[k]) || 0)
    out[k] = v > 0 ? v : 0
  }
  return out
}

export function sumBreakdown(pb: PaymentBreakdownFull): number {
  return round2(PAYMENT_FORM_KEYS.reduce((s, k) => s + (pb[k] || 0), 0))
}

/** Parcela à vista (dinheiro real) de um breakdown — soma das formas à vista. */
export function cashReal(pb: PaymentBreakdownFull): number {
  return round2(AVISTA_CASH_KEYS.reduce((s, k) => s + (pb[k] || 0), 0))
}

/**
 * REGRA OFICIAL ÚNICA de "receita à vista" de uma venda — GOAL_FATURAMENTO_VALE_ALINHAMENTO.
 *
 *   valorAVistaVenda = total − aPrazo − creditoVale
 *
 * É o valor que entra no caixa/financeiro como `MovimentacaoFinanceira(origem:"venda")`.
 * EXCLUI `aPrazo` (vira ContaReceberTitulo) e `creditoVale` (abatimento de saldo já
 * existente do cliente, debitado em ClienteCredito/UsoCreditoCliente — não é dinheiro novo).
 *
 * Reutilizada IDENTICAMENTE pelos dois fluxos que gravam essa entrada:
 *   - venda normal  → `upsertVendaInTransaction` (motor compartilhado dos PDVs);
 *   - correção      → `computeCorrecaoPagamentoPlan` (campo `cashTarget`).
 *
 * Ancorada no TOTAL autoritativo da venda (não na soma das formas): para um breakdown
 * que fecha o total é idêntica a `cashReal(pb)`; se o breakdown estiver ausente/incompleto
 * (replay legado sem `paymentBreakdown`), cai em `total` — preservando o histórico.
 */
export function valorAVistaVenda(total: number, pb?: Partial<PaymentBreakdownFull> | null): number {
  const n = normalizeBreakdown(pb)
  return round2(round2(total) - n.aPrazo - n.creditoVale)
}

/** Igualdade de breakdown forma-a-forma (tolerância de centavos). */
export function breakdownEquals(a: PaymentBreakdownFull, b: PaymentBreakdownFull): boolean {
  return PAYMENT_FORM_KEYS.every((k) => Math.abs((a[k] || 0) - (b[k] || 0)) <= EPS)
}

export type CorrecaoPlanErrorCode = "total_mismatch" | "no_change"

export interface CorrecaoPagamentoPlan {
  ok: boolean
  errorCode?: CorrecaoPlanErrorCode
  /** Mensagem amigável quando `ok === false`. */
  error?: string

  total: number
  oldBreakdown: PaymentBreakdownFull
  newBreakdown: PaymentBreakdownFull

  // ── Caixa/Financeiro à vista ──────────────────────────────────────────────
  oldCashReal: number
  /** Valor-alvo da `MovimentacaoFinanceira(origem:"venda")`. 0 ⇒ remover a entrada. */
  cashTarget: number

  // ── Contas a Receber (à prazo) ────────────────────────────────────────────
  oldAPrazo: number
  newAPrazo: number
  /** O conjunto de títulos à prazo precisa ser reconciliado (valor à prazo mudou). */
  reconcileTitulos: boolean
  /** Quando reconciliando: cancelar TODOS os títulos à prazo desta venda. */
  cancelAllAPrazo: boolean
  /** Quando reconciliando e > 0: criar/revigorar 1 título à prazo com este valor. */
  criarTituloValor: number | null

  // ── Crédito/Vale ──────────────────────────────────────────────────────────
  oldCreditoVale: number
  /** Uso de crédito-alvo desta venda. A reconciliação faz delta vs. uso real no banco. */
  creditoTarget: number

  /** A natureza do pagamento mudou (aPrazo e/ou creditoVale alterados). */
  mudouNatureza: boolean
}

/**
 * Calcula o plano de reconciliação. `oldBreakdown` legado pode não somar o total —
 * isso é tolerado (só o NOVO breakdown precisa fechar com o total).
 */
export function computeCorrecaoPagamentoPlan(input: {
  total: number
  oldBreakdown?: Partial<PaymentBreakdownFull> | null
  newBreakdown: Partial<PaymentBreakdownFull>
  /** Tolerância de centavos para o casamento de total (default 0.01). */
  tolerance?: number
}): CorrecaoPagamentoPlan {
  const total = round2(input.total)
  const oldBreakdown = normalizeBreakdown(input.oldBreakdown)
  const newBreakdown = normalizeBreakdown(input.newBreakdown)
  const tol = typeof input.tolerance === "number" ? input.tolerance : 0.01

  const base: CorrecaoPagamentoPlan = {
    ok: false,
    total,
    oldBreakdown,
    newBreakdown,
    oldCashReal: cashReal(oldBreakdown),
    // Alvo da entrada à vista = REGRA OFICIAL ÚNICA (idêntica ao motor de venda).
    // Consumido só quando ok:true (novo breakdown fecha o total), onde equivale a
    // cashReal(newBreakdown); ancorar no total mantém a regra única entre os fluxos.
    cashTarget: valorAVistaVenda(total, newBreakdown),
    oldAPrazo: oldBreakdown.aPrazo,
    newAPrazo: newBreakdown.aPrazo,
    reconcileTitulos: false,
    cancelAllAPrazo: false,
    criarTituloValor: null,
    oldCreditoVale: oldBreakdown.creditoVale,
    creditoTarget: newBreakdown.creditoVale,
    mudouNatureza: false,
  }

  // O NOVO breakdown deve somar exatamente o total da venda (itens/total imutáveis).
  const novoTotal = sumBreakdown(newBreakdown)
  if (Math.abs(novoTotal - total) > tol) {
    return {
      ...base,
      ok: false,
      errorCode: "total_mismatch",
      error:
        `Total da nova forma de pagamento (R$ ${novoTotal.toFixed(2)}) difere do total da venda ` +
        `(R$ ${total.toFixed(2)}). Itens e total não podem ser alterados.`,
    }
  }

  // Nada mudou ⇒ no-op (idempotência para reenvio/duplo-clique).
  if (breakdownEquals(oldBreakdown, newBreakdown)) {
    return { ...base, ok: false, errorCode: "no_change", error: "Nenhuma alteração de pagamento." }
  }

  const aPrazoMudou = Math.abs(newBreakdown.aPrazo - oldBreakdown.aPrazo) > EPS
  const valeMudou = Math.abs(newBreakdown.creditoVale - oldBreakdown.creditoVale) > EPS
  const reconcileTitulos = aPrazoMudou
  const cancelAllAPrazo = reconcileTitulos && newBreakdown.aPrazo <= EPS
  const criarTituloValor = reconcileTitulos && newBreakdown.aPrazo > EPS ? newBreakdown.aPrazo : null

  return {
    ...base,
    ok: true,
    reconcileTitulos,
    cancelAllAPrazo,
    criarTituloValor,
    mudouNatureza: aPrazoMudou || valeMudou,
  }
}
