"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

/**
 * Aviso simples de "nova versão disponível" do PWA.
 *
 * O app usa @ducanh2912/next-pwa com `register`/`skipWaiting`/`cacheOnFrontEndNav`.
 * Como `skipWaiting` já está ativo globalmente, NÃO recarregamos automaticamente
 * (um auto-reload no meio de uma venda seria perigoso). Apenas detectamos que um
 * novo Service Worker foi instalado (`updatefound` → `installed`, com um controller
 * já existente = é ATUALIZAÇÃO, não 1ª instalação) e exibimos um aviso discreto.
 * O operador decide quando recarregar.
 *
 * SEGURANÇA: a única ação é `window.location.reload()`. Nunca limpa localStorage,
 * Cache Storage, nem toca em vendas pendentes (`assistec-pro-ops-v1`).
 */
export function PwaUpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    let cancelled = false

    const markReady = () => {
      if (!cancelled) setUpdateReady(true)
    }

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg || cancelled) return
        // Worker já aguardando (update baixado numa sessão anterior).
        if (reg.waiting && navigator.serviceWorker.controller) markReady()

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              markReady()
            }
          })
        })
      })
      .catch(() => {
        /* SW indisponível (ex.: ambiente de desenvolvimento) — silencioso */
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!updateReady) return null

  return (
    <div className="fixed bottom-4 right-4 z-[120] max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">
            Atualizar sistema para carregar a versão mais recente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ml-1 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Atualizar
        </button>
      </div>
    </div>
  )
}
