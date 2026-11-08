import type { SaleRecord } from "@/lib/operations-sale-types"
import { isSaleIdentityConflictCode } from "@/lib/vendas/sale-identity-conflict"
import { stripClientSyncFlags } from "@/lib/vendas/sale-sync-flags"
import { compareSaleAtAsc, isRecord } from "@/lib/pdv-mount-guards"

function reconcileConfirmed(
  local: SaleRecord,
  remote: SaleRecord,
): SaleRecord {
  if (remote.manualKgSale === "classic-manual-kg-v1" && selectManualKgSnapshot(local, remote) === local) return local
  const nextStatus = remote.status ?? local.status
  const confirmed: SaleRecord = {
    ...stripClientSyncFlags(local),
    ...(remote.manualKgSale === "classic-manual-kg-v1" ? { ...stripClientSyncFlags(remote), localEffectsApplied: local.localEffectsApplied } : {}),
    id: remote.id,
    serverId: remote.serverId ?? local.serverId,
    clientSaleId: local.clientSaleId ?? remote.clientSaleId,
    status: nextStatus,
    syncPending: false,
  }
  delete confirmed.syncBlockedCode
  return confirmed
}

function sameClientSaleId(local: SaleRecord, remote: SaleRecord): boolean {
  return Boolean(local.clientSaleId && remote.clientSaleId && local.clientSaleId === remote.clientSaleId)
}

function isDistinctIdentityCollision(local: SaleRecord, remote: SaleRecord): boolean {
  if (sameClientSaleId(local, remote)) return false
  if (local.clientSaleId && remote.clientSaleId && local.clientSaleId !== remote.clientSaleId) {
    return true
  }
  return isSaleIdentityConflictCode(local.syncBlockedCode)
}

/**
 * Mescla vendas do Postgres com o localStorage.
 *
 * V1: casa por `id` (`pedidoId`), preservando `status` autoritativo do banco.
 * V2: casa por `clientSaleId`. Local provisório `PEND-…` reconcilia in-place para o
 * `pedidoId` remoto. Colisão de `pedidoId` com `clientSaleId` diferente NÃO confirma
 * a cópia local — as duas entidades permanecem na projeção.
 */
export function mergeSalesById(local: SaleRecord[], remote: SaleRecord[]): SaleRecord[] {
  // P0 PDV-RAFACELL-LOAD-CRASH: entradas nulas/não-objeto (restore parcial,
  // payload legado) não carregam dado — descartar aqui impede que UMA entrada
  // inválida derrube o mount do PDV inteiro. Objetos são sempre preservados.
  const localArr = Array.isArray(local) ? local : []
  const remoteArr = Array.isArray(remote) ? remote : []
  const cleanLocal = localArr.filter(isRecord) as SaleRecord[]
  const cleanRemote = remoteArr.filter(isRecord) as SaleRecord[]
  // Preserva identidade de referência quando nada foi saneado (evita re-render).
  const localKept = cleanLocal.length === localArr.length ? localArr : cleanLocal
  const remoteByClientSaleId = new Map<string, SaleRecord>()
  const remoteById = new Map<string, SaleRecord>()
  for (const r of cleanRemote) {
    if (r.clientSaleId) remoteByClientSaleId.set(r.clientSaleId, r)
    if (r.id) remoteById.set(r.id, r)
  }

  let changed = false
  const consumedRemote = new Set<SaleRecord>()
  const mergedLocal = cleanLocal.map((s) => {
    const remoteByKey = s.clientSaleId ? remoteByClientSaleId.get(s.clientSaleId) : undefined
    if (remoteByKey) {
      consumedRemote.add(remoteByKey)
      const next = reconcileConfirmed(s, remoteByKey)
      if (
        (remoteByKey.manualKgSale === "classic-manual-kg-v1" && JSON.stringify(next) !== JSON.stringify(s)) ||
        next.id !== s.id ||
        next.status !== s.status ||
        next.serverId !== s.serverId ||
        s.syncPending === true ||
        s.syncBlockedCode !== undefined
      ) {
        changed = true
        return next
      }
      return s
    }

    const r = s.id ? remoteById.get(s.id) : undefined
    if (!r) return s

    if (isDistinctIdentityCollision(s, r)) {
      if (s.syncPending === true && isSaleIdentityConflictCode(s.syncBlockedCode)) return s
      changed = true
      return { ...s, syncPending: true }
    }

    consumedRemote.add(r)
    if (r.manualKgSale === "classic-manual-kg-v1") {
      const next = reconcileConfirmed(s, r)
      if (JSON.stringify(next) !== JSON.stringify(s)) { changed = true; return next }
      return s
    }
    const nextStatus = r.status ?? s.status
    const limpaMarcadores = s.syncPending === true || s.syncBlockedCode !== undefined
    if (nextStatus !== s.status || limpaMarcadores) {
      changed = true
      return limpaMarcadores
        ? { ...stripClientSyncFlags(s), status: nextStatus, syncPending: false }
        : { ...s, status: nextStatus }
    }
    return s
  })

  const extra = cleanRemote
    .filter((s) => s.id && !consumedRemote.has(s))
    .map((s) => stripClientSyncFlags(s))
  if (extra.length === 0 && !changed) return localKept
  // P0 PDV-RAFACELL-LOAD-CRASH: `at` ausente/não-string (venda legada ou restore
  // parcial) não pode lançar no sort e derrubar a rota.
  return [...mergedLocal, ...extra].sort(compareSaleAtAsc)
}

