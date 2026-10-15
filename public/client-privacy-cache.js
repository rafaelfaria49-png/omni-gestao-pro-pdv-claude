/* CAD-R2-020: remove historical client responses on SW activation. */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const url = new URL(request.url)
        if (url.origin === self.location.origin && (
          url.pathname === "/api/clientes" || url.pathname.startsWith("/api/clientes/") ||
          url.pathname === "/api/clients" || url.pathname.startsWith("/api/import/") ||
          url.pathname === "/api/ops/import/clientes" || url.pathname === "/dashboard/clientes" ||
          url.pathname.startsWith("/dashboard/cadastros")
        )) await cache.delete(request)
      }
    }
  })())
})
