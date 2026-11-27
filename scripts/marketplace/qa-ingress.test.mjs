import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import { request } from "node:https"
import test from "node:test"
import forge from "node-forge"
import { createMarketplaceQaIngress } from "./qa-ingress.mjs"

function loopbackCertificate(hostname) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = "01"
  certificate.validity.notAfter = new Date(Date.now() + 60_000)
  const name = [{ name: "commonName", value: "Marketplace QA" }]
  certificate.setIssuer(name)
  certificate.setSubject(name)
  certificate.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: hostname }] }])
  certificate.sign(keys.privateKey, forge.md.sha256.create())
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(certificate) }
}

async function listen(server) {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return server.address().port
}

test("o ingresso HTTPS persiste só metadados fixos e mantém o retorno autenticado na mesma origem", async (context) => {
  const origin = "https://marketplace-qa.example.invalid"
  const hostname = new URL(origin).hostname
  const callback = "/api/marketplace/mercado-livre/callback"
  const location = origin + "/dashboard/marketplace?meli=authorized#conexoes-marketplace"
  const markers = {
    query: "qa-ingress-query", code: "qa-ingress-code", state: "qa-ingress-state",
    error_description: "qa-ingress-provider-error", access_token: "qa-access-fixture", refresh_token: "qa-refresh-fixture",
  }
  const authorization = "Bearer qa-ingress-authorization"
  const cookie = "__Host-omni-meli-oauth=qa-ingress-cookie"
  const trace = "qa-ingress-trace"
  const upstreamRequests = []
  const upstream = createServer((req, res) => {
    upstreamRequests.push({ url: req.url, headers: req.headers })
    res.writeHead(303, {
      location: req.url.includes("bad_redirect") ? location.replace("authorized", "qa-ingress-leak") : location,
      "set-cookie": "__Host-omni-meli-oauth=; Secure; HttpOnly; Path=/; Max-Age=0",
    }).end()
  })
  const upstreamPort = await listen(upstream)
  context.after(() => { upstream.close(); upstream.closeAllConnections() })
  const events = []
  const tls = loopbackCertificate(hostname)
  const ingress = createMarketplaceQaIngress({ origin, upstreamPort, tls, record: (event) => events.push(event) })
  const port = await listen(ingress)
  context.after(() => { ingress.close(); ingress.closeAllConnections() })

  const send = (path, headers = {}) => new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1", servername: hostname, port, path, ca: tls.cert,
      headers: { host: new URL(origin).host, ...headers },
    }, (res) => {
      res.resume()
      res.once("end", () => resolve(res))
    })
    req.on("error", reject)
    req.end()
  })

  const response = await send(callback + "?" + new URLSearchParams(markers), {
    authorization, cookie, referer: origin + "/callback?code=qa-ingress-referer",
    traceparent: trace, baggage: trace, tracestate: trace, "x-b3-traceid": trace,
    "x-request-id": trace, "x-forwarded-host": "forged.invalid", "x-forwarded-proto": "http",
    "x-original-url": callback + "?code=qa-ingress-copy",
  })
  assert.equal(response.statusCode, 303)
  assert.equal(response.headers.location, location)
  assert.equal(response.headers["referrer-policy"], "no-referrer")
  assert.equal(response.headers["cache-control"], "private, no-store")
  assert.equal(response.headers["set-cookie"]?.length, 1)
  assert.equal(upstreamRequests[0].headers.cookie === cookie, true)
  assert.equal(upstreamRequests[0].url.includes("code=" + markers.code), true)
  assert.equal(upstreamRequests[0].headers["x-forwarded-host"], new URL(origin).host)
  assert.equal(upstreamRequests[0].headers["x-forwarded-proto"], "https")
  assert.equal(upstreamRequests[0].headers["x-request-id"], events[0].requestId)
  for (const name of ["authorization", "referer", "traceparent", "baggage", "tracestate", "x-b3-traceid", "x-original-url"]) {
    assert.equal(name in upstreamRequests[0].headers, false, name)
  }

  const rejected = await send(callback + "?bad_redirect=1")
  assert.equal(rejected.statusCode, 502)
  assert.equal("location" in rejected.headers, false)
  assert.equal((await send(callback, { host: "forged.invalid" })).statusCode, 421)
  assert.equal((await send("/_vercel/insights/script.js?qa-ingress-query")).statusCode, 404)
  assert.equal(upstreamRequests.length, 2)
  assert.deepEqual(events.map(({ status }) => status), [303, 502, 421, 404])
  for (const event of events) {
    assert.deepEqual(Object.keys(event), ["requestId", "method", "route", "status"])
    assert.match(event.requestId, /^[0-9a-f-]{36}$/)
  }
  assert.doesNotMatch(JSON.stringify(events), /qa-(ingress|access|refresh)-|forged|[?&](?:code|state)=/i)
})
