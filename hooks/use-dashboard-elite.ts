"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useLojaAtiva } from "@/lib/loja-ativa"

export type DashboardEliteCards = {
  faturamentoHoje: number
  osEmAberto: number
  alertaEstoqueCount: number
  contasReceberHoje: number
}

export type DashboardEliteFaturamentoDia = {
  day: string
  total: number
}

export type DashboardEliteMovimento = {
  kind: "venda" | "os"
  id: string
  label: string
  value: number
  at: string
}

export type DashboardEliteEstoqueItem = {
  id: string
  name: string
  stock: number
}

export type DashboardEliteData = {
  ok: true
  storeId: string
  todayIso: string
  cards: DashboardEliteCards
  faturamento7d: DashboardEliteFaturamentoDia[]
  movimentos: DashboardEliteMovimento[]
  estoqueCritico: DashboardEliteEstoqueItem[]
}

type UseDashboardEliteResult = {
  data: DashboardEliteData | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  storeId: string
  hasStore: boolean
}

function parseElitePayload(json: unknown): DashboardEliteData | null {
  if (!json || typeof json !== "object") return null
  const o = json as Record<string, unknown>
  if (o.ok !== true) return null
  const cards = o.cards
  if (!cards || typeof cards !== "object") return null
  const c = cards as Record<string, unknown>
  const faturamento7d = Array.isArray(o.faturamento7d) ? o.faturamento7d : []
  const movimentos = Array.isArray(o.movimentos) ? o.movimentos : []
  const estoqueCritico = Array.isArray(o.estoqueCritico) ? o.estoqueCritico : []

  return {
    ok: true,
    storeId: typeof o.storeId === "string" ? o.storeId : "",
    todayIso: typeof o.todayIso === "string" ? o.todayIso : "",
    cards: {
      faturamentoHoje: typeof c.faturamentoHoje === "number" ? c.faturamentoHoje : 0,
      osEmAberto: typeof c.osEmAberto === "number" ? c.osEmAberto : 0,
      alertaEstoqueCount: typeof c.alertaEstoqueCount === "number" ? c.alertaEstoqueCount : 0,
      contasReceberHoje: typeof c.contasReceberHoje === "number" ? c.contasReceberHoje : 0,
    },
    faturamento7d: faturamento7d
      .map((row) => {
        if (!row || typeof row !== "object") return null
        const r = row as Record<string, unknown>
        const day = typeof r.day === "string" ? r.day : ""
        const total = typeof r.total === "number" ? r.total : 0
        return day ? { day, total } : null
      })
      .filter((x): x is DashboardEliteFaturamentoDia => x !== null),
    movimentos: movimentos as DashboardEliteMovimento[],
    estoqueCritico: estoqueCritico as DashboardEliteEstoqueItem[],
  }
}

export function useDashboardElite(): UseDashboardEliteResult {
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = lojaAtivaId?.trim() || ""
  const hasStore = Boolean(storeId)

  const [data, setData] = useState<DashboardEliteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!storeId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const headers: HeadersInit = { accept: "application/json" }
      ;(headers as Record<string, string>)[ASSISTEC_LOJA_HEADER] = storeId

      const res = await fetch("/api/dashboard/elite", {
        method: "GET",
        credentials: "include",
        headers,
        cache: "no-store",
      })

      let json: unknown = null
      try {
        json = await res.json()
      } catch {
        json = null
      }

      if (requestId !== requestIdRef.current) return

      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `Falha ao carregar painel (HTTP ${res.status})`
        setData(null)
        setError(msg)
        return
      }

      const parsed = parseElitePayload(json)
      if (!parsed) {
        setData(null)
        setError("Resposta inválida do servidor")
        return
      }

      setData(parsed)
      setError(null)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setData(null)
      setError(e instanceof Error ? e.message : "Falha de rede ao carregar painel")
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  return { data, loading, error, refresh, storeId, hasStore }
}
