"use client"

/**
 * WhatsApp IA — F4 · hook do orçamento sugerido de assistência.
 *
 * Só busca quando a F2 classificou ORCAMENTO_ASSISTENCIA. Chama a rota read-only
 * (escopada por loja no servidor) e devolve a sugestão de valor. Nada é enviado.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { WhatsAppAssistanceQuote } from "@/lib/whatsapp/whatsapp-assistance-quote"

const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = { at: number; quote: WhatsAppAssistanceQuote }
const cache = new Map<string, CacheEntry>()

export type WhatsAppAssistanceQuoteState = {
  loading: boolean
  quote: WhatsAppAssistanceQuote | null
  error: string | null
}

const initial: WhatsAppAssistanceQuoteState = { loading: false, quote: null, error: null }

export function useWhatsAppAssistanceQuote(args: {
  conversationId: string | null
  apiHeaders: Record<string, string> | null
  enabled: boolean
  text: string
}): WhatsAppAssistanceQuoteState {
  const { conversationId, apiHeaders, enabled, text } = args
  const [state, setState] = useState<WhatsAppAssistanceQuoteState>(initial)
  const abortRef = useRef<AbortController | null>(null)

  const sig =
    enabled && conversationId && apiHeaders && text.trim()
      ? `${conversationId}|${text.trim()}`
      : ""

  const run = useCallback(async () => {
    if (!sig || !conversationId || !apiHeaders) {
      setState(initial)
      return
    }

    const hit = cache.get(sig)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState({ loading: false, quote: hit.quote, error: null })
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({ loading: true, quote: null, error: null })

    try {
      const res = await fetch(
        `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/assistance-quote`,
        {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ text }),
          signal: ac.signal,
        }
      )
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        quote?: WhatsAppAssistanceQuote
      }
      if (!res.ok || !data.ok || !data.quote) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      cache.set(sig, { at: Date.now(), quote: data.quote })
      if (!ac.signal.aborted) setState({ loading: false, quote: data.quote, error: null })
    } catch (e) {
      if (ac.signal.aborted) return
      setState({ loading: false, quote: null, error: e instanceof Error ? e.message : String(e) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, conversationId, apiHeaders])

  useEffect(() => {
    if (!sig) {
      setState(initial)
      return
    }
    void run()
    return () => abortRef.current?.abort()
  }, [sig, run])

  return state
}
