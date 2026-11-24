/* OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001 (evolução CAD-R2-020 / RELATORIOS-FASE-A-001):
 * Na ativação do Service Worker (inclui upgrade de clientes com versões antigas do PWA), remove
 * todas as entradas e caches legados que possam conter respostas autenticadas, páginas privadas
 * ou payloads RSC, preservando somente ativos públicos/estáticos imutáveis e precache do build.
 * Nunca toca em localStorage ou IndexedDB (fila offline do PDV preservada). */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const SAFE_BUCKETS = /^(workbox-precache|google-fonts-|next-static-assets|public-pwa-assets)/
    const LEGACY_UNSAFE_BUCKETS = /^(apis|pages|pages-rsc|pages-rsc-prefetch|next-data|start-url|static-data-assets|static-js-assets|static-style-assets|static-image-assets|static-audio-assets|static-video-assets|static-font-assets|next-image|others|cross-origin)$/
    const SAFE_PUBLIC_STATIC = (pathname) => (
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
    const PRIVATE_CONTENT_TYPE = /^\s*(text\/html|application\/json|text\/x-component)/i

    for (const name of await caches.keys()) {
      if (/^(workbox-precache|google-fonts-)/.test(name)) continue
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        let url
        try {
          url = new URL(request.url)
        } catch {
          continue
        }
        if (url.origin !== self.location.origin) continue
        let privateType = false
        if (typeof cache.match === "function") {
          try {
            const res = await cache.match(request)
            const ct = (res && res.headers && res.headers.get("content-type")) || ""
            if (PRIVATE_CONTENT_TYPE.test(ct)) privateType = true
          } catch {
            /* best effort */
          }
        }
        if (privateType || !SAFE_PUBLIC_STATIC(url.pathname)) {
          await cache.delete(request)
        }
      }
      if (typeof caches.delete === "function" && (LEGACY_UNSAFE_BUCKETS.test(name) || !SAFE_BUCKETS.test(name))) {
        const remaining = await cache.keys()
        if (remaining.length === 0) {
          await caches.delete(name)
        }
      }
    }
  })())
})
