"use client"

import { useCallback, useEffect, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { MarketplaceConnectionDTO, MarketplaceProviderCode } from "@/lib/marketplace/connection-api-types"

type ApiList = { connections: MarketplaceConnectionDTO[] }

function headersJson(storeId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    [ASSISTEC_LOJA_HEADER]: storeId,
  }
}

export function useMarketplaceConnections(storeId: string | null) {
  const [connections, setConnections] = useState<MarketplaceConnectionDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!storeId?.trim()) {
      setConnections([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/marketplace/connections", {
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: storeId.trim() },
      })
      const j = (await r.json().catch(() => null)) as ApiList & { error?: string }
      if (!r.ok) {
        setError(j?.error || `Erro ${r.status}`)
        setConnections([])
        return
      }
      setConnections(Array.isArray(j?.connections) ? j.connections : [])
    } catch {
      setError("Falha ao carregar conexões")
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const connect = useCallback(
    async (provider: MarketplaceProviderCode, accountName?: string) => {
      if (!storeId?.trim()) return { ok: false as const, error: "Selecione a unidade no cabeçalho." }
      const r = await fetch("/api/marketplace/connections", {
        method: "POST",
        credentials: "include",
        headers: headersJson(storeId.trim()),
        body: JSON.stringify({ provider, accountName: accountName?.trim() || undefined }),
      })
      const j = (await r.json().catch(() => null)) as { connection?: MarketplaceConnectionDTO; error?: string }
      if (!r.ok) return { ok: false as const, error: j?.error || `Erro ${r.status}` }
      await refetch()
      return { ok: true as const, connection: j.connection }
    },
    [storeId, refetch]
  )

  const disconnect = useCallback(
    async (id: string) => {
      if (!storeId?.trim()) return { ok: false as const, error: "Selecione a unidade no cabeçalho." }
      const r = await fetch(`/api/marketplace/connections/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { [ASSISTEC_LOJA_HEADER]: storeId.trim() },
      })
      const j = (await r.json().catch(() => null)) as { error?: string }
      if (!r.ok) return { ok: false as const, error: j?.error || `Erro ${r.status}` }
      await refetch()
      return { ok: true as const }
    },
    [storeId, refetch]
  )

  const simulateSync = useCallback(
    async (id: string) => {
      if (!storeId?.trim()) return { ok: false as const, error: "Selecione a unidade no cabeçalho." }
      const r = await fetch(`/api/marketplace/connections/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: headersJson(storeId.trim()),
        body: JSON.stringify({ simulateSync: true }),
      })
      const j = (await r.json().catch(() => null)) as { connection?: MarketplaceConnectionDTO; error?: string }
      if (!r.ok) return { ok: false as const, error: j?.error || `Erro ${r.status}` }
      await refetch()
      return { ok: true as const, connection: j.connection }
    },
    [storeId, refetch]
  )

  const connectedCount = connections.filter((c) => c.status === "CONNECTED").length

  return {
    connections,
    loading,
    error,
    refetch,
    connect,
    disconnect,
    simulateSync,
    connectedCount,
  }
}

export type MarketplaceConnectionsHub = ReturnType<typeof useMarketplaceConnections>
