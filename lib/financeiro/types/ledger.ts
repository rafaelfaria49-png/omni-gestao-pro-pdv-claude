/**
 * Evento de ledger — derivação de saldo e rastreabilidade (não substitui títulos).
 */

import type { FinanceiroOrigem } from "@/lib/financeiro/contracts/origem"

export type LedgerEventoTipo =
  | "movimento_confirmado"
  | "movimento_estornado"
  | "titulo_receber_criado"
  | "titulo_receber_baixado"
  | "titulo_pagar_criado"
  | "titulo_pagar_baixado"
  | "snapshot_diario"
  | "ajuste_manual"
  | string

export type LedgerEvent = {
  saldoAnterior: number
  saldoPosterior: number
  evento: LedgerEventoTipo
  referencia: string
  origem: FinanceiroOrigem | string
  /** Liga eventos relacionados (ex.: estorno ↔ movimento original). */
  correlacao: string
}

export type FinanceiroAuditEntry = {
  at: string
  origem: FinanceiroOrigem | string
  evento: LedgerEventoTipo
  referencia: string
  correlacao: string
  detail: string
  metadata?: Record<string, unknown>
}
