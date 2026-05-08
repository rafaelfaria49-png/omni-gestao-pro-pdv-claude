import { normalizePagarStatus, normalizeReceberStatus, PAGAR_STATUS, RECEBER_STATUS } from "@/lib/financeiro/contracts/status"
import { safeMoney, sumMoney } from "@/lib/financeiro/contracts/valores"
import type { Carteira } from "@/lib/financeiro/types/carteira"
import type { Movimento } from "@/lib/financeiro/types/movimento"
import { isMovimentoConfirmado } from "@/lib/financeiro/services/movimento-service"

/** Soma algebrica de movimentos confirmados (entrada +, saída -). */
export function calculateSaldo(movimentos: Movimento[]): number {
  let t = 0
  for (const m of movimentos) {
    if (!isMovimentoConfirmado(m)) continue
    const v = safeMoney(m.valor)
    t += m.tipo === "entrada" ? v : -v
  }
  return safeMoney(t)
}

export function calculateSaldoCarteira(carteira: Carteira, movimentosDaCarteira: Movimento[]): number {
  const base = safeMoney(carteira.saldoInicial)
  const delta = calculateSaldo(movimentosDaCarteira.filter((m) => m.carteiraId === carteira.id))
  return safeMoney(base + delta)
}

export type FluxoPeriodoResumo = {
  entradas: number
  saidas: number
  liquido: number
}

export function calculateFluxoPeriodo(
  movimentos: Movimento[],
  inicioIso: string,
  fimIso: string,
): FluxoPeriodoResumo {
  const t0 = new Date(inicioIso).getTime()
  const t1 = new Date(fimIso).getTime()
  let entradas = 0
  let saidas = 0
  for (const m of movimentos) {
    if (!isMovimentoConfirmado(m)) continue
    const tm = new Date(m.createdAt).getTime()
    if (tm < t0 || tm > t1) continue
    const v = safeMoney(m.valor)
    if (m.tipo === "entrada") entradas += v
    else saidas += v
  }
  entradas = safeMoney(entradas)
  saidas = safeMoney(saidas)
  return { entradas, saidas, liquido: safeMoney(entradas - saidas) }
}

/**
 * Valor ainda não recebido (títulos em aberto).
 * Considera pendente, parcial e vencido; ignora pago, cancelado e estornado.
 */
export function calculateReceberPrevisto(titulos: { valor: number; status?: string | null }[]): number {
  let t = 0
  for (const row of titulos) {
    const s = normalizeReceberStatus(row.status)
    if (
      s === RECEBER_STATUS.PAGO ||
      s === RECEBER_STATUS.CANCELADO ||
      s === RECEBER_STATUS.ESTORNADO ||
      s === null
    ) {
      continue
    }
    t += safeMoney(row.valor)
  }
  return safeMoney(t)
}

export function calculatePagarPrevisto(titulos: { valor: number; status?: string | null }[]): number {
  let t = 0
  for (const row of titulos) {
    const s = normalizePagarStatus(row.status)
    if (
      s === PAGAR_STATUS.PAGO ||
      s === PAGAR_STATUS.CANCELADO ||
      s === PAGAR_STATUS.ESTORNADO ||
      s === null
    ) {
      continue
    }
    t += safeMoney(row.valor)
  }
  return safeMoney(t)
}

export function calculateSaldoConsolidadoCarteiras(carteiras: Carteira[], movimentos: Movimento[]): number {
  return sumMoney(...carteiras.map((c) => calculateSaldoCarteira(c, movimentos)))
}
