// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isSafePublicStaticPath,
  purgeAuthenticatedBrowserCaches,
} from "./pwa-cache-privacy"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type FakeEntry = { url: string; contentType: string }

function mockCacheStorage(initial: Record<string, FakeEntry[]>, opts?: { failDelete?: Set<string>; failKeys?: boolean }) {
  const buckets = new Map<string, Map<string, FakeEntry>>()
  for (const [name, entries] of Object.entries(initial)) {
    buckets.set(name, new Map(entries.map((e) => [e.url, e])))
  }

  const cachesMock = {
    keys: vi.fn(async () => {
      if (opts?.failKeys) throw new Error("CacheStorage unavailable")
      return [...buckets.keys()]
    }),
    has: vi.fn(async (name: string) => buckets.has(name)),
    delete: vi.fn(async (name: string) => {
      if (opts?.failDelete?.has(name)) throw new Error(`delete failed for ${name}`)
      return buckets.delete(name)
    }),
    open: vi.fn(async (name: string) => {
      const entries = buckets.get(name) ?? new Map<string, FakeEntry>()
      return {
        keys: async () => [...entries.keys()].map((url) => ({ url })),
        match: async (req: { url: string }) => {
          const hit = entries.get(req.url)
          return hit ? { headers: new Headers({ "content-type": hit.contentType }) } : undefined
        },
        delete: async (req: { url: string }) => entries.delete(req.url),
      }
    }),
  }

  vi.stubGlobal("caches", cachesMock)
  return { buckets, cachesMock }
}

describe("pwa-cache-privacy — limpeza segura de CacheStorage sem tocar em localStorage", () => {
  it("remove todos os caches privados/legados (apis, pages, pages-rsc*, start-url, next-data) e preserva precache e estáticos seguros", async () => {
    localStorage.setItem("assistec-pro-ops-v1-loja-a", JSON.stringify({ sales: [{ id: "S1", syncPending: true }] }))
    const origin = window.location.origin
    const { buckets } = mockCacheStorage({
      "workbox-precache-v2-http://localhost/": [{ url: `${origin}/_next/static/chunk.js`, contentType: "application/javascript" }],
      "google-fonts-webfonts": [{ url: "https://fonts.gstatic.com/s/inter.woff2", contentType: "font/woff2" }],
      apis: [
        { url: `${origin}/api/stores`, contentType: "application/json" },
        { url: `${origin}/api/ops/vendas-list?lojaId=loja-a`, contentType: "application/json" },
      ],
      pages: [{ url: `${origin}/dashboard`, contentType: "text/html" }],
      "pages-rsc": [{ url: `${origin}/dashboard/estoque?_rsc=1`, contentType: "text/x-component" }],
      "pages-rsc-prefetch": [{ url: `${origin}/dashboard/vendas?_rsc=1`, contentType: "text/x-component" }],
      "start-url": [{ url: `${origin}/login`, contentType: "text/html" }],
      "next-static-assets": [
        { url: `${origin}/_next/static/app.js`, contentType: "application/javascript" },
        // Simula envenenamento: HTML de dashboard gravado sob path estático
        { url: `${origin}/_next/static/poisoned.js`, contentType: "text/html; charset=utf-8" },
      ],
      "public-pwa-assets": [
        { url: `${origin}/icons/icon-192.png`, contentType: "image/png" },
        { url: `${origin}/api/stores`, contentType: "application/json" },
      ],
    })

    const result = await purgeAuthenticatedBrowserCaches()

    expect(result.ok).toBe(true)
    expect(result.failedCaches).toEqual([])
    expect(result.deletedCaches.sort()).toEqual(["apis", "pages", "pages-rsc", "pages-rsc-prefetch", "start-url"])
    expect(result.deletedEntries).toBe(2)
    expect([...buckets.keys()].sort()).toEqual([
      "google-fonts-webfonts",
      "next-static-assets",
      "public-pwa-assets",
      "workbox-precache-v2-http://localhost/",
    ])
    expect([...buckets.get("next-static-assets")!.keys()]).toEqual([`${origin}/_next/static/app.js`])
    expect([...buckets.get("public-pwa-assets")!.keys()]).toEqual([`${origin}/icons/icon-192.png`])
    // PDV offline localStorage NUNCA é tocado
    expect(localStorage.getItem("assistec-pro-ops-v1-loja-a")).toContain('"syncPending":true')
    localStorage.removeItem("assistec-pro-ops-v1-loja-a")
  })

  it("falha na limpeza (caches.keys ou caches.delete): reporta ok=false honestamente sem sucesso fictício", async () => {
    mockCacheStorage({}, { failKeys: true })
    const r1 = await purgeAuthenticatedBrowserCaches()
    expect(r1.ok).toBe(false)
    expect(r1.error).toContain("CacheStorage unavailable")

    mockCacheStorage(
      {
        apis: [{ url: `${window.location.origin}/api/stores`, contentType: "application/json" }],
        pages: [{ url: `${window.location.origin}/dashboard`, contentType: "text/html" }],
      },
      { failDelete: new Set(["apis"]) },
    )
    const r2 = await purgeAuthenticatedBrowserCaches()
    expect(r2.ok).toBe(false)
    expect(r2.deletedCaches).toEqual(["pages"])
    expect(r2.failedCaches).toEqual(["apis"])
  })

  it("isSafePublicStaticPath permite apenas estáticos públicos oficiais", () => {
    expect(isSafePublicStaticPath("/_next/static/chunks/main.js")).toBe(true)
    expect(isSafePublicStaticPath("/icons/icon-192.png")).toBe(true)
    expect(isSafePublicStaticPath("/manifest.webmanifest")).toBe(true)
    expect(isSafePublicStaticPath("/api/stores")).toBe(false)
    expect(isSafePublicStaticPath("/dashboard")).toBe(false)
    expect(isSafePublicStaticPath("/dashboard/vendas")).toBe(false)
    expect(isSafePublicStaticPath("/login")).toBe(false)
  })
})
