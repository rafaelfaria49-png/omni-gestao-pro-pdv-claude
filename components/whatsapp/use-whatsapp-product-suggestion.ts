"use client"

/**
 * WhatsApp IA — F3 · hook de sugestão de catálogo para o card assistido.
 *
 * Só busca quando a F2 classificou CONSULTA_PRODUTO_ESTOQUE. Chama a rota read-only
 * (escopada por loja no servidor) e devolve a resolução de produtos. Nada é enviado.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { WhatsAppIntentEntities } from "@/lib/whatsapp/whatsapp-intent-classifier"
import type { WhatsAppProductResolution } from "@/lib/whatsapp/whatsapp-product-resolver"

const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = { at: number; resolution: WhatsAppProductResolution }
const cache = new Map<string, CacheEntry>()

function signature(
  conversationId: string,
  text: string,
  entities: WhatsAppIntentEntities
): string {
  return [
    conversationId,
    text.trim(),
    entities.termoProduto ?? "",
    entities.marca ?? "",
    entities.modeloAparelho ?? "",
  ].join("|")
}

export type WhatsAppProductSuggestionState = {
  loading: boolean
  resolution: WhatsAppProductResolution | null
  error: string | null
}

const initial: WhatsAppProductSuggestionState = {
  loading: false,
  resolution: null,
  error: null,
}

export function useWhatsAppProductSuggestion(args: {
  conversationId: string | null
  apiHeaders: Record<string, string> | null
  enabled: boolean
  text: string
  entities: WhatsAppIntentEntities
}): WhatsAppProductSuggestionState {
  const { conversationId, apiHeaders, enabled, text, entities } = args
  const [state, setState] = useState<WhatsAppProductSuggestionState>(initial)
  const abortRef = useRef<AbortController | null>(null)

  const sig =
    enabled && conversationId && apiHeaders && text.trim()
      ? signature(conversationId, text, entities)
      : ""

  const run = useCallback(async () => {
    if (!sig || !conversationId || !apiHeaders) {
      setState(initial)
      return
    }

    const hit = cache.get(sig)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState({ loading: false, resolution: hit.resolution, error: null })
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({ loading: true, resolution: null, error: null })

    try {
      const res = await fetch(
        `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/product-suggestion`,
        {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ text, entities }),
          signal: ac.signal,
        }
      )
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        resolution?: WhatsAppProductResolution
      }
      if (!res.ok || !data.ok || !data.resolution) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      cache.set(sig, { at: Date.now(), resolution: data.resolution })
      if (!ac.signal.aborted) {
        setState({ loading: false, resolution: data.resolution, error: null })
      }
    } catch (e) {
      if (ac.signal.aborted) return
      setState({ loading: false, resolution: null, error: e instanceof Error ? e.message : String(e) })
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
