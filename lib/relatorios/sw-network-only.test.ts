/**
 * OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001 (evolução de RELATORIOS-FASE-A-001) —
 * Política allowlist-only no Service Worker: TODAS as APIs, páginas privadas e payloads RSC
 * são estritamente NetworkOnly (sem fallback de cache genérico), e a ativação do SW expurga
 * caches legados preservando apenas ativos estáticos públicos.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import vm from "node:vm"

type Pattern = (ctx: { sameOrigin: boolean; url: URL; request?: Request }) => boolean

function networkOnlyPattern(): Pattern {
  const src = readFileSync("next.config.mjs", "utf8")
  const start = src.indexOf("urlPattern: ", src.indexOf("runtimeCaching: ["))
  const end = src.indexOf('handler: "NetworkOnly"', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const fn = src.slice(start + "urlPattern: ".length, end).trim().replace(/,$/, "")
  return new Function(`return (${fn})`)() as Pattern
}

const ORIGIN = "https://app.local"
const at = (path: string, sameOrigin = true, headers?: Record<string, string>) => {
  const url = new URL(ORIGIN + path)
  return { sameOrigin, url, request: new Request(url, { headers }) }
}

describe("SW · política allowlist-only (NetworkOnly para todas as APIs, páginas privadas e RSC)", () => {
  const isNetworkOnly = networkOnlyPattern()

  it("desabilita default runtime caching, cacheOnFrontEndNav, cacheStartUrl e dynamicStartUrl (sem regra genérica apis/pages/start-url)", () => {
    const src = readFileSync("next.config.mjs", "utf8")
    expect(src).toMatch(/^\s*extendDefaultRuntimeCaching:\s*false,/m)
    expect(src).toMatch(/^\s*cacheOnFrontEndNav:\s*false,/m)
    expect(src).toMatch(/^\s*cacheStartUrl:\s*false,/m)
    expect(src).toMatch(/^\s*dynamicStartUrl:\s*false,/m)
    expect(src).toMatch(/^\s*reloadOnOnline:\s*false,/m)
  })

  it.each([
    "/api/vendas/historico?storeId=a&from=2026-11-07T03:00:00.000Z",
    "/api/vendas/abc123",
    "/api/financeiro/receber",
    "/api/financeiro/pagar",
    "/api/financeiro/fluxo-caixa",
    "/api/financeiro/relatorios/resumo?storeId=a&preset=hoje",
    "/api/financeiro/dre",
    "/api/ops/caixa/sessoes?take=50",
    "/api/ops/caixa/sessoes?lojaId=a&status=ABERTA&take=1",
    "/api/ops/caixa/sessao-detalhe?id=s1",
    "/api/dashboard/elite",
    "/api/dashboard/resumo",
    "/api/dashboard/relatorios/produtos?format=pdf",
    "/api/ops/contas-pagar-list",
    "/api/ops/contas-receber-list",
    "/api/ops/contas-receber-list?lojaId=a",
    "/api/finance/accounts",
    "/api/finance/transactions?page=1",
    // P1-001: APIs antes expostas pela regra genérica `apis` agora também são NetworkOnly
    "/api/stores",
    "/api/stores/pilot-a",
    "/api/stores/pilot-a/settings",
    "/api/ops/inventory",
    "/api/ops/inventory?lojaId=a",
    "/api/ops/inventory?catalogSync=1",
    "/api/ops/vendas-list?lojaId=a",
    "/api/ops/credito-cliente?lojaId=a",
    "/api/ops/ordens?lojaId=a",
    "/api/auth/session",
    "/api/auth/csrf",
    "/api/whatsapp/conversations",
    "/api/admin/users",
    "/api/clientes?q=x",
    "/api/pessoas/documentos",
    "/api/ops/venda-persist/v2",
    "/api/version",
    // Páginas privadas e rotas autenticadas
    "/dashboard",
    "/dashboard/estoque",
    "/dashboard/vendas",
    "/dashboard/clientes",
    "/dashboard/configuracoes?sec=seguranca",
    "/dashboard/relatorios",
    "/dashboard/relatorios/produtos?_rsc=private-session",
    "/conta/seguranca",
    "/login",
    "/",
    "/futura-rota-privada-qualquer",
    "/contador-externo/lojas/pilot-a",
    "/_next/data/build-123/dashboard.json",
  ])("%s → NetworkOnly", (path) => {
    expect(isNetworkOnly(at(path))).toBe(true)
  })

  it("qualquer requisição com cabeçalho RSC ou Next-Router-Prefetch ou ?_rsc cai em NetworkOnly", () => {
    expect(isNetworkOnly(at("/gestao-lojas?_rsc=abc"))).toBe(true)
    expect(isNetworkOnly(at("/baixar", true, { RSC: "1" }))).toBe(true)
    expect(isNetworkOnly(at("/baixar", true, { "Next-Router-Prefetch": "1" }))).toBe(true)
  })

  it.each([
    "/_next/static/chunks/main-123.js",
    "/icons/icon-192.png",
    "/icons/icon-maskable-512.png",
    "/apple-touch-icon.png",
    "/manifest.webmanifest",
    "/gestao-lojas/omni-logo-icon.webp",
  ])("ativo público estático %s não cai em NetworkOnly (permanece cacheável)", (path) => {
    expect(isNetworkOnly(at(path))).toBe(false)
  })

  it("outra origem nunca casa na regra NetworkOnly mesma-origem", () => {
    expect(isNetworkOnly(at("/api/financeiro/receber", false))).toBe(false)
  })
})

describe("SW · ativação remove todos os caches e respostas legadas autenticadas e preserva ativos públicos", () => {
  it("apaga APIs/páginas/RSC legados e preserva /logo.png e /_next/static/*", async () => {
    const removed: string[] = []
    const deletedBuckets: string[] = []
    let activate: (event: { waitUntil(p: Promise<void>): void }) => void = () => {}
    const buckets = new Map<string, Set<string>>([
      [
        "apis",
        new Set([
          "/api/stores",
          "/api/ops/inventory?lojaId=a",
          "/api/ops/vendas-list?lojaId=a",
          "/api/vendas/historico?storeId=a",
          "/api/financeiro/receber",
          "/api/ops/caixa/sessoes?take=50",
          "/api/dashboard/elite",
          "/api/ops/contas-pagar-list",
          "/api/ops/contas-receber-list",
          "/api/finance/accounts",
        ]),
      ],
      [
        "pages",
        new Set(["/dashboard", "/dashboard/estoque", "/dashboard/relatorios/produtos?_rsc=private-session", "/logo.png"]),
      ],
      ["pages-rsc-prefetch", new Set(["/dashboard/vendas?_rsc=1"])],
      ["next-static-assets", new Set(["/_next/static/chunks/app.js", "/dashboard"])],
    ])

    vm.runInNewContext(readFileSync("public/client-privacy-cache.js", "utf8"), {
      URL,
      self: { location: { origin: ORIGIN }, addEventListener: (_: string, fn: typeof activate) => { activate = fn } },
      caches: {
        keys: async () => [...buckets.keys()],
        delete: async (name: string) => {
          deletedBuckets.push(name)
          return buckets.delete(name)
        },
        open: async (name: string) => {
          const set = buckets.get(name)!
          return {
            keys: async () => [...set].map((p) => ({ url: ORIGIN + p })),
            match: async () => undefined,
            delete: async (req: { url: string }) => {
              const p = new URL(req.url).pathname + new URL(req.url).search
              removed.push(new URL(req.url).pathname)
              return set.delete(p)
            },
          }
        },
      },
    })
    let work: Promise<void> = Promise.resolve()
    activate({ waitUntil: (p) => { work = p } })
    await work

    expect(removed).toContain("/api/stores")
    expect(removed).toContain("/api/ops/inventory")
    expect(removed).toContain("/api/ops/vendas-list")
    expect(removed).toContain("/dashboard")
    expect(removed).toContain("/dashboard/estoque")
    expect(removed).not.toContain("/logo.png")
    expect(removed).not.toContain("/_next/static/chunks/app.js")
    expect(deletedBuckets).toContain("apis")
    expect(deletedBuckets).toContain("pages-rsc-prefetch")
    expect([...buckets.get("next-static-assets")!]).toEqual(["/_next/static/chunks/app.js"])
  })
})
