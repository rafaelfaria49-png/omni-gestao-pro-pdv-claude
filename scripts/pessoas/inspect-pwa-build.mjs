/** Aceite do SW/worker emitidos pelo build real, sem depender de buscas por NetworkOnly. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import vm from "node:vm"

const ORIGEM = "https://pessoas.example.invalid"
const pessoa = (url) => /^\/(api|dashboard)\/pessoas(?:\/|$)/.test(url.pathname)
const plain = (value) => JSON.parse(JSON.stringify(value))

function coletarRotas(source, publicDir) {
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
  vm.runInNewContext(source, {
    self, define, URL, location: self.location,
    importScripts(...urls) { assert.equal(urls.length, 0, "SW importa script inesperado") },
  }, { timeout: 10_000 })
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
function estrategiaPadrao(rule) {
  const options = {}, plugins = []
  // A conversão Workbox respeita a ordem original das opções/plugins.
  for (const [key, value] of Object.entries(rule.options ?? {})) {
    if (key === "expiration") plugins.push({ kind: "ExpirationPlugin", options: value })
    else if (key === "cacheableResponse") plugins.push({ kind: "CacheableResponsePlugin", options: value })
    else if (key === "rangeRequests") plugins.push({ kind: "RangeRequestsPlugin", options: {} })
    else if (key === "plugins") plugins.push(...value)
    else options[key] = value
  }
  if (Object.keys(options).length || plugins.length) options.plugins = plugins
  return { kind: rule.handler, options: plain(options) }
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

async function mensagem(source, data, cacheHit = false) {
  const trace = []
  const self = { location: new URL(ORIGEM + "/swe-worker.js") }
  const caches = { open: async (name) => {
    trace.push(["open", name])
    return {
      match: async (url, options) => { trace.push(["match", String(url), options ?? null]); return cacheHit ? new Response("cached") : undefined },
      put: async (url) => { trace.push(["put", name, String(url)]) },
      add: async (url) => { trace.push(["add", name, String(url)]) },
    }
  } }
  const fetch = async (url) => { trace.push(["fetch", String(url)]); return new Response("synthetic", { headers: { "Content-Type": "text/html" } }) }
  vm.runInNewContext(source, { self, caches, fetch, URL, Promise }, { timeout: 10_000 })
  assert.equal(typeof self.onmessage, "function", "worker sem handler")
  await self.onmessage({ data })
  return plain(trace)
}
function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? arquivos(file) : [file]
  })
}

export async function inspectPwaBuild(ws, log = () => {}) {
  const publicDir = path.join(ws, "public")
  assert.ok(fs.existsSync(path.join(ws, ".next/BUILD_ID")), "build de produção ausente")
  const pkgDir = path.join(ws, "node_modules/@ducanh2912/next-pwa")
  const version = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version
  const locked = JSON.parse(fs.readFileSync(path.join(ws, "package-lock.json"), "utf8")).packages["node_modules/@ducanh2912/next-pwa"].version
  assert.equal(version, "10.2.9", "contrato next-pwa mudou; reavaliar antes de aceitar")
  assert.equal(version, locked, "pacote instalado diverge do lockfile")
  const { runtimeCaching: defaults } = await import(pathToFileURL(path.join(pkgDir, "dist/index.js")).href)
  const sw = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8")
  const { routes, manifest, dependencies } = coletarRotas(sw, publicDir)
  assert.ok(manifest.every((entry) => !pessoa(new URL(typeof entry === "string" ? entry : entry.url, ORIGEM))), "Pessoas presente no precache")
  const networkOnly = routes.filter((r) => r.handler.kind === "NetworkOnly")
  assert.equal(networkOnly.length, 1, "exclusão NetworkOnly ausente/duplicada")
  assert.equal(networkOnly[0].method, "GET")
  assert.deepEqual(plain(networkOnly[0].handler.options), {}, "Pessoas tem plugins/cache/fallback")
  const genericas = routes.filter((r) => r !== networkOnly[0] && r.handler.options.cacheName !== "start-url")
  assert.equal(genericas.length, defaults.length, "regras genéricas removidas/adicionadas")
  for (let i = 0; i < defaults.length; i++) {
    assert.deepEqual(estrategia(genericas[i].handler), estrategiaPadrao(defaults[i]), "estratégia/options/ordem alterados: " + defaults[i].options.cacheName)
    assert.equal(genericas[i].method, defaults[i].method ?? "GET")
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
    assert.equal(primeira(routes, ctx), networkOnly[0], "Pessoas caiu em cache genérico: " + url)
    provas.push({ url, headers, handler: "NetworkOnly" })
  }
  const outras = [
    ["/api/version", {}, "apis"], ["/dashboard/estoque", {}, "pages"],
    ["/dashboard/estoque?_rsc=synthetic", { RSC: "1" }, "pages-rsc"],
    ["/dashboard/estoque?_rsc=synthetic", { RSC: "1", "Next-Router-Prefetch": "1" }, "pages-rsc-prefetch"],
    ["/api/pessoas-extra", {}, "apis"], ["/dashboard/pessoas-extra", {}, "pages"],
    ["https://outra.example.invalid/api/pessoas/documentos", {}, "cross-origin"],
    ["https://outra.example.invalid/dashboard/pessoas", {}, "cross-origin"],
  ]
  for (const [url, headers, cache] of outras) {
    const ctx = contexto(url, headers)
    const result = primeira(routes, ctx)
    const old = defaults.find((r) => (r.method ?? "GET") === "GET" && aceita(r.urlPattern, ctx))
    assert.ok(old, "baseline não encontrou rota")
    assert.equal(result.handler.options.cacheName, cache, "regressão na rota " + url)
    assert.deepEqual(estrategia(result.handler), estrategiaPadrao(old))
    provas.push({ url, headers, handler: result.handler.kind, cache })
  }
  assert.notEqual(primeira(routes, contexto("/api/pessoas", {}, "POST")), networkOnly[0], "regra Pessoas não é exclusiva GET")
  await networkOnlyOffline(publicDir, dependencies[0], networkOnly[0].handler.options)

  const workers = fs.readdirSync(publicDir).filter((name) => /^swe-worker-[a-f0-9]+\.js$/.test(name))
  assert.equal(workers.length, 1, "worker auxiliar ausente/ambíguo")
  const workerName = workers[0]
  const bytes = fs.readFileSync(path.join(publicDir, workerName))
  const worker = bytes.toString("utf8")
  const entry = manifest.find((e) => typeof e !== "string" && new URL(e.url, ORIGEM).pathname === "/" + workerName)
  assert.ok(entry, "worker transformado não consta no manifesto")
  assert.equal(entry.revision, createHash("md5").update(bytes).digest("hex"), "revision não corresponde ao worker transformado")
  const references = arquivos(path.join(ws, ".next/static")).filter((file) => file.endsWith(".js") && fs.readFileSync(file, "utf8").includes("/" + workerName))
  assert.ok(references.length > 0, "cliente não referencia worker real; cacheOnFrontEndNav pode estar desligado")
  const original = fs.readFileSync(path.join(pkgDir, "dist/sw-entry-worker.js"), "utf8")
  let mensagensPessoas = 0, mensagensOutras = 0
  for (const type of ["__FRONTEND_NAV_CACHE__", "__START_URL_CACHE__"]) {
    for (const url of [...peoplePaths, ORIGEM + "/dashboard/pessoas?query=synthetic", ORIGEM + "/api/pessoas/documentos"]) {
      for (const cacheHit of [false, true]) for (const shouldCacheAggressively of [false, true]) {
        assert.deepEqual(await mensagem(worker, { type, url, shouldCacheAggressively }, cacheHit), [], "worker leu/gravou/aqueceu Pessoas: " + url)
        mensagensPessoas++
      }
    }
    for (const url of ["/dashboard/estoque", "/api/pessoas-extra", "https://outra.example.invalid/dashboard/pessoas"]) {
      for (const cacheHit of [false, true]) for (const shouldCacheAggressively of [false, true]) {
        const data = { type, url, shouldCacheAggressively }
        const trace = await mensagem(worker, data, cacheHit)
        const anterior = await mensagem(original, data, cacheHit)
        assert.deepEqual(trace, anterior, "worker mudou comportamento não-Pessoas: " + url)
        if (type === "__FRONTEND_NAV_CACHE__" && !cacheHit) {
          assert.ok(trace.some((r) => r[0] === "fetch"))
          assert.ok(trace.some((r) => r[0] === "put" && r[1] === "pages"))
        }
        mensagensOutras++
      }
    }
  }
  log(`PWA next-pwa ${version}: ${peoplePaths.length * variants.length} requests Pessoas NetworkOnly; ${outras.length} rotas de regressão preservadas`)
  log(`worker real: ${mensagensPessoas} mensagens Pessoas sem fetch/cache; ${mensagensOutras} mensagens externas preservadas; revision MD5 conferida`)
  log("NetworkOnly real offline: 1 fetch, 0 acessos a cache, sem fallback")
  return {
    nextPwaVersion: version, provas, mensagensPessoas, mensagensOutras, workerName,
    workerRevision: entry.revision, workerSha256: createHash("sha256").update(bytes).digest("hex"),
    swSha256: createHash("sha256").update(sw).digest("hex"),
    routes: routes.map((r) => ({ method: r.method, ...estrategia(r.handler) })),
    offline: { fetches: 1, cacheAccesses: 0, fallback: false },
  }
}
