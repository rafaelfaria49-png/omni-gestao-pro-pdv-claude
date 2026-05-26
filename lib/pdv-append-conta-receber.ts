"use client"

import type { ContaReceberRow } from "@/lib/contas-receber-types"
import { contasReceberStorageKey } from "@/lib/contas-receber-storage"

/**
 * Cria/atualiza o cache local (localStorage) do(s) título(s) "à prazo" de venda PDV.
 *
 * A persistência no banco é ATÔMICA dentro da transação de venda
 * (`lib/ops-upsert-venda.ts`, passo 6). Aqui mantemos apenas o cache que a UI
 * do Financeiro lê do localStorage + o evento de atualização.
 */
export function appendContaReceberTituloPdvAprazo(params: {
  lojaId: string
  saleId: string
  clienteNome: string
  valor: number
  aPrazoConfig?: {
    parcelas?: number
    primeiroVencimento?: string // DD/MM/YYYY
    intervalDias?: number
  }
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

  const cfg = params.aPrazoConfig
  const parcelas = Math.max(1, Math.min(24, Number(cfg?.parcelas) || 1))
  const intervalDias = Math.max(1, Number(cfg?.intervalDias) || 30)

  // Resolve primeiro vencimento
  let primeiroVenc: Date
  if (cfg?.primeiroVencimento) {
    const parts = cfg.primeiroVencimento.split("/")
    if (parts.length === 3) {
      const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
      primeiroVenc = isNaN(d.getTime()) ? new Date(Date.now() + intervalDias * 86_400_000) : d
    } else {
      primeiroVenc = new Date(Date.now() + intervalDias * 86_400_000)
    }
  } else {
    primeiroVenc = new Date()
    primeiroVenc.setDate(primeiroVenc.getDate() + intervalDias)
  }

  const valorBase = Math.round((valor / parcelas) * 100) / 100
  const newRows: ContaReceberRow[] = []

  for (let n = 1; n <= parcelas; n++) {
    const valorParcela = n === parcelas ? Math.round((valor - valorBase * (parcelas - 1)) * 100) / 100 : valorBase
    const id = parcelas === 1 ? `pdv-aprazo-${params.saleId}` : `pdv-aprazo-${params.saleId}-${n}`
    const vencDate = new Date(primeiroVenc)
    vencDate.setDate(vencDate.getDate() + (n - 1) * intervalDias)

    newRows.push({
      id,
      descricao:
        parcelas === 1
          ? `Venda PDV ${params.saleId} — À prazo`
          : `Venda PDV ${params.saleId} — À prazo ${n}/${parcelas}`,
      cliente: (params.clienteNome || "Cliente").trim(),
      valor: valorParcela,
      vencimento: vencDate.toLocaleDateString("pt-BR"),
      status: "pendente",
      tipo: "pdv_aprazo",
      total_value: valor,
      vendas: [{ saleId: params.saleId, total: valor }],
    })
  }

  // Remove entradas antigas desta venda antes de inserir as novas
  const idsNovos = new Set(newRows.map((r) => String(r.id)))
  const prefixo = `pdv-aprazo-${params.saleId}`
  const semEstaVenda = rows.filter(
    (r) => !String(r.id).startsWith(prefixo) && !idsNovos.has(String(r.id))
  )
  const next = [...semEstaVenda, ...newRows]

  try {
    localStorage.setItem(k, JSON.stringify(next))
  } catch {
    return
  }

  window.dispatchEvent(new Event("assistec-contas-receber-imported"))
}
