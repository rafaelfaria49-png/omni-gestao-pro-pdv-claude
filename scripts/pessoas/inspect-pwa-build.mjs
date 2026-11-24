/** Aceite do SW/worker emitidos pelo build real, sem depender de buscas por NetworkOnly. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"

const ORIGEM = "https://pessoas.example.invalid"
const pessoa = (url) => /^\/(api|dashboard)\/pessoas(?:\/|$)/.test(url.pathname)
const plain = (value) => JSON.parse(JSON.stringify(value))
const ALLOWED_CACHE_NAMES = new Set([
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "next-static-assets",
  "public-pwa-assets",
])
const FORBIDDEN_CACHE_NAMES = new Set([
  "apis",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "start-url",
  "next-data",
  "static-data-assets",
  "static-js-assets",
  "others",
  "cross-origin",
])

async function verificarCachePrivado(publicDir) {
  const file = path.join(publicDir, "client-privacy-cache.js")
  assert.ok(fs.statSync(file).isFile(), "script de privacidade ausente")
  const remover = [
    "/api/clientes", "/api/clientes/123?_rsc=synthetic", "/api/clients",
    "/api/import/clientes", "/api/ops/import/clientes", "/dashboard/clientes",
    "/dashboard/cadastros-v2?_rsc=synthetic",
    "/api/pessoas", "/api/pessoas/documentos?categoria=contrato",
    "/dashboard/pessoas", "/dashboard/pessoas/funcionarios?_rsc=synthetic",
    "/api/version", "/dashboard/estoque", "/api/clientes-extra",
  ].map((url) => new URL(url, ORIGEM).href)
  const preservar = [
    "/_next/static/chunks/app.js",
    "/icons/icon-192x192.png",
    "/manifest.webmanifest",
    "/apple-touch-icon.png",
    "https://outra.example.invalid/api/clientes",
  ].map((url) => new URL(url, ORIGEM).href)
  const stores = new Map(["pages", "apis", "historical-cache"].map((name) => [name, new Set([...remover, ...preservar])]))
  const listeners = [], pending = []
  const context = vm.createContext({
    URL,
    self: {
      location: new URL(ORIGEM + "/sw.js"),
      addEventListener(type, listener) {
        assert.equal(type, "activate", "script de privacidade registra evento inesperado")
        assert.equal(typeof listener, "function")
        listeners.push(listener)
      },
    },
    caches: {
      keys: async () => [...stores.keys()],
      open: async (name) => {
        assert.ok(stores.has(name), "script de privacidade criou cache inesperado")
        const entries = stores.get(name)
        return {
          keys: async () => [...entries].map((url) => new Request(url)),
          delete: async (request) => entries.delete(request.url),
        }
      },
    },
  })
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { timeout: 10_000, filename: file })
  assert.equal(listeners.length, 1, "script de privacidade deve registrar um listener activate")
  context.activate = listeners[0]
  context.event = { waitUntil(promise) { pending.push(Promise.resolve(promise)) } }
  vm.runInContext("activate(event)", context, { timeout: 10_000 })
  assert.equal(pending.length, 1, "ativação deve aguardar a limpeza com waitUntil")
  await Promise.all(pending)
  for (const [name, entries] of stores) {
    for (const url of remover) assert.ok(!entries.has(url), "cache histórico privado preservado: " + name + " " + url)
    assert.deepEqual([...entries], preservar, "ativação afetou assets públicos/cross-origin: " + name)
  }
}

export async function coletarRotas(source, publicDir) {
  const routes = [], manifest = [], dependencies = []
  const workbox = {}
  for (const kind of ["NetworkOnly", "NetworkFirst", "CacheFirst", "StaleWhileRevalidate", "ExpirationPlugin", "RangeRequestsPlugin", "CacheableResponsePlugin"]) {
    workbox[kind] = class { constructor(options = {}) { this.kind = kind; this.options = options } }
  }
  Object.assign(workbox, {
    clientsClaim() {}, cleanupOutdatedCaches() {},
    precacheAndRoute(entries) { manifest.push(...entries) },
    registerRoute(match, handler, method = "GET") { routes.push({ match, handler, method }) },
  })
  const define = (deps, factory) => {
    for (const dep of deps) {
      assert.match(dep, /^\.\/workbox-[a-f0-9]+$/)
      assert.ok(fs.existsSync(path.join(publicDir, dep + ".js")), "runtime Workbox referenciado ausente")
      dependencies.push(dep + ".js")
    }
    factory(workbox)
  }
  const self = { define, skipWaiting() {}, addEventListener() {}, location: new URL(ORIGEM + "/sw.js") }
  let privacyImported = false
  vm.runInNewContext(source, {
    self, define, URL, location: self.location,
    importScripts(...urls) {
      if (urls.length === 0) return
      assert.deepEqual(urls, ["/client-privacy-cache.js"], "SW importa script inesperado")
      assert.equal(privacyImported, false, "SW importa script de privacidade duplicado")
      privacyImported = true
    },
  }, { timeout: 10_000 })
  if (privacyImported) await verificarCachePrivado(publicDir)
  assert.ok(routes.length > 0 && manifest.length > 0, "SW vazio/sem manifesto")
  return { routes, manifest, dependencies }
}
function aceita(match, ctx) {
  if (typeof match === "function") return !!match(ctx)
  if (typeof match === "string") return new URL(match, ORIGEM).href === ctx.url.href
  const result = match.exec(ctx.url.href)
  return !!result && (ctx.sameOrigin || result.index === 0)
}
function contexto(url, headers = {}, method = "GET") {
  const parsed = new URL(url, ORIGEM)
  return { url: parsed, sameOrigin: parsed.origin === ORIGEM, request: new Request(parsed, { method, headers }) }
}
function primeira(routes, ctx) {
  return routes.find((r) => r.method === ctx.request.method && aceita(r.match, ctx))
}
function estrategia(handler) {
  return { kind: handler.kind, options: plain(handler.options) }
}

async function networkOnlyOffline(publicDir, dependency, options) {
  const workbox = {}
  let fetches = 0, cachesUsadas = 0
  class FetchEvent {
    waitUntil(promise) { void promise.catch(() => {}) }
  }
  const location = new URL(ORIGEM + "/sw.js")
  const define = (deps, factory) => { assert.deepEqual(plain(deps), ["exports"]); factory(workbox) }
  const context = {
    define, URL, Request, Response, Headers, FetchEvent, location,
    self: { location, addEventListener() {}, __WB_DISABLE_DEV_LOGS: true },
    fetch: async () => { fetches++; throw new TypeError("OFFLINE_SINTETICO") },
    caches: new Proxy({}, { get: () => () => { cachesUsadas++; throw new Error("CACHE_PESSOAS_PROIBIDO") } }),
    setTimeout, clearTimeout,
  }
  vm.runInNewContext(fs.readFileSync(path.join(publicDir, dependency), "utf8"), context, { timeout: 10_000 })
  assert.equal(typeof workbox.NetworkOnly, "function", "estratégia real Workbox ausente")
  const strategy = new workbox.NetworkOnly(options)
  await assert.rejects(() => strategy.handle({
    request: new Request(ORIGEM + "/dashboard/pessoas?_rsc=synthetic"), event: new FetchEvent(),
  }), (error) => error.name === "no-response")
  assert.equal(fetches, 1, "NetworkOnly deve tentar somente a rede")
  assert.equal(cachesUsadas, 0, "falha de rede Pessoas tentou cache/fallback")
}

export async function inspectPwaBuild(ws, log = () => {}) {
  const publicDir = path.join(ws, "public")
  assert.ok(fs.existsSync(path.join(ws, ".next/BUILD_ID")), "build de produção ausente")
  const pkgDir = path.join(ws, "node_modules/@ducanh2912/next-pwa")
  const version = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version
  const locked = JSON.parse(fs.readFileSync(path.join(ws, "package-lock.json"), "utf8")).packages["node_modules/@ducanh2912/next-pwa"].version
  assert.equal(version, "10.2.9", "contrato next-pwa mudou; reavaliar antes de aceitar")
  assert.equal(version, locked, "pacote instalado diverge do lockfile")
  const sw = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8")
  const { routes, manifest, dependencies } = await coletarRotas(sw, publicDir)
  assert.ok(manifest.every((entry) => !pessoa(new URL(typeof entry === "string" ? entry : entry.url, ORIGEM))), "Pessoas presente no precache")
  const networkOnly = routes.filter((r) => r.handler.kind === "NetworkOnly")
  assert.equal(networkOnly.length, 1, "exclusão NetworkOnly ausente/duplicada")
  assert.equal(networkOnly[0].method, "GET")
  assert.deepEqual(plain(networkOnly[0].handler.options), {}, "NetworkOnly tem plugins/cache/fallback inesperados")
  const nonNetworkOnly = routes.filter((r) => r !== networkOnly[0])
  assert.ok(nonNetworkOnly.length > 0, "regras estáticas públicas em allowlist ausentes")
  for (const route of nonNetworkOnly) {
    const cacheName = route.handler.options?.cacheName
    assert.ok(cacheName && ALLOWED_CACHE_NAMES.has(cacheName), "cache não autorizado na allowlist do SW: " + String(cacheName))
    assert.ok(!FORBIDDEN_CACHE_NAMES.has(cacheName), "bucket genérico proibido no SW: " + String(cacheName))
  }
  const peoplePaths = [
    "/api/pessoas", "/api/pessoas/documentos", "/api/pessoas/documentos?categoria=contrato",
    "/dashboard/pessoas", "/dashboard/pessoas/funcionarios", "/dashboard/pessoas/funcionarios?_rsc=synthetic",
    "/api/pessoas/anexo.json", "/api/pessoas/anexo.js", "/dashboard/pessoas/anexo.css", "/dashboard/pessoas/foto.png",
  ]
  const variants = [{}, { RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1", Purpose: "prefetch" }]
  const provas = []
  for (const url of peoplePaths) for (const headers of variants) {
    const ctx = contexto(url, headers)
    assert.equal(primeira(routes, ctx), networkOnly[0], "Pessoas caiu em cache: " + url)
    provas.push({ url, headers, handler: "NetworkOnly" })
  }
  const outrasPrivadas = [
    ["/", {}],
    ["/api/version", {}],
    ["/dashboard/estoque", {}],
    ["/dashboard/estoque?_rsc=synthetic", { RSC: "1" }],
    ["/dashboard/estoque?_rsc=synthetic", { RSC: "1", "Next-Router-Prefetch": "1" }],
    ["/api/pessoas-extra", {}],
    ["/dashboard/pessoas-extra", {}],
  ]
  for (const [url, headers] of outrasPrivadas) {
    const ctx = contexto(url, headers)
    assert.equal(primeira(routes, ctx), networkOnly[0], "rota privada/mesma origem caiu em cache: " + url)
    provas.push({ url, headers, handler: "NetworkOnly" })
  }
  const estaticasAllowlist = [
    ["/_next/static/chunks/app.js", "next-static-assets"],
    ["/icons/icon-192x192.png", "public-pwa-assets"],
    ["/manifest.webmanifest", "public-pwa-assets"],
  ]
  for (const [url, cache] of estaticasAllowlist) {
    const result = primeira(routes, contexto(url))
    assert.ok(result, "ativo público em allowlist sem rota: " + url)
    assert.equal(result.handler.options.cacheName, cache, "cache inesperado para ativo público " + url)
    provas.push({ url, headers: {}, handler: result.handler.kind, cache })
  }
  for (const crossUrl of [
    "https://outra.example.invalid/api/pessoas/documentos",
    "https://outra.example.invalid/dashboard/pessoas",
  ]) {
    assert.equal(primeira(routes, contexto(crossUrl)), undefined, "cross-origin arbitrário não deve ser cacheado: " + crossUrl)
  }
  assert.notEqual(primeira(routes, contexto("/api/pessoas", {}, "POST")), networkOnly[0], "regra NetworkOnly não é exclusiva GET")
  await networkOnlyOffline(publicDir, dependencies[0], networkOnly[0].handler.options)

  // OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001: cacheOnFrontEndNav=false e cacheStartUrl=false
  // eliminam completamente o worker auxiliar (swe-worker-*.js), impedindo warm-up/gravação em `pages`.
  const workers = fs.readdirSync(publicDir).filter((name) => /^swe-worker-[a-f0-9]+\.js$/.test(name))
  assert.equal(workers.length, 0, "worker auxiliar swe-worker não deve ser emitido com cacheOnFrontEndNav=false")

  log(`PWA next-pwa ${version}: ${peoplePaths.length * variants.length + outrasPrivadas.length} requests privados/mesma-origem em NetworkOnly; ${estaticasAllowlist.length} ativos públicos em allowlist`)
  log("worker auxiliar swe-worker ausente (cacheOnFrontEndNav=false, cacheStartUrl=false)")
  log("NetworkOnly real offline: 1 fetch, 0 acessos a cache, sem fallback")
  return {
    nextPwaVersion: version, provas, mensagensPessoas: 0, mensagensOutras: 0, workerName: null,
    swSha256: createHash("sha256").update(sw).digest("hex"),
    routes: routes.map((r) => ({ method: r.method, ...estrategia(r.handler) })),
    offline: { fetches: 1, cacheAccesses: 0, fallback: false },
  }
}
