"use client"

import { useCallback, useEffect, useState } from "react"
import { CREDIT_BALANCE_UPDATED_EVENT } from "@/lib/creditsEvents"

type CreditsResponse = { credits?: number }

export function useUserCredits() {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/user/credits", { method: "GET", cache: "no-store", credentials: "include" })
      const data = (await res.json().catch(() => ({}))) as CreditsResponse & { error?: string }
      if (!res.ok) {
        throw new Error(String(data.error || `HTTP ${res.status}`))
      }
      const value = typeof data.credits === "number" ? data.credits : Number(data.credits ?? 0)
      setCredits(Number.isFinite(value) ? value : 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar créditos")
      setCredits(null)
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

  return { credits, loading, error, refetch }
}

