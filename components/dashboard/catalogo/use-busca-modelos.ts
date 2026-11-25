"use client"

/**
 * COMPAT-BUSCA-MODELOS-NATURAL-001 — busca paginada de modelos (catálogo global + loja ativa),
 * compartilhada por PDV (Configurar acessório), Compat (Capinhas/Películas/Vínculos) e ficha do produto.
 *
 * - debounce + cancelamento: resposta antiga nunca sobrescreve a busca mais nova;
 * - a 1ª página vem da digitação; as seguintes só quando o operador pede ("Mostrar mais");
 * - nada é cortado em silêncio: `hasMore`/`total` vêm do servidor.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"

export const BUSCA_MODELOS_PAGE_SIZE = 20

type Pagina = { results: DeviceSearchResult[]; total: number; hasMore: boolean; nextOffset: number | null }

async function buscarPagina(
  q: string,
  offset: number,
  limit: number,
  lojaHeader: string | null | undefined,
  signal: AbortSignal,
): Promise<Pagina> {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) })
  const res = await fetch(`/api/catalogo/aparelhos/search?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal,
    ...(lojaHeader ? { headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader } } : {}),
  })
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json().catch(() => null)) as Partial<Pagina> | null
  const results = Array.isArray(data?.results) ? data.results : []
  const nextOffset = typeof data?.nextOffset === "number" ? data.nextOffset : null
  return {
    results,
    total: typeof data?.total === "number" ? data.total : offset + results.length,
    hasMore: data?.hasMore === true && nextOffset !== null,
    nextOffset,
  }
}

export function useBuscaModelos({
  query,
  lojaHeader,
  enabled = true,
  debounceMs = 250,
  pageSize = BUSCA_MODELOS_PAGE_SIZE,
  errorMessage = "Falha ao buscar modelos.",
}: {
  query: string
  lojaHeader: string | null | undefined
  enabled?: boolean
  debounceMs?: number
  pageSize?: number
  errorMessage?: string
}) {
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  // Geração da busca: "Mostrar mais" de uma busca antiga nunca mistura resultados na nova.
  const geracao = useRef(0)
  const maisController = useRef<AbortController | null>(null)
  const termo = query.trim()

  useEffect(() => {
    const minha = ++geracao.current
    maisController.current?.abort()
    setLoadingMore(false)
    if (!enabled || termo.length < 2) {
      setResults([])
      setTotal(0)
      setNextOffset(null)
      setLoading(false)
      setError("")
      return
    }
    setLoading(true)
    setError("")
    const controller = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const p = await buscarPagina(termo, 0, pageSize, lojaHeader, controller.signal)
        if (controller.signal.aborted || minha !== geracao.current) return
        setResults(p.results)
        setTotal(p.total)
        setNextOffset(p.hasMore ? p.nextOffset : null)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        if (minha !== geracao.current) return
        setResults([])
        setTotal(0)
        setNextOffset(null)
        setError(errorMessage)
      } finally {
        if (!controller.signal.aborted && minha === geracao.current) setLoading(false)
      }
    }, debounceMs)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [termo, lojaHeader, enabled, debounceMs, pageSize, errorMessage])

  const carregarMais = useCallback(async () => {
    if (nextOffset === null || loadingMore || loading) return
    const minha = geracao.current
    const controller = new AbortController()
    maisController.current = controller
    setLoadingMore(true)
    try {
      const p = await buscarPagina(termo, nextOffset, pageSize, lojaHeader, controller.signal)
      if (controller.signal.aborted || minha !== geracao.current) return
      setResults((prev) => {
        const vistos = new Set(prev.map((r) => r.modelKey))
        return [...prev, ...p.results.filter((r) => !vistos.has(r.modelKey))]
      })
      setTotal(p.total)
      setNextOffset(p.hasMore ? p.nextOffset : null)
      // Nova tentativa deu certo: some o aviso da falha anterior.
      setError("")
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      if (minha === geracao.current) setError(errorMessage)
    } finally {
      if (minha === geracao.current) setLoadingMore(false)
    }
  }, [nextOffset, loadingMore, loading, termo, pageSize, lojaHeader, errorMessage])

  const limpar = useCallback(() => {
    geracao.current++
    maisController.current?.abort()
    setResults([])
    setTotal(0)
    setNextOffset(null)
    setLoading(false)
    setLoadingMore(false)
    setError("")
  }, [])

  return { results, loading, loadingMore, error, total, hasMore: nextOffset !== null, carregarMais, limpar }
}
