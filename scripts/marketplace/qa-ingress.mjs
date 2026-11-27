import { randomUUID } from "node:crypto"
import { request } from "node:http"
import { createServer } from "node:https"

const callback = "/api/marketplace/mercado-livre/callback"
const hub = "/dashboard/marketplace"
const callbackResults = new Set([
  "authorized", "session_required", "not_configured", "invalid_state", "invalid_seller_id", "denied",
  "account_mismatch", "test_seller_required", "insufficient_permissions", "reconnect_required",
  "disconnected", "operation_in_progress", "invalid_cursor", "rate_limited", "communication_error",
])
const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
const hopByHop = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "transfer-encoding", "upgrade",
])
const traceHeaders = new Set(["traceparent", "tracestate", "baggage", "sentry-trace", "b3"])

function filteredHeaders(headers) {
  const nominated = new Set((headers.connection ?? "").toLowerCase().split(",").map((name) => name.trim()))
  return Object.fromEntries(Object.entries(headers).filter(([name]) =>
    !hopByHop.has(name) && !nominated.has(name) && !traceHeaders.has(name) &&
    !name.startsWith("x-b3-") && !name.startsWith("x-otel-") && !name.startsWith("x-datadog-"),
  ))
}

function fail(res, status) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, { "cache-control": "no-store", "referrer-policy": "no-referrer" }).end()
}

function validCallbackLocation(location, origin) {
  if (typeof location !== "string") return false
  try {
    const url = new URL(location, origin)
    const params = [...url.searchParams]
    return url.origin === origin && url.pathname === hub && url.hash === "#conexoes-marketplace" &&
      !url.username && !url.password && params.length === 1 && params[0][0] === "meli" && callbackResults.has(params[0][1])
  } catch {
    return false
  }
}

// O Node termina TLS. O app recebe a URL e a sessão somente no loopback.
// O único registro de requisição é criado a partir de campos fixos.
export function createMarketplaceQaIngress({ origin, upstreamPort, tls, record }) {
  const canonical = new URL(origin)
  if (canonical.protocol !== "https:" || canonical.origin !== origin ||
      !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
    throw new Error("Configuração do ingresso Marketplace QA inválida.")
  }

  const server = createServer({ ...tls, minVersion: "TLSv1.2" }, (req, res) => {
    const requestId = randomUUID()
    const method = methods.has(req.method) ? req.method : "OTHER"
    const target = req.url ?? ""
    const validTarget = target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")
    const pathname = validTarget ? new URL(target, origin).pathname : ""
    const route = pathname === callback ? callback : pathname === hub ? hub : "other"
    res.once("finish", () => record({ requestId, method, route, status: res.statusCode }))
    res.once("close", () => {
      if (!res.writableFinished) record({ requestId, method, route, status: 499 })
    })

    if (!validTarget) return fail(res, 400)
    if (req.headers.host?.toLowerCase() !== canonical.host) return fail(res, 421)
    if (pathname.startsWith("/_vercel/")) return fail(res, 404)

    const incoming = filteredHeaders(req.headers)
    for (const name of Object.keys(incoming)) {
      if (name === "forwarded" || name === "referer" || name === "referrer" || name === "x-real-ip" ||
          name.startsWith("x-forwarded-") || name.startsWith("x-vercel-") || name.startsWith("x-middleware-") ||
          name.startsWith("x-nextjs-") || /^x-(original|rewrite)-(url|uri|path)$/.test(name)) delete incoming[name]
    }
    if (route === callback) delete incoming.authorization
    const upstream = request({
      hostname: "127.0.0.1", port: upstreamPort, path: target, method: req.method,
      headers: {
        ...incoming, host: canonical.host, "x-forwarded-host": canonical.host,
        "x-forwarded-proto": "https", "x-forwarded-port": canonical.port || "443", "x-request-id": requestId,
      },
    }, (response) => {
      const status = response.statusCode ?? 502
      if (route === callback && status >= 300 && status < 400 &&
          !validCallbackLocation(response.headers.location, origin)) {
        response.resume()
        fail(res, 502)
        return
      }
      const outgoing = filteredHeaders(response.headers)
      outgoing["referrer-policy"] = "no-referrer"
      if (route === callback) outgoing["cache-control"] = "private, no-store"
      outgoing["x-request-id"] = requestId
      response.on("error", () => fail(res, 502))
      res.writeHead(status, outgoing)
      response.pipe(res)
    })
    upstream.setTimeout(60_000, () => upstream.destroy())
    upstream.on("error", () => fail(res, 502))
    req.on("error", () => upstream.destroy())
    res.on("close", () => upstream.destroy())
    req.pipe(upstream)
  })
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
  })
  return server
}

// Só publica o socket HTTPS quando a instância Next recém-criada confirmou o próprio bind.
export function waitForQaNext(app) {
  return new Promise((resolve, reject) => {
    let recent = ""
    const timeout = setTimeout(notReady, 120_000)
    const stdout = app.stdout
    function cleanup() {
      clearTimeout(timeout)
      stdout.off("data", onData)
      app.off("error", notReady)
      app.off("exit", notReady)
    }
    function notReady() {
      cleanup()
      reject(new Error("Next.js de QA indisponível."))
    }
    function onData(chunk) {
      recent = (recent + chunk).slice(-512)
      if (!/Ready in [\d.]+\s?(?:ms|s)\b/.test(recent)) return
      cleanup()
      resolve()
    }
    stdout.on("data", onData)
    app.once("error", notReady)
    app.once("exit", notReady)
  })
}
