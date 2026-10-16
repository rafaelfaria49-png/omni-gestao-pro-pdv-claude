"use client"

import { useEffect, useRef, useState } from "react"

type ClienteResult = {
  id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
}

type UseClienteSearchResult = {
  clientes: ClienteResult[]
  isLoading: boolean
}

export function useClienteSearch(
  query: string,
  lojaId: string | null | undefined,
): UseClienteSearchResult {
  const [clientes, setClientes] = useState<ClienteResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    setClientes([])
    if (!lojaId || query.length < 2) {
      setClientes([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLoading(true)

      try {
        const headers: Record<string, string> = {}
        if (lojaId) headers["x-assistec-loja-id"] = lojaId

        const res = await fetch(
          "/api/clientes/search",
          { method: "POST", body: JSON.stringify({ q: query }), signal: controller.signal, headers: { ...headers, "Content-Type": "application/json" }, cache: "no-store" },
        )

        if (cancelled) return
        if (!res.ok) {
          setClientes([])
          return
        }

        const data = (await res.json()) as { clientes?: unknown }
        if (cancelled) return
        const arr = Array.isArray(data?.clientes) ? (data.clientes as unknown[]) : []
        setClientes(
          arr.map((item) => {
            const r = item as Record<string, unknown>
            return {
              id: String(r["id"] ?? ""),
              name: String(r["name"] ?? ""),
              phone: r["phone"] != null ? String(r["phone"]) : null,
              email: r["email"] != null ? String(r["email"]) : null,
              document: r["document"] != null ? String(r["document"]) : null,
            }
          }),
        )
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") return
        setClientes([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [query, lojaId])

  return { clientes, isLoading }
}
