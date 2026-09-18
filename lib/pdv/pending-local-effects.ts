/**
 * Efeitos locais de uma tentativa de venda.
 *
 * PENDING não aplica estoque/caixa/ledger. CONFIRMED aplica no máximo uma vez.
 * Retry da mesma identidade nunca reaplica. Descarte só reverte o que foi aplicado.
 */

import type { PaymentBreakdownFull, SaleLineRecord, SaleRecord } from "@/lib/operations-sale-types"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { resolveSaleLineItemType } from "@/lib/sale-line-classification"

export type LocalStockItem = { id: string; stock: number }

export type LocalCaixaTotals = { totalEntradas: number }

export type LocalDailyLedger = {
  totalVendas: number
  vendasDinheiro: number
  vendasPix: number
  vendasCartaoDebito: number
  vendasCartaoCredito: number
  vendasCarne: number
  vendasAPrazo: number
  vendasCreditoVale: number
}

export type LocalCredits = Record<string, { nome: string; saldo: number }>

export type LocalSaleEffectsState<I extends LocalStockItem = LocalStockItem> = {
  inventory: I[]
  caixa: LocalCaixaTotals
  dailyLedger: LocalDailyLedger
  customerCredits: LocalCredits
}

export function saleHasLocalEffectsApplied(sale: Pick<SaleRecord, "localEffectsApplied">): boolean {
  return sale.localEffectsApplied === true
}

/** Novo contrato: pending nasce com `false`. Ausente = legado que já mutou caixa/ledger. */
export function shouldReverseFinanceOnPendingDiscard(
  sale: Pick<SaleRecord, "localEffectsApplied">,
): boolean {
  return sale.localEffectsApplied !== false
}

/** Estoque só reverte se esta tentativa aplicou baixa local explicitamente. */
export function shouldReverseStockOnPendingDiscard(
  sale: Pick<SaleRecord, "localEffectsApplied">,
): boolean {
  return sale.localEffectsApplied === true
}

function physicalQtyByItem(lines: readonly SaleLineRecord[]): Map<string, number> {
  const qty = new Map<string, number>()
  for (const line of lines) {
    if (resolveSaleLineItemType(line) !== "produto" || isVirtualSaleLine(line.inventoryId)) continue
    const id = String(line.inventoryId ?? "").trim()
    const q = typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0
    if (!id || q <= 0) continue
    qty.set(id, (qty.get(id) ?? 0) + q)
  }
  return qty
}

function applyStockDelta<I extends LocalStockItem>(
  inventory: I[],
  lines: readonly SaleLineRecord[],
  sign: 1 | -1,
): I[] {
  const qty = physicalQtyByItem(lines)
  if (qty.size === 0) return inventory
  return inventory.map((item) => {
    const delta = qty.get(item.id)
    if (!delta) return item
    return { ...item, stock: Math.max(0, item.stock + sign * delta) }
  })
}

