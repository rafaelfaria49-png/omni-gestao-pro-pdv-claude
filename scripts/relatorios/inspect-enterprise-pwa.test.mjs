/**
 * OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001 — adaptação seletiva do inspetor da PR #318.
 *
 * Carrega `public/sw.js` (gerado por `npm run build`) e prova, com o runtime Workbox real:
 *  - as sete APIs, exportações e páginas HTML/RSC caem em NetworkOnly;
 *  - offline, a estratégia real não lê nem grava cache, mesmo com relatório de outra loja guardado;
 *  - a limpeza na ativação remove respostas antigas do relatório e preserva os demais módulos;
 *  - Clientes/Pessoas continuam protegidos (inspetor oficial do Pessoas).
 *
 * Exige build de produção local; sem `.next/BUILD_ID` + `public/sw.js` o teste é pulado.
 *   npm run build && node --test scripts/relatorios/inspect-enterprise-pwa.test.mjs
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { coletarRotas, inspectPwaBuild } from "../pessoas/inspect-pwa-build.mjs"

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const PUBLIC = path.join(WS, "public")
const ORIGEM = "https://pessoas.example.invalid"
const BUILD = fs.existsSync(path.join(WS, ".next/BUILD_ID")) && fs.existsSync(path.join(PUBLIC, "sw.js"))
const skip = BUILD ? false : "requer build de produção (npm run build)"

const RELATORIO = [
  "/dashboard/relatorios", "/dashboard/relatorios/produtos?_rsc=session",
  ...["produtos", "fluxo-caixa", "dre", "clientes", "os", "tecnicos", "whatsapp"].flatMap(kind => [
    `/api/dashboard/relatorios/${kind}?from=2026-11-01&to=2026-11-10`,
    `/api/dashboard/relatorios/${kind}?from=2026-11-01&to=2026-11-10&format=csv`,
    `/api/dashboard/relatorios/${kind}?from=2026-11-01&to=2026-11-10&format=pdf`,
    `/dashboard/relatorios/${kind}`,
  ])
]

function ctx(url, headers = {}, method = "GET") {
  const parsed = new URL(url, ORIGEM)
  return { url: parsed, sameOrigin: parsed.origin === ORIGEM, request: new Request(parsed, { method, headers }) }
}
function primeira(routes, c) {
  return routes.find((r) => {
    if (r.method !== c.request.method) return false
    if (typeof r.match === "function") return !!r.match(c)
    if (typeof r.match === "string") return new URL(r.match, ORIGEM).href === c.url.href
    const m = r.match.exec(c.url.href)
    return !!m && (c.sameOrigin || m.index === 0)
  })
}

/** Runtime Workbox real (o mesmo arquivo referenciado pelo sw.js) com rede e cache simulados. */
function workboxReal(dependency, { online, cacheInicial }) {
  const workbox = {}
  const trace = { fetches: 0, cacheReads: 0, cacheWrites: 0 }
  const stores = new Map()
  for (const [name, entries] of Object.entries(cacheInicial)) {
    stores.set(name, new Map(entries.map(([url, body]) => [new URL(url, ORIGEM).href, body])))
  }
  const cacheApi = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const entries = stores.get(name)
    return {
      match: async (req) => { trace.cacheReads++; const b = entries.get(typeof req === "string" ? req : req.url); return b ? new Response(b) : undefined },
      matchAll: async () => [],
      put: async (req, res) => { trace.cacheWrites++; entries.set(typeof req === "string" ? req : req.url, await res.text()) },
      keys: async () => [...entries.keys()].map((u) => new Request(u)),
      delete: async (req) => entries.delete(req.url),
    }
  }
  class FetchEvent { waitUntil(p) { void Promise.resolve(p).catch(() => {}) } }
  const location = new URL(ORIGEM + "/sw.js")
  const context = {
    define: (deps, factory) => factory(workbox), URL, Request, Response, Headers, FetchEvent, location,
    self: { location, addEventListener() {}, __WB_DISABLE_DEV_LOGS: true, registration: { scope: ORIGEM + "/" } },
    fetch: async (req) => {
      trace.fetches++
      if (!online) throw new TypeError("OFFLINE_SINTETICO")
      return new Response(JSON.stringify({ origem: "rede", url: req.url }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" } })
    },
    caches: {
      open: async (name) => cacheApi(name),
      // Workbox lê via CacheStorage.match(request, { cacheName }).
      match: async (req, opts = {}) => {
        trace.cacheReads++
        const names = opts.cacheName ? [opts.cacheName] : [...stores.keys()]
        for (const n of names) { const b = stores.get(n)?.get(typeof req === "string" ? req : req.url); if (b) return new Response(b) }
        return undefined
      },
      keys: async () => [...stores.keys()], has: async (n) => stores.has(n), delete: async (n) => stores.delete(n),
    },
    setTimeout, clearTimeout,
  }
  // ExpirationPlugin registra timestamps em IDB em segundo plano; aqui a abertura fica pendente (inerte).
  class IDBRequest { addEventListener() {} removeEventListener() {} }
  for (const k of ["IDBDatabase", "IDBTransaction", "IDBCursor", "IDBObjectStore", "IDBIndex"]) context[k] = class {}
  context.IDBRequest = IDBRequest
  context.indexedDB = { open: () => new IDBRequest() }
  context.self.caches = context.caches
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC, dependency), "utf8"), context, { timeout: 10_000 })
  return { workbox, trace, stores, FetchEvent }
}

