"use client"

/** Only report entries; do not remove another module's offline data. Also used on scope teardown. */
export async function purgeReportCaches(): Promise<void> {
  if(typeof window==="undefined"||!("caches" in window))return
  try {
    for(const name of await caches.keys()) {
      const cache=await caches.open(name)
      for(const request of await cache.keys()) {
        const url=new URL(request.url)
        if(url.origin===window.location.origin&&(url.pathname.startsWith("/api/dashboard/relatorios/")||url.pathname==="/dashboard/relatorios"||url.pathname.startsWith("/dashboard/relatorios/")))await cache.delete(request)
      }
    }
  }catch { /* private reads remain NetworkOnly; missing CacheStorage does not enable a fallback */ }
}
