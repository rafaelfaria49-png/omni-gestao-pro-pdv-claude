"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, AlertTriangle } from "lucide-react"
import {
  currentAppVersion,
  evaluateStaleness,
  fetchDeployedVersion,
  type StaleSeverity,
} from "@/lib/pwa-version"

/**
 * Guarda operacional de versão desatualizada (PWA stale guard).
 *
 * O app usa @ducanh2912/next-pwa com `register`/`skipWaiting`/`cacheOnFrontEndNav`.
 * Detecção em DUAS camadas, para NÃO depender só do ciclo do navegador:
 *   1) Service Worker — evento `updatefound` → `installed` com controller existente.
 *   2) Sondagem ativa de `/api/version` (a cada {@link POLL_MS} + ao focar/voltar/online),
 *      comparando o `buildId` deste bundle com o do deploy atual.
 *
 * Severidade progressiva (nunca bloqueia operação crítica):
 *   - `warn`   → aviso discreto (versão atrasada poucas horas / SW novo instalado).
 *   - `strong` → alerta forte (versão muito atrasada — diferença de build ≥ 6h).
 *
 * SEGURANÇA: as únicas ações são re-checar o SW e `window.location.reload()`.
 * NUNCA limpa localStorage, IndexedDB nem Cache Storage → carrinho aberto, vendas
 * offline pendentes (`assistec-pro-ops-v1`) e caixa aberto são preservados no reload.
 */

const POLL_MS = 3 * 60 * 1000 // 3 min

export function PwaUpdatePrompt() {
  // Sinal do Service Worker (camada 1).
  const [swUpdateReady, setSwUpdateReady] = useState(false)
  // Severidade vinda da sondagem de versão (camada 2).
  const [versionSeverity, setVersionSeverity] = useState<StaleSeverity>("none")
  // Esconder manualmente sem perder o estado (reaparece se piorar para strong).
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)
  const currentRef = useRef(currentAppVersion())

  // ── Camada 1: Service Worker ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    let cancelled = false
    const markReady = () => { if (!cancelled) setSwUpdateReady(true) }

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg || cancelled) return
        if (reg.waiting && navigator.serviceWorker.controller) markReady()
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) markReady()
          })
        })
      })
      .catch(() => { /* SW indisponível (ex.: dev) — silencioso */ })

    return () => { cancelled = true }
  }, [])

  // ── Camada 2: sondagem ativa de /api/version ──────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return
    let cancelled = false
    const controller = new AbortController()

    const check = async () => {
      const deployed = await fetchDeployedVersion(controller.signal)
      if (cancelled || !deployed) return
      const { severity } = evaluateStaleness(currentRef.current, deployed)
      setVersionSeverity(severity)
      // Se virou "strong", reabre mesmo que o operador tenha dispensado o aviso.
      if (severity === "strong") setDismissed(false)
    }

    void check()
    const interval = window.setInterval(() => void check(), POLL_MS)
    const onVisible = () => { if (document.visibilityState === "visible") void check() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    window.addEventListener("online", onVisible)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      window.removeEventListener("online", onVisible)
    }
  }, [])

  // Severidade efetiva: a sondagem manda; o SW sozinho vale como aviso brando.
  const severity: StaleSeverity =
    versionSeverity !== "none" ? versionSeverity : swUpdateReady ? "warn" : "none"

  // Atualização robusta: força o SW a re-checar + ativa o worker novo, então recarrega.
  // Preserva todo o armazenamento local (sem limpar caches/localStorage/IndexedDB).
  const applyUpdateAndReload = useCallback(async () => {
    setReloading(true)
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          try { await reg.update() } catch { /* ignore */ }
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" })
        }
      }
    } catch {
      /* ignore — o reload abaixo é a ação garantida */
    } finally {
      window.location.reload()
    }
  }, [])

  // Recarregar simples (fallback) — também preserva o armazenamento local.
  const reloadOnly = useCallback(() => {
    setReloading(true)
    window.location.reload()
  }, [])

  if (severity === "none" || dismissed) return null

  const strong = severity === "strong"

  // Barra superior horizontal, no fluxo (renderizada pelo slot `topNotice` do
  // AppShell, logo abaixo da Topbar). NÃO é overlay: não cobre carrinho, total,
  // botões de pagamento, workspace nem a sidebar — apenas empurra o conteúdo.
  return (
    <div
      role={strong ? "alert" : "status"}
      aria-live={strong ? "assertive" : "polite"}
      aria-atomic="true"
      aria-label="Atualização do sistema disponível"
      className={[
        "shrink-0 border-b",
        strong ? "border-warning/40 bg-warning/10" : "border-border bg-card",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          {strong ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning sm:mt-0" aria-hidden="true" />
          ) : (
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
          )}
          <p className="line-clamp-2 min-w-0 text-xs leading-snug sm:line-clamp-1">
            <span className="font-semibold text-foreground">
              {strong ? "Atualização importante disponível" : "Nova versão disponível"}
            </span>{" "}
            <span className="text-muted-foreground">
              Atualize quando concluir a venda. Suas vendas e pendências locais serão preservadas.
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={reloading}
            onClick={() => void applyUpdateAndReload()}
            aria-label="Atualizar agora para a versão mais recente"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {reloading ? "Atualizando…" : "Atualizar agora"}
          </button>
          <button
            type="button"
            disabled={reloading}
            onClick={reloadOnly}
            aria-label="Recarregar o sistema"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            Recarregar sistema
          </button>
          {!strong && (
            <button
              type="button"
              disabled={reloading}
              onClick={() => setDismissed(true)}
              aria-label="Dispensar aviso de atualização por enquanto"
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Agora não
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