/** Instancia a estratégia da rota com as classes REAIS do Workbox. */
function estrategiaReal(wb, handler) {
  const opts = { ...handler.options }
  if (opts.plugins) opts.plugins = opts.plugins.map((p) => (p.kind ? new wb.workbox[p.kind](p.options) : p))
  return new wb.workbox[handler.kind](opts)
}

test("sw.js de produção: relatório de produtos vendidos e rotas privadas são NetworkOnly sem cache genérico", { skip }, async () => {
  const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8")
  const { routes } = await coletarRotas(sw, PUBLIC)
  const networkOnly = routes.filter((r) => r.handler.kind === "NetworkOnly")
  assert.equal(networkOnly.length, 1, "regra NetworkOnly ausente/duplicada")
  for (const forbidden of ["apis", "pages", "pages-rsc", "pages-rsc-prefetch", "start-url", "static-js-assets", "cross-origin"]) {
    assert.equal(
      routes.findIndex((r) => r.handler.options?.cacheName === forbidden),
      -1,
      "bucket genérico proibido reapareceu no sw.js: " + forbidden,
    )
  }
  for (const url of [...RELATORIO, "/api/version", "/api/dashboardx/relatorios", "/dashboard/relatorios-extra", "/"]) {
    for (const headers of [{}, { "x-assistec-loja-id": "loja-1" }, { "x-assistec-loja-id": "loja-2" }]) {
      assert.equal(primeira(routes, ctx(url, headers)), networkOnly[0], "rota privada caiu em cache: " + url)
    }
  }
  // Somente ativos públicos/estáticos em allowlist usam cache nomeado.
  assert.equal(primeira(routes, ctx("/_next/static/chunks/app.js"))?.handler.options?.cacheName, "next-static-assets")
  assert.equal(primeira(routes, ctx("/icons/icon-192x192.png"))?.handler.options?.cacheName, "public-pwa-assets")
  assert.equal(primeira(routes, ctx("/manifest.webmanifest"))?.handler.options?.cacheName, "public-pwa-assets")
  assert.notEqual(primeira(routes, ctx(RELATORIO[0], {}, "POST")), networkOnly[0], "regra deve ser exclusiva de GET")
})