/** Only adjust a cash projection this terminal previously applied. Remote imports remain reads. */
export function kgCashProjectionDelta(local: SaleRecord[], remote: SaleRecord[], scope?: { ledgerDate?: string; sessaoId?: string | null }): number {
  const cashOnly = (sale: SaleRecord) => !!sale.paymentBreakdown && sale.paymentBreakdown.dinheiro === sale.total && Object.entries(sale.paymentBreakdown).every(([key, value]) => key === "dinheiro" || !value)
  let cents = 0
  for (const sale of remote) {
    if (sale.manualKgSale !== "classic-manual-kg-v1" || !cashOnly(sale)) continue
    if (scope && (("sessaoId" in scope && (!scope.sessaoId || sale.sessaoId !== scope.sessaoId)) || (scope.ledgerDate && (typeof sale.at !== "string" || sale.at.slice(0, 10) !== scope.ledgerDate)))) continue
    const previous = local.find((item) => (sale.clientSaleId && item.clientSaleId === sale.clientSaleId) || item.id === sale.id)
    if (!previous || previous.localEffectsApplied !== true || previous.manualKgSale !== "classic-manual-kg-v1" || !cashOnly(previous)) continue
    if (selectManualKgSnapshot(previous, sale) === previous) continue
    if (previous.clientSaleId && sale.clientSaleId && previous.clientSaleId !== sale.clientSaleId) continue
    const before = previous.status === "cancelada" ? 0 : Math.round(previous.total * 100)
    const after = sale.status === "cancelada" ? 0 : Math.round(sale.total * 100)
    cents += after - before
  }
  return cents / 100
}

/** Shared monotonic selection for cache merge, effects and delayed confirmations. */
export function selectManualKgSnapshot(local: SaleRecord, remote: SaleRecord): SaleRecord {
  if (local.manualKgSale !== "classic-manual-kg-v1") return remote
  if ((local.clientSaleId && remote.clientSaleId && local.clientSaleId !== remote.clientSaleId) || (local.serverId && remote.serverId && local.serverId !== remote.serverId)) return local
  const revision = (sale: SaleRecord) => typeof sale.manualKgRevision === "number" && Number.isSafeInteger(sale.manualKgRevision) && sale.manualKgRevision >= 0 ? sale.manualKgRevision : 0
  if (revision(remote) < revision(local)) return local
  if (local.status === "cancelada" && remote.status !== "cancelada") return local
  return remote
}
