"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { buscarClientesPdv, type PdvClienteResult } from "@/lib/pdv/cliente-search-client"

export type { PdvClienteResult }

/**
 * Busca de clientes em tempo real (debounce) via `POST /api/clientes/search`.
 *
 * `GET /api/clientes?q=` é recusado pelo servidor (HTTP 400 — buscas só por POST,
 * para que o termo não vaze em URL/log). Até esta correção o hook usava o GET e lia o
 * corpo de erro como lista vazia: o PDV mostrava "Nenhum cliente encontrado" para
 * QUALQUER termo, inclusive nos modais F9/F5 e F2.
 *
 * Contrato:
 *  - termo vazio não consulta o servidor (`results = []`, sem erro);
 *  - cada termo novo cancela a requisição anterior (`AbortController`) e uma resposta
 *    atrasada nunca sobrescreve a do termo atual;
 *  - HTTP != 2xx vira `error` legível — nunca "nenhum resultado".
 */
export function usePdvCliente(storeId: string, debounceMs = 300) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PdvClienteResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** `true` depois que o termo atual recebeu resposta (evita "nada encontrado" prematuro). */
  const [searched, setSearched] = useState(false)
  const [nonce, setNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    abortRef.current = null

    if (!q) {
      setResults([])
      setLoading(false)
      setError(null)
      setSearched(false)
      return
    }
    if (!storeId.trim()) {
      setResults([])
      setLoading(false)
      setError("Nenhuma loja ativa. Selecione a unidade antes de buscar clientes.")
      setSearched(true)
      return
    }

    setLoading(true)
    setError(null)
    setSearched(false)
    timerRef.current = setTimeout(() => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      void buscarClientesPdv({
        fetchImpl: fetch,
        storeId,
        q,
        signal: ctrl.signal,
        lojaHeader: ASSISTEC_LOJA_HEADER,
      }).then((r) => {
        if (ctrl.signal.aborted || r.kind === "aborted") return
        if (r.kind === "ok") {
          setResults(r.clientes)
          setError(null)
        } else {
          setResults([])
          setError(r.message)
        }
        setLoading(false)
        setSearched(true)
      })
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, storeId, debounceMs, nonce])

  useEffect(() => () => abortRef.current?.abort(), [])

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    abortRef.current = null
    setQuery("")
    setResults([])
    setLoading(false)
    setError(null)
    setSearched(false)
  }, [])

  /** Repete a busca do termo atual (botão "Tentar de novo" após erro). */
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  return { query, setQuery, results, loading, error, searched, clear, retry }
}
