"use client"

import { useCallback, useEffect, useState } from "react"
import { CREDIT_BALANCE_UPDATED_EVENT } from "@/lib/creditsEvents"

export type CreditsHistoryItem = {
  id: string
  action: string
  cost: number
  createdAt: string
}

type CreditsHistoryResponse = {
  items?: CreditsHistoryItem[]
  error?: string
}

export function useCreditsHistory() {
  const [items, setItems] = useState<CreditsHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/credits/history", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      })
      const data = (await res.json().catch(() => ({}))) as CreditsHistoryResponse
      if (!res.ok) {
        throw new Error(String(data.error || `HTTP ${res.status}`))
      }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico.")
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

