import { safeMoney } from "@/lib/financeiro/contracts/valores"
import type { FinanceiroAuditEntry, LedgerEvent } from "@/lib/financeiro/types/ledger"

export function buildLedgerEvent(params: {
  saldoAnterior: number
  /** Variação algebraica aplicada ao saldo (entrada +, saída -). */
  delta: number
  evento: LedgerEvent["evento"]
  referencia: string
  origem: LedgerEvent["origem"]
  correlacao: string
}): LedgerEvent {
  const ant = safeMoney(params.saldoAnterior)
  const delta = safeMoney(params.delta)
  return {
    saldoAnterior: ant,
    saldoPosterior: safeMoney(ant + delta),
    evento: params.evento,
    referencia: params.referencia,
    origem: params.origem,
    correlacao: params.correlacao,
  }
}

/** Identificador determinístico legível para correlacionar eventos (estorno, parcelas, etc.). */
export function buildCorrelacaoId(parts: string[]): string {
  const esc = parts.map((p) => encodeURIComponent(String(p).trim()))
  return `corr:${esc.join("|")}`
}

export function buildFinanceiroAuditTrail(events: LedgerEvent[], atIso?: string): FinanceiroAuditEntry[] {
  const at = atIso ?? new Date().toISOString()
  return events.map((e) => ({
    at,
    origem: e.origem,
    evento: e.evento,
    referencia: e.referencia,
    correlacao: e.correlacao,
    detail: `${String(e.evento)} · ref ${e.referencia} · saldo ${e.saldoAnterior}→${e.saldoPosterior}`,
    metadata: { delta: safeMoney(e.saldoPosterior - e.saldoAnterior) },
  }))
}
