"use client"

import type { ContaReceberRow } from "@/lib/contas-receber-types"
import { contasReceberStorageKey } from "@/lib/contas-receber-storage"

/**
 * Cria/atualiza o cache local (localStorage) do título “à prazo” de venda PDV.
 *
 * A persistência no banco agora é ATÔMICA dentro da transação de venda
 * (`lib/ops-upsert-venda.ts`, passo 6, via `venda-persist` com reenvio
 * `syncPending`). Aqui mantemos apenas o cache que a UI do Financeiro lê do
 * localStorage + o evento de atualização — sem mais fetch fire-and-forget.
 */
export function appendContaReceberTituloPdvAprazo(params: {
  lojaId: string
  saleId: string
  clienteNome: string
  valor: number
}): void {
  if (typeof window === "undefined") return
  const valor = Math.round(params.valor * 100) / 100
  if (!(valor > 0)) return

  const k = contasReceberStorageKey(params.lojaId)
  let rows: ContaReceberRow[] = []
  try {
    const raw = localStorage.getItem(k)
    if (raw) {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) rows = p as ContaReceberRow[]
    }
  } catch {
    rows = []
  }

  const venc = new Date()
  venc.setDate(venc.getDate() + 30)
  const id = `pdv-aprazo-${params.saleId}`
  const row: ContaReceberRow = {
    id,
    descricao: `Venda PDV ${params.saleId} — À prazo`,
    cliente: (params.clienteNome || "Cliente").trim(),
    valor,
    vencimento: venc.toLocaleDateString("pt-BR"),
    status: "pendente",
    tipo: "pdv_aprazo",
    total_value: valor,
    vendas: [{ saleId: params.saleId, total: valor }],
  }

  const next = [...rows.filter((r) => String(r.id) !== id), row]
  try {
    localStorage.setItem(k, JSON.stringify(next))
  } catch {
    return
  }

  // Persistência no banco é feita atomicamente na transação de venda
  // (ops-upsert-venda.ts passo 6). Não há mais POST fire-and-forget aqui.

  window.dispatchEvent(new Event("assistec-contas-receber-imported"))
}
