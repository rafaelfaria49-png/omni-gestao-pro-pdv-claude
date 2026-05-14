"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

export type PdvClienteResult = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  document?: string | null
}

/**
 * Debounced real-time client search via /api/clientes.
 * Shared across all PDV variants for unified customer lookup.
 */
export function usePdvCliente(storeId: string, debounceMs = 300) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PdvClienteResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()

    if (!q) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    timerRef.current = setTimeout(() => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      fetch(`/api/clientes?q=${encodeURIComponent(q)}`, {
        headers: { [ASSISTEC_LOJA_HEADER]: storeId },
        credentials: "include",
        signal: ctrl.signal,
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((data: unknown) => {
          const d = data as { clientes?: PdvClienteResult[] }
          setResults(Array.isArray(d.clientes) ? d.clientes : [])
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return
          setResults([])
          setLoading(false)
        })
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, storeId, debounceMs])

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    setQuery("")
    setResults([])
    setLoading(false)
  }, [])

  return { query, setQuery, results, loading, clear }
}
