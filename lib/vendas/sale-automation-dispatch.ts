/**
 * Dispatch server-side da automação definitiva de venda — CORREÇÃO-01.
 *
 * Problema: o `venda_finalizada` nascia no browser (`emitEvent` → wildcard
 * `initAutomationEngineClient` → POST /api/automation/handle-event). Cada aba
 * aberta postava a MESMA confirmação de novo; reload/retry repetiam o POST.
 * O `Set` em memória (`createConfirmedSaleEmitter`) não atravessa abas nem
 * sobrevive a reload — nunca foi autoridade de idempotência.
 *
 * Decisão: a automação definitiva nasce SOMENTE do ponto durável
 * create-vs-replay das rotas `venda-persist` (V1/V2), que já devolvem
 * `result.replayed` ancorado em unique constraints reais:
 * - V2: unique `(storeId, clientSaleId)` (migration 0016);
 * - V1: unique global `pedidoId` + fingerprint fail-closed.
 * Create (`replayed: false`) dispara UMA vez; replay/retry/concorrência
 * perdedora (`replayed: true`) nunca redispara. Nenhum Set, localStorage,
 * BroadcastChannel, Web Lock ou flag de browser participa da decisão.
 *
 * Separação explícita:
 * - notificação local de UI → event-bus do browser (refresh de listas);
 * - dispatch da automação definitiva → server-side, aqui.
 *
 * Módulo PURO (zero Prisma, zero I/O, zero relógio): o executor real
 * (`handleEvent`) é injetado pelo caller (rotas). Falha da automação nunca
 * falha a venda (ver `dispatchSaleAutomationIfCreated`).
 *
 * Honestidade (ressalva B — sem outbox, sem "exactly-once" matemático): se o
 * processo cair ENTRE o commit da venda e o dispatch, a automação dessa venda
 * não é entregue (under-delivery); o retry posterior é replay e também não
 * dispara. O que este módulo garante é NO DUPLICATE AUTOMATION — nunca duas
 * automações reais para a mesma confirmação.
 */

import type { EventPayload, SystemEvent } from "@/lib/events/event-bus"
import { sanitizeSaleLinesPayload } from "@/lib/vendas/sanitize-sale-line-payload"
import type { SalePayload } from "@/lib/ops-upsert-venda"

/** Evento definitivo de venda. Só este evento migrou para dispatch server-side. */
export const SALE_FINALIZADA_EVENT = "venda_finalizada" as const

/**
 * Recorte da venda confirmada e contexto de entrada necessário ao dispatch.
 * Compatível com `VendaPersistView` retornado por `upsertVendaInTransaction` / `persistSaleV2`.
 */
export type SaleAutomationSaleView = {
  storeId?: string
  pedidoId: string
  clientSaleId?: string | null
  total?: number
  at?: string
  clienteNome?: string | null
  customerName?: string | null
  customerCpf?: string | null
  clienteId?: string | null
  terminalId?: string | null
  cashierId?: string | null
  sessaoId?: string | null
  paymentBreakdown?: Record<string, unknown> | null
  lines?: unknown[] | null
  pixQrKind?: string | null
  cashTendered?: number | null
  linkedOsId?: string | null
  aPrazoConfig?: unknown | null
  discountAuthorizedByAdminId?: string | null
  discountReais?: number | null
  discountPercent?: number | null
}

export type SaleAutomationDispatchInput = {
  replayed: boolean
  storeId: string
  venda: SaleAutomationSaleView
  sale?: Partial<SalePayload> | null
}

export type SaleAutomationRunner = (
  event: SystemEvent,
  payload: EventPayload,
) => Promise<unknown> | unknown

/**
 * Chave durável de dedupe: `storeId + identidade`. A identidade técnica
 * (`clientSaleId`, fluxo V2) tem precedência; sem ela, o número comercial
 * (`pedidoId`, fluxo V1). Lojas distintas nunca compartilham a chave (a
 * unique V2 é composta por `(storeId, clientSaleId)` e a V1 valida a loja).
 * Retorna `null` quando não há identidade mínima — o caller não dispara.
 */