function applyFinanceDelta<L extends LocalDailyLedger>(
  state: { caixa: LocalCaixaTotals; dailyLedger: L; customerCredits: LocalCredits },
  sale: Pick<SaleRecord, "total" | "paymentBreakdown" | "customerCpf" | "customerName">,
  sign: 1 | -1,
): { caixa: LocalCaixaTotals; dailyLedger: L; customerCredits: LocalCredits } {
  const pb: PaymentBreakdownFull = sale.paymentBreakdown
  const total = Number(sale.total) || 0
  const caixaDelta = total - (pb.aPrazo ?? 0)
  const nextLedger = {
    ...state.dailyLedger,
    totalVendas: state.dailyLedger.totalVendas + sign * total,
    vendasDinheiro: state.dailyLedger.vendasDinheiro + sign * pb.dinheiro,
    vendasPix: state.dailyLedger.vendasPix + sign * pb.pix,
    vendasCartaoDebito: state.dailyLedger.vendasCartaoDebito + sign * pb.cartaoDebito,
    vendasCartaoCredito: state.dailyLedger.vendasCartaoCredito + sign * pb.cartaoCredito,
    vendasCarne: state.dailyLedger.vendasCarne + sign * pb.carne,
    vendasAPrazo: (state.dailyLedger.vendasAPrazo ?? 0) + sign * pb.aPrazo,
    vendasCreditoVale: state.dailyLedger.vendasCreditoVale + sign * pb.creditoVale,
  } as L
  const nextCaixa = { totalEntradas: state.caixa.totalEntradas + sign * caixaDelta }
  const credits = { ...state.customerCredits }
  const cpf = sale.customerCpf?.trim() ?? ""
  if (cpf && pb.creditoVale > 0) {
    const atual = credits[cpf]
    const saldo = (atual?.saldo ?? 0) + sign * -pb.creditoVale
    credits[cpf] = {
      nome: sale.customerName?.trim() || atual?.nome || "Cliente",
      saldo: Math.max(0, Math.round(saldo * 100) / 100),
    }
  }
  return { caixa: nextCaixa, dailyLedger: nextLedger, customerCredits: credits }
}

/**
 * Aplica efeitos locais no máximo uma vez. Retry da mesma sale é no-op.
 * Por padrão NÃO toca estoque (fonte autoritativa = servidor após CONFIRMED).
 */
export function applyConfirmedLocalEffects<I extends LocalStockItem, L extends LocalDailyLedger>(
  state: LocalSaleEffectsState<I> & { dailyLedger: L },
  sale: Pick<SaleRecord, "total" | "paymentBreakdown" | "customerCpf" | "customerName" | "lines" | "localEffectsApplied">,
  opts?: { applyStock?: boolean },
): { state: LocalSaleEffectsState<I> & { dailyLedger: L }; applied: boolean } {
  if (saleHasLocalEffectsApplied(sale)) return { state, applied: false }
  const finance = applyFinanceDelta(state, sale, 1)
  const inventory = opts?.applyStock === true ? applyStockDelta(state.inventory, sale.lines ?? [], -1) : state.inventory
  return {
    applied: true,
    state: {
      inventory,
      caixa: finance.caixa,
      dailyLedger: finance.dailyLedger,
      customerCredits: finance.customerCredits,
    },
  }
}

export function reverseAppliedLocalEffects<I extends LocalStockItem, L extends LocalDailyLedger>(
  state: LocalSaleEffectsState<I> & { dailyLedger: L },
  sale: Pick<SaleRecord, "total" | "paymentBreakdown" | "customerCpf" | "customerName" | "lines" | "localEffectsApplied">,
  opts?: { applyStock?: boolean; reverseFinance?: boolean },
): { state: LocalSaleEffectsState<I> & { dailyLedger: L }; reversed: boolean } {
  const reverseFinance = opts?.reverseFinance ?? saleHasLocalEffectsApplied(sale)
  const reverseStock = opts?.applyStock === true && shouldReverseStockOnPendingDiscard(sale)
  if (!reverseFinance && !reverseStock) return { state, reversed: false }
  const finance = reverseFinance ? applyFinanceDelta(state, sale, -1) : state
  const inventory = reverseStock ? applyStockDelta(state.inventory, sale.lines ?? [], 1) : state.inventory
  return {
    reversed: true,
    state: {
      inventory,
      caixa: finance.caixa,
      dailyLedger: finance.dailyLedger as L,
      customerCredits: finance.customerCredits,
    },
  }
}

/** Hydrate: PENDING nunca reduz o catálogo do servidor. */
export function hydrateInventoryFromServer(
  serverItems: LocalStockItem[],
  _pendingSales: readonly Pick<SaleRecord, "syncPending" | "lines">[],
): LocalStockItem[] {
  void _pendingSales
  return serverItems.map((item) => ({ ...item }))
}

export function stockOf(items: readonly LocalStockItem[], id: string): number {
  return items.find((item) => item.id === id)?.stock ?? 0
}
