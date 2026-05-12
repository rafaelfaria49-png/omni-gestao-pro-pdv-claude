"use client"

import { useCallback, useEffect, useState } from "react"

export type FinanceCard = {
  totalBalance: number
  entradas: number
  saidas: number
  lucro: number
  overdueCount: number
  pendingCount: number
}

export type FinanceAccount = {
  id: string
  name: string
  type: "cash" | "bank" | "pix" | "credit_card"
  balance: number
}

export type FinanceTransaction = {
  id: string
  type: "income" | "expense"
  status: "pending" | "paid" | "canceled"
  description: string
  amount: number
  dueDate: string
  paidAt?: string | null
  paymentMethod?: string | null
  category?: { name: string; color: string; icon: string } | null
  account?: { name: string } | null
}

export type FluxoMes = { mes: string; receitas: number; despesas: number }
export type DespesaCategoria = { name: string; value: number; color: string }

export type FinanceDashboardData = {
  cards: FinanceCard
  accounts: FinanceAccount[]
  recentTransactions: FinanceTransaction[]
  dueTodayTransactions: FinanceTransaction[]
  fluxoMensal: FluxoMes[]
  despesasPorCategoria: DespesaCategoria[]
}

const EMPTY: FinanceDashboardData = {
  cards: { totalBalance: 0, entradas: 0, saidas: 0, lucro: 0, overdueCount: 0, pendingCount: 0 },
  accounts: [],
  recentTransactions: [],
  dueTodayTransactions: [],
  fluxoMensal: [],
  despesasPorCategoria: [],
}

export function useFinanceDashboard() {
  const [data, setData] = useState<FinanceDashboardData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/finance/dashboard")
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) {
        setData({
          cards: (json.cards ?? EMPTY.cards) as FinanceCard,
          accounts: (json.accounts ?? []) as FinanceAccount[],
          recentTransactions: (json.recentTransactions ?? []) as FinanceTransaction[],
          dueTodayTransactions: (json.dueTodayTransactions ?? []) as FinanceTransaction[],
          fluxoMensal: (json.fluxoMensal ?? []) as FluxoMes[],
          despesasPorCategoria: (json.despesasPorCategoria ?? []) as DespesaCategoria[],
        })
      } else {
        setError(String(json.error ?? "Falha ao carregar"))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, reload: load }
}
