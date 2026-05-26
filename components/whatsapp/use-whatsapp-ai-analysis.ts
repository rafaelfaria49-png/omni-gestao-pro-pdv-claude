"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { WhatsAppAiAnalysis, WhatsAppAiAnalysisResult } from "@/lib/whatsapp/ai-conversation-analysis"

const CACHE_TTL_MS = 5 * 60 * 1000

type ClientCacheEntry = { at: number; result: WhatsAppAiAnalysisResult }
const clientCache = new Map<string, ClientCacheEntry>()

function cacheKey(storeId: string, conversationId: string): string {
  return `${storeId}:${conversationId}`
}

export type WhatsAppAiAnalysisState = {
  loading: boolean
  available: boolean
  analysis: WhatsAppAiAnalysis | null
  cached: boolean
  generatedAt: string | null
  reason: string | null
  error: string | null
}

const initialState: WhatsAppAiAnalysisState = {
  loading: false,
  available: false,
  analysis: null,
  cached: false,
  generatedAt: null,
  reason: null,
  error: null,
}

function applyResult(result: WhatsAppAiAnalysisResult): WhatsAppAiAnalysisState {
  return {
    loading: false,
    available: result.available && !!result.analysis,
    analysis: result.analysis,
    cached: result.cached,
    generatedAt: result.generatedAt,
    reason: result.reason ?? null,
    error: null,
  }
}

export function useWhatsAppAiAnalysis(
  conversationId: string | null,
  apiHeaders: Record<string, string> | null
) {
  const [state, setState] = useState<WhatsAppAiAnalysisState>(initialState)
  const abortRef = useRef<AbortController | null>(null)
  const storeId = apiHeaders?.[ASSISTEC_LOJA_HEADER]?.trim() ?? ""

  const fetchAnalysis = useCallback(
    async (force = false) => {
      if (!conversationId || !apiHeaders || !storeId) {
        setState(initialState)
        return
      }

      const key = cacheKey(storeId, conversationId)
      if (!force) {
        const hit = clientCache.get(key)
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
          setState(applyResult(hit.result))
          return
        }
      }

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const res = await fetch(
          `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/ai-analysis`,
          {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ force }),
            signal: ac.signal,
          }
        )
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errBody.error || `HTTP ${res.status}`)
        }
        const result = (await res.json()) as WhatsAppAiAnalysisResult
        clientCache.set(key, { at: Date.now(), result })
        if (!ac.signal.aborted) setState(applyResult(result))
      } catch (e) {
        if (ac.signal.aborted) return
        const msg = e instanceof Error ? e.message : String(e)
        setState({
          ...initialState,
          loading: false,
          reason: "Falha na requisição",
          error: msg,
        })
      }
    },
    [conversationId, apiHeaders, storeId]
  )

  useEffect(() => {
    if (!conversationId || !storeId) {
      setState(initialState)
      return
    }
    const key = cacheKey(storeId, conversationId)
    const hit = clientCache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState(applyResult(hit.result))
      return
    }
    void fetchAnalysis(false)
    return () => {
      abortRef.current?.abort()
    }
  }, [conversationId, storeId, fetchAnalysis])

  const refresh = useCallback(() => fetchAnalysis(true), [fetchAnalysis])

  return { ...state, refresh }
}
