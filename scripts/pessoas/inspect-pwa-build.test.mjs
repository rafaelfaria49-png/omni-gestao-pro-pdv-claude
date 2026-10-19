import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { coletarRotas } from "./inspect-pwa-build.mjs"

const privacy = fs.readFileSync(new URL("../../public/client-privacy-cache.js", import.meta.url), "utf8")
const routes = `define([], (workbox) => {
  workbox.precacheAndRoute([{ url: "/static.js", revision: "synthetic" }]);
  workbox.registerRoute(() => true, new workbox.NetworkOnly());
});`
const allowed = 'importScripts("/client-privacy-cache.js");'

function fixture(t, script = privacy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pwa-inspector-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  if (script !== null) fs.writeFileSync(path.join(dir, "client-privacy-cache.js"), script)
  return dir
}

test("import local executa a ativação real: remove Clientes e preserva Pessoas/outros em todos os caches", async (t) => {
  const result = await coletarRotas(allowed + routes, fixture(t))
  assert.equal(result.routes[0].handler.kind, "NetworkOnly")
  assert.equal(result.manifest.length, 1)
})

test("SW anterior sem imports e importScripts vazio continuam aceitos", async (t) => {
  const dir = fixture(t, null)
  await coletarRotas(routes, dir)
  await coletarRotas("importScripts();" + routes, dir)
})

for (const urls of [
  ["/unknown.js"], ["https://externo.invalid/client-privacy-cache.js"],
  ["https://pessoas.example.invalid/client-privacy-cache.js"], ["//externo.invalid/client-privacy-cache.js"],
  ["client-privacy-cache.js"], ["/client-privacy-cache.js?version=1"],
  ["/sub/../client-privacy-cache.js"], ["/client-privacy-cache.js", "/extra.js"],
  ["/extra.js", "/client-privacy-cache.js"], ["/client-privacy-cache.js", "/client-privacy-cache.js"],
]) {
  test("recusa import não exato/extra: " + JSON.stringify(urls), async (t) => {
    await assert.rejects(coletarRotas(`importScripts(...${JSON.stringify(urls)});` + routes, fixture(t)), /SW importa script inesperado/)
  })
}

test("recusa chamada extra, mesmo após import permitido", async (t) => {
  await assert.rejects(coletarRotas(allowed + 'importScripts("/extra.js");' + routes, fixture(t)), /script inesperado/)
  await assert.rejects(coletarRotas(allowed + allowed + routes, fixture(t)), /duplicado/)
})

test("exige arquivo local presente e regular", async (t) => {
  const dir = fixture(t, null)
  await assert.rejects(coletarRotas(allowed + routes, dir), /ENOENT/)
  fs.mkdirSync(path.join(dir, "client-privacy-cache.js"))
  await assert.rejects(coletarRotas(allowed + routes, dir), /script de privacidade ausente/)
})

for (const [name, script, error] of [
  ["sem listener", "", /listener activate/],
  ["evento incorreto", privacy.replace('"activate"', '"fetch"'), /evento inesperado/],
  ["sem waitUntil", 'self.addEventListener("activate", () => {});', /waitUntil/],
  ["limpeza neutralizada", privacy.replace("await cache.delete(request)", "void request"), /Clientes preservado/],
  ["remove Pessoas", privacy.replace('url.pathname === "/api/clientes"', 'url.pathname === "/api/pessoas" || url.pathname === "/api/clientes"'), /afetou Pessoas/],
  ["remove outro módulo", privacy.replace('url.pathname === "/api/clientes"', 'url.pathname === "/dashboard/estoque" || url.pathname === "/api/clientes"'), /afetou Pessoas\/outros/],
  ["ignora cache histórico", privacy.replace("await caches.keys()", '(await caches.keys()).slice(0, 1)'), /Clientes preservado/],
  ["falha assíncrona", 'self.addEventListener("activate", e => e.waitUntil(Promise.reject(new Error("PURGE_FAILED"))));', /PURGE_FAILED/],
  ["import transitivo", 'importScripts("/extra.js");' + privacy, /importScripts is not defined/],
  ["sem acesso a Node", "process.exit(0);" + privacy, /process is not defined/],
]) {
  test("recusa privacidade inválida: " + name, async (t) => {
    await assert.rejects(coletarRotas(allowed + routes, fixture(t, script)), error)
  })
}

test("mantém rejeição de SW vazio e dependência Workbox ausente", async (t) => {
  const dir = fixture(t)
  await assert.rejects(coletarRotas(allowed, dir), /SW vazio/)
  await assert.rejects(coletarRotas('define(["./workbox-abc"], () => {});', dir), /Workbox referenciado ausente/)
})
