"use client"

import { useCallback, useEffect, useState } from "react"
import { CREDIT_BALANCE_UPDATED_EVENT } from "@/lib/creditsEvents"

export type CreditPurchaseHistoryItem = {
  id: string
  package: string
  credits: number
  amount: number
  status: string
  createdAt: string
}

type PurchasesResponse = {
  items?: CreditPurchaseHistoryItem[]
  error?: string
}

export function useCreditPurchasesHistory() {
  const [items, setItems] = useState<CreditPurchaseHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/credits/purchases/history", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
      const data = (await res.json().catch(() => ({}))) as PurchasesResponse
      if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`))
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico de compras.")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const handler = () => {
      void refetch()
    }
    window.addEventListener(CREDIT_BALANCE_UPDATED_EVENT, handler)
    return () => window.removeEventListener(CREDIT_BALANCE_UPDATED_EVENT, handler)
  }, [refetch])

  return { items, loading, error, refetch }
}