export function buildSaleAutomationDedupeKey(input: {
  storeId: string
  clientSaleId?: string | null
  pedidoId?: string
}): string | null {
  const storeId = typeof input.storeId === "string" ? input.storeId.trim() : ""
  if (!storeId) return null
  const tech =
    (typeof input.clientSaleId === "string" ? input.clientSaleId.trim() : "") ||
    (typeof input.pedidoId === "string" ? input.pedidoId.trim() : "")
  if (!tech) return null
  return `${storeId}::${tech}`
}

/**
 * Somente create dispara. Replay (retry, reenvio, aba concorrente perdedora,
 * recovery com evidência) nunca. Decisão pura sobre o flag durável — nenhuma
 * memória de instância, então reload/nova instância não resetam nada.
 */
export function shouldDispatchSaleAutomation(replayed: boolean): boolean {
  return replayed !== true
}

/**
 * Payload server-side: restaura paridade funcional com o contrato anterior do browser
 * (CORREÇÃO-02), preservando identidade confirmada, cliente, template, pagamentos e linhas,
 * sem propagar flags transitórias de UI (syncPending, syncBlockedCode).
 */
export function buildSaleFinalizadaPayload(
  storeId: string,
  venda: SaleAutomationSaleView,
  sale?: Partial<SalePayload> | null,
): EventPayload {
  const sid = storeId.trim()
  const rawClientSaleId = venda.clientSaleId ?? sale?.clientSaleId
  const clientSaleId =
    typeof rawClientSaleId === "string" && rawClientSaleId.trim()
      ? rawClientSaleId.trim()
      : null

  const rawCustomerName =
    venda.customerName ?? venda.clienteNome ?? sale?.customerName
  const customerName =
    typeof rawCustomerName === "string" && rawCustomerName.trim()
      ? rawCustomerName.trim()
      : undefined

  const rawCustomerCpf = venda.customerCpf ?? sale?.customerCpf
  const customerCpf =
    typeof rawCustomerCpf === "string" && rawCustomerCpf.trim()
      ? rawCustomerCpf.trim()
      : undefined

  const rawClienteId = venda.clienteId ?? sale?.clienteId
  const clienteId =
    typeof rawClienteId === "string" && rawClienteId.trim()
      ? rawClienteId.trim()
      : undefined

  const rawAt = venda.at ?? sale?.at
  const at = typeof rawAt === "string" && rawAt.trim() ? rawAt.trim() : undefined

  const total =
    typeof venda.total === "number"
      ? venda.total
      : typeof sale?.total === "number"
        ? sale.total
        : undefined

  const paymentBreakdown =
    (venda.paymentBreakdown && typeof venda.paymentBreakdown === "object"
      ? venda.paymentBreakdown
      : null) ??
    (sale?.paymentBreakdown && typeof sale.paymentBreakdown === "object"
      ? (sale.paymentBreakdown as Record<string, unknown>)
      : undefined)

  const rawLines = venda.lines ?? sale?.lines
  const lines = Array.isArray(rawLines)
    ? sanitizeSaleLinesPayload(rawLines).lines
    : undefined

  const rawCashierId = venda.cashierId ?? sale?.cashierId
  const cashierId =
    typeof rawCashierId === "string" && rawCashierId.trim()
      ? rawCashierId.trim()
      : undefined

  const rawSessaoId = venda.sessaoId ?? sale?.sessaoId
  const sessaoId =
    typeof rawSessaoId === "string" && rawSessaoId.trim()
      ? rawSessaoId.trim()
      : undefined

  const rawTerminalId = venda.terminalId ?? sale?.terminalId
  const terminalId =
    typeof rawTerminalId === "string" && rawTerminalId.trim()
      ? rawTerminalId.trim()
      : undefined

  const rawPixQrKind = venda.pixQrKind ?? sale?.pixQrKind
  const pixQrKind =
    typeof rawPixQrKind === "string" && rawPixQrKind.trim()
      ? rawPixQrKind.trim()
      : undefined

  const rawCashTendered = venda.cashTendered ?? sale?.cashTendered
  const cashTendered =
    typeof rawCashTendered === "number" && Number.isFinite(rawCashTendered)
      ? rawCashTendered
      : undefined

  const rawLinkedOsId = venda.linkedOsId ?? sale?.linkedOsId
  const linkedOsId =
    typeof rawLinkedOsId === "string" && rawLinkedOsId.trim()
      ? rawLinkedOsId.trim()
      : undefined

  const aPrazoConfig =
    (venda.aPrazoConfig && typeof venda.aPrazoConfig === "object"
      ? venda.aPrazoConfig
      : null) ??
    (sale?.aPrazoConfig && typeof sale.aPrazoConfig === "object"
      ? sale.aPrazoConfig
      : undefined)

  const rawSaleObj = sale as Record<string, unknown> | null | undefined
  const rawDiscountAuth =
    venda.discountAuthorizedByAdminId ??
    (typeof rawSaleObj?.discountAuthorizedByAdminId === "string"
      ? rawSaleObj.discountAuthorizedByAdminId
      : undefined)
  const discountAuthorizedByAdminId =
    typeof rawDiscountAuth === "string" && rawDiscountAuth.trim()
      ? rawDiscountAuth.trim()
      : undefined

  const rawDiscountReais =
    venda.discountReais ??
    (typeof rawSaleObj?.discountReais === "number"
      ? rawSaleObj.discountReais
      : undefined)
  const discountReais =
    typeof rawDiscountReais === "number" && Number.isFinite(rawDiscountReais)
      ? rawDiscountReais
      : undefined

  const rawDiscountPercent =
    venda.discountPercent ??
    (typeof rawSaleObj?.discountPercent === "number"
      ? rawSaleObj.discountPercent
      : undefined)
  const discountPercent =
    typeof rawDiscountPercent === "number" && Number.isFinite(rawDiscountPercent)
      ? rawDiscountPercent
      : undefined

  return {
    storeId: sid,
    entityId: clientSaleId ?? venda.pedidoId,
    data: {
      id: venda.pedidoId,
      pedidoId: venda.pedidoId,
      ...(clientSaleId ? { clientSaleId } : {}),
      ...(at ? { at } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(customerName ? { customerName } : {}),
      ...(customerCpf ? { customerCpf } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(paymentBreakdown ? { paymentBreakdown } : {}),
      ...(lines !== undefined ? { lines } : {}),
      ...(cashierId ? { cashierId } : {}),
      ...(sessaoId ? { sessaoId } : {}),
      ...(terminalId ? { terminalId } : {}),
      ...(pixQrKind ? { pixQrKind } : {}),
      ...(cashTendered !== undefined ? { cashTendered } : {}),
      ...(linkedOsId ? { linkedOsId } : {}),
      ...(aPrazoConfig ? { aPrazoConfig } : {}),
      ...(discountAuthorizedByAdminId ? { discountAuthorizedByAdminId } : {}),
      ...(discountReais !== undefined ? { discountReais } : {}),
      ...(discountPercent !== undefined ? { discountPercent } : {}),
      source: "venda-persist-create",
    },
  }
}

/**
 * Disparo seguro pós-commit. Roda o executor e:
 * - pula sem executar quando `replayed` (replay nunca redispara);
 * - engole falha do executor (automação NÃO desfaz a venda, NÃO a torna
 *   PENDING, NÃO retorna erro de persistência, NÃO duplica venda no retry).
 * Retorna se a automação foi efetivamente despachada.
 */
export async function dispatchSaleAutomationIfCreated(
  input: SaleAutomationDispatchInput,
  run: SaleAutomationRunner,
  onError?: (error: unknown) => void,
): Promise<{ dispatched: boolean }> {
  if (!shouldDispatchSaleAutomation(input.replayed)) return { dispatched: false }
  const key = buildSaleAutomationDedupeKey({
    storeId: input.storeId,
    clientSaleId: input.venda.clientSaleId,
    pedidoId: input.venda.pedidoId,
  })
  if (!key) return { dispatched: false }
  try {
    await run(
      SALE_FINALIZADA_EVENT,
      buildSaleFinalizadaPayload(input.storeId, input.venda, input.sale),
    )
    return { dispatched: true }
  } catch (error) {
    onError?.(error)
    return { dispatched: false }
  }
}
