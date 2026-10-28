/* CAD-R2-020: remove historical client responses on SW activation.
 * RELATORIOS-PRODUTOS-VENDIDOS-PWA-SAFETY-002: idem para o relatório de produtos vendidos. */
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
          url.pathname.startsWith("/dashboard/cadastros") ||
          url.pathname === "/api/vendas/produtos-vendidos" || url.pathname.startsWith("/api/vendas/produtos-vendidos/")
        )) await cache.delete(request)
      }
    }
  })())
})
