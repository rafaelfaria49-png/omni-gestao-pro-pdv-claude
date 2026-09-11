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

/** Evento definitivo de venda. Só este evento migrou para dispatch server-side. */
export const SALE_FINALIZADA_EVENT = "venda_finalizada" as const

/** Recorte mínimo da venda confirmada necessário ao dispatch. */
export type SaleAutomationSaleView = {
  storeId: string
  pedidoId: string
  clientSaleId?: string | null
  total?: number
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

/** Payload server-side: `storeId` sempre explícito (multiloja), sem fallback. */
export function buildSaleFinalizadaPayload(
  storeId: string,
  venda: { pedidoId: string; clientSaleId?: string | null; total?: number },
): EventPayload {
  const sid = storeId.trim()
  const clientSaleId =
    typeof venda.clientSaleId === "string" && venda.clientSaleId.trim()
      ? venda.clientSaleId.trim()
      : null
  return {
    storeId: sid,
    entityId: clientSaleId ?? venda.pedidoId,
    data: {
      pedidoId: venda.pedidoId,
      ...(clientSaleId ? { clientSaleId } : {}),
      ...(typeof venda.total === "number" ? { total: venda.total } : {}),
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
  input: { replayed: boolean; storeId: string; venda: SaleAutomationSaleView },
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
    await run(SALE_FINALIZADA_EVENT, buildSaleFinalizadaPayload(input.storeId, input.venda))
    return { dispatched: true }
  } catch (error) {
    onError?.(error)
    return { dispatched: false }
  }
}
