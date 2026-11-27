"use client"

/**
 * OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001
 *
 * Limpeza segura de CacheStorage autenticado no navegador/PWA (espelho da política
 * do LogoutGuard do Electron em `apps/desktop/src/main/privacy.ts`, sem tocar no Electron).
 *
 * REGRAS INEGOCIÁVEIS:
 *  - Remove TODOS os caches legados/dinâmicos (`apis`, `pages`, `pages-rsc*`, `next-data`,
 *    `start-url`, `static-data-assets`, `static-js-assets`, `others`, etc.) e qualquer entrada
 *    não-estática ou com Content-Type HTML/JSON/RSC em caches mantidos.
 *  - NUNCA chama `localStorage.clear()`, `sessionStorage.clear()` nem apaga `IndexedDB`:
 *    a fila offline do PDV (`opsKeyForLoja`, `assistec-pro-caixa-v1-*`, `omnigestao:pdv-*`,
 *    `@omnigestao:pdv-black-*`) permanece intacta.
 *  - Trata falhas honestamente (`ok: false` + `error`), sem reportar sucesso fictício.
 */

export const AUTH_PRIVACY_CHANNEL = "omni-auth-privacy"
export const CACHE_PURGE_RETRY_SESSION_KEY = "omni:pwa-cache-purge-retry"

/** Caches seguros que contêm apenas ativos estáticos do build/fontes/ícones públicos. */
export const SHARED_SAFE_CACHE_PATTERN = /^(workbox-precache|google-fonts-|next-static-assets|public-pwa-assets)/

/** Tipos de resposta que podem carregar dados autenticados/HTML/RSC (jamais sobrevivem em cache). */
const PRIVATE_CONTENT_TYPE = /^\s*(text\/html|application\/json|text\/x-component)/i

/** Caminhos mesma-origem estritamente públicos e estáticos que podem permanecer em cache mantido. */
export function isSafePublicStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/gestao-lojas/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/omni-gestao-pro-icon.svg" ||
    pathname === "/logo.png" ||
    pathname === "/favicon.ico"
  )
}

export interface CachePurgeResult {
  ok: boolean
  supported: boolean
  deletedCaches: string[]
  deletedEntries: number
  failedCaches: string[]
  error?: string
}

/**
 * Expurga todos os caches do navegador/PWA que podem conter respostas autenticadas, páginas
 * privadas ou payloads RSC. Preserva apenas precache do build, fontes públicas e ativos
 * estáticos verificados. Nunca toca em localStorage/IndexedDB.
 */
export async function purgeAuthenticatedBrowserCaches(): Promise<CachePurgeResult> {
  if (typeof globalThis === "undefined" || !("caches" in globalThis) || !globalThis.caches) {
    return { ok: true, supported: false, deletedCaches: [], deletedEntries: 0, failedCaches: [] }
  }

  const deletedCaches: string[] = []
  const failedCaches: string[] = []
  let deletedEntries = 0
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : ""

  let names: string[]
  try {
    names = await globalThis.caches.keys()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      supported: true,
      deletedCaches,
      deletedEntries,
      failedCaches,
      error: `Falha ao listar CacheStorage: ${message}`,
    }
  }

  for (const name of names) {
    if (/^(workbox-precache|google-fonts-)/.test(name)) continue

    if (!SHARED_SAFE_CACHE_PATTERN.test(name)) {
      try {
        const deleted = await globalThis.caches.delete(name)
        if (deleted) {
          deletedCaches.push(name)
        } else {
          // Alguns ambientes retornam false quando o cache não pôde ser removido ou já sumiu.
          const stillExists = await globalThis.caches.has(name).catch(() => true)
          if (stillExists) failedCaches.push(name)
        }
      } catch {
        failedCaches.push(name)
      }
      continue
    }

    // Em caches estáticos mantidos (`next-static-assets`, `public-pwa-assets`), valida cada entrada
    // contra cache poisoning (ex.: HTML/JSON/RSC ou rota não-estática gravada por versão anterior).
    try {
      const cache = await globalThis.caches.open(name)
      const requests = await cache.keys()
      for (const req of requests) {
        let parsed: URL
        try {
          parsed = new URL(req.url)
        } catch {
          continue
        }
        if (origin && parsed.origin !== origin) continue
        let contentType = ""
        try {
          const res = await cache.match(req)
          contentType = res?.headers?.get("content-type") ?? ""
        } catch {
          /* best effort */
        }
        if (PRIVATE_CONTENT_TYPE.test(contentType) || !isSafePublicStaticPath(parsed.pathname)) {
          const removed = await cache.delete(req)
          if (removed) deletedEntries++
        }
      }
    } catch {
      failedCaches.push(name)
    }
  }

  if (failedCaches.length > 0) {
    return {
      ok: false,
      supported: true,
      deletedCaches,
      deletedEntries,
      failedCaches,
      error: `Não foi possível remover completamente os caches: ${failedCaches.join(", ")}`,
    }
  }

  return { ok: true, supported: true, deletedCaches, deletedEntries, failedCaches: [] }
}