test("sw.js de produção: offline não devolve relatório nem API/página guardada de outra loja/sessão", { skip }, async () => {
  const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8")
  const { routes, dependencies } = await coletarRotas(sw, PUBLIC)
  const guardado = JSON.stringify({ ok: true, produtos: [{ nome: "LOJA-2 SESSAO-ANTERIOR" }] })
  const cacheInicial = {
    apis: [...RELATORIO, "/api/version"].map((u) => [u, guardado]),
    pages: [["/dashboard/estoque", "<html>LOJA-2</html>"]],
    "public-pwa-assets": [["/icons/icon-192x192.png", "PNG-PUBLIC-ICON"]],
  }

  for (const url of [...RELATORIO, "/api/version", "/dashboard/estoque"]) {
    const wb = workboxReal(dependencies[0], { online: false, cacheInicial })
    const rota = primeira(routes, ctx(url, { "x-assistec-loja-id": "loja-1" }))
    await assert.rejects(
      () => estrategiaReal(wb, rota.handler).handle({ request: new Request(new URL(url, ORIGEM)), event: new wb.FetchEvent() }),
      (e) => e.name === "no-response",
      "offline deve falhar (sem fallback) em " + url,
    )
    assert.equal(wb.trace.fetches, 1, "deve tentar só a rede")
    assert.equal(wb.trace.cacheReads, 0, "leu cache no offline: " + url)
  }

  // Online: rede sempre, nada gravado em cache.
  const online = workboxReal(dependencies[0], { online: true, cacheInicial: {} })
  const rota = primeira(routes, ctx(RELATORIO[1]))
  const res = await estrategiaReal(online, rota.handler).handle({ request: new Request(new URL(RELATORIO[1], ORIGEM)), event: new online.FetchEvent() })
  assert.equal((await res.json()).origem, "rede")
  assert.equal(res.headers.get("cache-control"), "no-store, max-age=0")
  assert.equal(online.trace.cacheWrites + online.trace.cacheReads, 0, "relatório tocou o cache online")

  // Ativo público estático em allowlist segue legítimo offline.
  const estatico = workboxReal(dependencies[0], { online: false, cacheInicial })
  const rotaIcone = primeira(routes, ctx("/icons/icon-192x192.png"))
  const iconeServido = await estrategiaReal(estatico, rotaIcone.handler).handle({ request: new Request(new URL("/icons/icon-192x192.png", ORIGEM)), event: new estatico.FetchEvent() })
  assert.equal(await iconeServido.text(), "PNG-PUBLIC-ICON", "ativo público estático deve continuar acessível offline")
})

test("ativação do SW remove relatórios e rotas privadas guardadas antes da correção e preserva apenas ativos públicos", async () => {
  const preservar = [
    "/_next/static/chunks/app.js",
    "/icons/icon-192x192.png",
    "/manifest.webmanifest",
    "https://outra.example.invalid/api/vendas/produtos-vendidos",
  ].map((u) => new URL(u, ORIGEM).href)
  const remover = [
    ...RELATORIO,
    "/api/version?take=50",
    "/api/dashboardx/relatorios",
    "/api/pessoas",
    "/dashboard/relatorios-extra",
    "/api/version",
  ].map((u) => new URL(u, ORIGEM).href)
  const stores = new Map(["apis", "pages", "historico-antigo"].map((n) => [n, new Set([...remover, ...preservar])]))
  const listeners = [], pending = []
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC, "client-privacy-cache.js"), "utf8"), {
    URL,
    self: { location: new URL(ORIGEM + "/sw.js"), addEventListener: (type, fn) => { assert.equal(type, "activate"); listeners.push(fn) } },
    caches: {
      keys: async () => [...stores.keys()],
      open: async (n) => ({ keys: async () => [...stores.get(n)].map((u) => new Request(u)), delete: async (r) => stores.get(n).delete(r.url) }),
    },
  })
  assert.equal(listeners.length, 1)
  listeners[0]({ waitUntil: (p) => pending.push(p) })
  await Promise.all(pending)
  for (const [name, entries] of stores) assert.deepEqual([...entries], preservar, "cache " + name)
})

test("proteções Clientes/Pessoas do build continuam aceitas pelo inspetor oficial", { skip }, async () => {
  const r = await inspectPwaBuild(WS)
  assert.equal(r.offline.cacheAccesses, 0)
})

test("worker auxiliar swe-worker foi eliminado (cacheOnFrontEndNav: false), impedindo gravação de HTML/RSC", { skip }, async () => {
  const names = fs.readdirSync(PUBLIC).filter((n) => /^swe-worker-[a-f0-9]+\.js$/.test(n))
  assert.equal(names.length, 0, "swe-worker não deve ser emitido quando cacheOnFrontEndNav=false e cacheStartUrl=false")
})
