"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { MarketplaceConnectionDTO, MarketplaceProviderCode } from "@/lib/marketplace/connection-api-types"
import type { MarketplaceReadConnection } from "@/lib/marketplace/read-only-types"

type ApiList = { connections: MarketplaceConnectionDTO[]; mercadoLivre: MarketplaceReadConnection }
type Snapshot = { storeId: string; data?: ApiList; error?: string; loading: boolean }

function headersJson(storeId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    [ASSISTEC_LOJA_HEADER]: storeId,
  }
}

export function useMarketplaceConnections(storeId: string | null) {
  const store = storeId?.trim() || null
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const activeStore = useRef<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!store || activeStore.current !== store) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setSnapshot((previous) => ({
      storeId: store, loading: true, data: previous?.storeId === store ? previous.data : undefined,
    }))
    try {
      const r = await fetch("/api/marketplace/mercado-livre/status", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: store },
        signal: controller.signal,
      })
      const j = (await r.json().catch(() => null)) as (ApiList & { error?: string }) | null
      if (controller.signal.aborted) return
      if (r.ok && j) setSnapshot({ storeId: store, loading: false, data: j })
      else setSnapshot({ storeId: store, loading: false, error: j?.error || `Erro ${r.status}` })
    } catch {
      if (!controller.signal.aborted) setSnapshot({ storeId: store, loading: false, error: "Falha ao carregar conexões" })
    }
  }, [store])

  useEffect(() => {
    activeStore.current = store
    void refetch()
    return () => {
      activeStore.current = null
      request.current?.abort()
    }
  }, [store, refetch])

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

  const current = snapshot?.storeId === store ? snapshot : null
  const mercadoLivre = current?.data?.mercadoLivre ?? null

  return {
    connections: current?.data?.connections ?? [],
    mercadoLivre,
    loading: Boolean(store && (!current || current.loading)),
    error: current?.error ?? null,
    refetch,
    connect,
    disconnect,
    simulateSync,
    connectedCount: mercadoLivre?.state === "validated" ? 1 : 0,
  }
}

export type MarketplaceConnectionsHub = ReturnType<typeof useMarketplaceConnections>