/** Marca/limpa flag efêmera em sessionStorage quando a limpeza falhou no logout e precisa repetir no /login. */
export function markCachePurgeRetryNeeded(needed: boolean): void {
  try {
    if (typeof window === "undefined" || !("sessionStorage" in window)) return
    if (needed) window.sessionStorage.setItem(CACHE_PURGE_RETRY_SESSION_KEY, "1")
    else window.sessionStorage.removeItem(CACHE_PURGE_RETRY_SESSION_KEY)
  } catch {
    /* sessionStorage indisponível */
  }
}

export function isCachePurgeRetryNeeded(): boolean {
  try {
    if (typeof window === "undefined" || !("sessionStorage" in window)) return false
    return window.sessionStorage.getItem(CACHE_PURGE_RETRY_SESSION_KEY) === "1"
  } catch {
    return false
  }
}

export type AuthPrivacyBroadcastMessage = {
  type: "OMNI_LOGOUT"
  at: number
  senderTabId?: string
}

const LOCAL_TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

let localSignOutInProgress = false
const localSignOutListeners = new Set<() => void>()

export function isLocalSignOutInProgress(): boolean {
  return localSignOutInProgress
}

export function setLocalSignOutInProgress(active: boolean): void {
  localSignOutInProgress = active
  if (active) {
    for (const listener of localSignOutListeners) {
      try {
        listener()
      } catch {
        /* ignore */
      }
    }
  }
}

export function subscribeLocalSignOutStart(onStart: () => void): () => void {
  localSignOutListeners.add(onStart)
  return () => {
    localSignOutListeners.delete(onStart)
  }
}

/** Notifica outras abas abertas da mesma origem que a sessão foi encerrada. */
export function broadcastAuthLogout(): void {
  setLocalSignOutInProgress(true)
  try {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(AUTH_PRIVACY_CHANNEL)
    channel.postMessage({
      type: "OMNI_LOGOUT",
      at: Date.now(),
      senderTabId: LOCAL_TAB_ID,
    } satisfies AuthPrivacyBroadcastMessage)
    channel.close()
  } catch {
    /* BroadcastChannel indisponível */
  }
}

/** Escuta encerramento de sessão originado em outra aba (ignora eco da própria aba). */
export function subscribeAuthLogout(onLogout: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {}
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(AUTH_PRIVACY_CHANNEL)
    channel.onmessage = (event: MessageEvent<AuthPrivacyBroadcastMessage>) => {
      if (event.data?.type !== "OMNI_LOGOUT") return
      if (event.data.senderTabId && event.data.senderTabId === LOCAL_TAB_ID) return
      onLogout()
    }
  } catch {
    return () => {}
  }
  return () => {
    try {
      channel?.close()
    } catch {
      /* ignore */
    }
  }
}

/** Solicita atualização silenciosa do Service Worker (sem recarregar abas). */
export function triggerSilentServiceWorkerUpdate(): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {})
  } catch {
    /* ignore */
  }
}
