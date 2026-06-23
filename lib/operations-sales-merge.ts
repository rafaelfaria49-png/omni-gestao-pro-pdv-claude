import type { SaleRecord } from "@/lib/operations-sale-types"

/**
 * Mescla vendas do Postgres preservando o que já veio do localStorage (mesmo `id`),
 * EXCETO o `status`, que é a coluna autoritativa do banco. O payload JSONB da venda
 * local não é reescrito no cancelamento (feito na tela Vendas / servidor), então sem
 * propagar o `status` remoto a venda cancelada continuaria contando como concluída no
 * caixa/fechamento. Apenas `status` (e a baixa de `syncPending`) é sincronizado —
 * `lines`/`qtyReturned` permanecem locais para não descartar devolução offline pendente.
 *
 * Função PURA (sem React) para ser testável de forma isolada.
 */
export function mergeSalesById(local: SaleRecord[], remote: SaleRecord[]): SaleRecord[] {
  const remoteById = new Map<string, SaleRecord>()
  for (const r of remote) {
    if (r.id) remoteById.set(r.id, r)
  }
  let changed = false
  const mergedLocal = local.map((s) => {
    const r = s.id ? remoteById.get(s.id) : undefined
    if (!r) return s
    // Nunca apaga um status local com `undefined` remoto (legado): só sobrescreve quando
    // o servidor tem um status concreto.
    const nextStatus = r.status ?? s.status
    const clearPending = s.syncPending === true
    if (nextStatus !== s.status || clearPending) {
      changed = true
      return { ...s, status: nextStatus, ...(clearPending ? { syncPending: false } : {}) }
    }
    return s
  })
  const ids = new Set(mergedLocal.map((s) => s.id))
  const extra = remote.filter((s) => s.id && !ids.has(s.id))
  if (extra.length === 0 && !changed) return local
  return [...mergedLocal, ...extra].sort((a, b) => a.at.localeCompare(b.at))
}
