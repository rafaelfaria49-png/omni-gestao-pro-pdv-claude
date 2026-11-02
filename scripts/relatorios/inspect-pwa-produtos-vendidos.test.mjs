/**
 * RELATORIOS-PRODUTOS-VENDIDOS-PWA-SAFETY-002 — aceite do Service Worker EMITIDO PELO BUILD.
 *
 * Carrega `public/sw.js` (gerado por `npm run build`) e prova, com o runtime Workbox real:
 *  - `/api/vendas/produtos-vendidos*` cai na regra NetworkOnly (antes da genérica `apis`);
 *  - offline, a estratégia real não lê nem grava cache, mesmo com relatório de outra loja guardado;
 *  - a limpeza na ativação remove respostas antigas do relatório e preserva os demais módulos;
 *  - Clientes/Pessoas continuam protegidos (inspetor oficial do Pessoas).
 *
 * Exige build de produção local; sem `.next/BUILD_ID` + `public/sw.js` o teste é pulado.
 *   npm run build && node --test scripts/relatorios/inspect-pwa-produtos-vendidos.test.mjs
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
  "/api/vendas/produtos-vendidos",
  "/api/vendas/produtos-vendidos?from=2026-10-01T03:00:00.000Z&to=2026-11-01T02:59:59.999Z&ordem=quantidade",
  "/api/vendas/produtos-vendidos?from=2026-10-01T03:00:00.000Z&to=2026-11-01T02:59:59.999Z&categoria=capinhas&q=pel&todos=1",
  "/api/vendas/produtos-vendidos/variantes?produtoId=p1&from=2026-10-01T03:00:00.000Z&to=2026-11-01T02:59:59.999Z",
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
  if (opts.plugins) opts.plugins = opts.plugins.map((p) => new wb.workbox[p.kind](p.options))
  return new wb.workbox[handler.kind](opts)
}

test("sw.js de produção: relatório de produtos vendidos é NetworkOnly antes da regra genérica", { skip }, async () => {
  const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8")
  const { routes } = await coletarRotas(sw, PUBLIC)
  const networkOnly = routes.filter((r) => r.handler.kind === "NetworkOnly")
  assert.equal(networkOnly.length, 1, "regra NetworkOnly ausente/duplicada")
  const apis = routes.findIndex((r) => r.handler.options?.cacheName === "apis")
  assert.ok(routes.indexOf(networkOnly[0]) < apis, "NetworkOnly precisa vir antes da regra genérica apis")
  for (const url of RELATORIO) {
    for (const headers of [{}, { "x-assistec-loja-id": "loja-1" }, { "x-assistec-loja-id": "loja-2" }]) {
      assert.equal(primeira(routes, ctx(url, headers)), networkOnly[0], "relatório caiu em cache: " + url)
    }
  }
  // Fronteiras: só estes caminhos mudaram; o resto segue a regra genérica de antes.
  for (const url of ["/api/vendas/historico", "/api/vendas/produtos-vendidos-extra", "/api/version"]) {
    assert.equal(primeira(routes, ctx(url)).handler.options.cacheName, "apis", "regressão em " + url)
  }
  assert.notEqual(primeira(routes, ctx(RELATORIO[0], {}, "POST")), networkOnly[0], "regra deve ser exclusiva de GET")
})

test("sw.js de produção: offline não devolve relatório guardado de outra loja/sessão", { skip }, async () => {
  const sw = fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8")
  const { routes, dependencies } = await coletarRotas(sw, PUBLIC)
  const guardado = JSON.stringify({ ok: true, produtos: [{ nome: "LOJA-2 SESSAO-ANTERIOR" }] })
  const cacheInicial = { apis: [...RELATORIO, "/api/vendas/historico"].map((u) => [u, guardado]) }

  for (const url of RELATORIO) {
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

  // Contraprova: a regra genérica (que o relatório usava antes) devolve o guardado offline.
  const antes = workboxReal(dependencies[0], { online: false, cacheInicial })
  const generica = primeira(routes, ctx("/api/vendas/historico"))
  const servido = await estrategiaReal(antes, generica.handler).handle({ request: new Request(new URL("/api/vendas/historico", ORIGEM)), event: new antes.FetchEvent() })
  assert.equal(await servido.text(), guardado, "contraprova: NetworkFirst genérico serve o cache offline")
})

test("ativação do SW remove relatórios guardados antes da correção e preserva o resto", async () => {
  const preservar = [
    "/api/vendas/historico?take=50", "/api/vendas/produtos-vendidos-extra", "/api/pessoas",
    "/dashboard/relatorios/produtos", "/api/version", "https://outra.example.invalid/api/vendas/produtos-vendidos",
  ].map((u) => new URL(u, ORIGEM).href)
  const remover = RELATORIO.map((u) => new URL(u, ORIGEM).href)
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
