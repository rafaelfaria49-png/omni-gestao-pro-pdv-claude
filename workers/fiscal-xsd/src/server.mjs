import { createHash, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import { POLICY, createFiscalXsdValidator, sanitizeMessage } from "./validator.mjs"

const HOST = process.env.FISCAL_XSD_HOST ?? "0.0.0.0"
const PORT = Number(process.env.FISCAL_XSD_PORT ?? "8080")
const MAX_HTTP_BYTES = POLICY.maxPayloadBytes + 64 * 1024
const MAX_QUEUE = 32

const validator = createFiscalXsdValidator()
const cache = new Map()
const jobHashes = new Map()
let active = 0
const queue = []

function json(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8")
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.byteLength),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  })
  response.end(payload)
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}

function requestIssue(request) {
  if (!request || typeof request !== "object") return "Envelope JSON inválido."
  if (!safeId(request.jobId) || !safeId(request.storeId) || !safeId(request.correlationId)) {
    return "Identificadores do envelope são inválidos."
  }
  if (request.contractVersion !== POLICY.contractVersion) return "Versão do contrato não autorizada."
  if (request.schemaVersion !== POLICY.schemaPackage) return "Versão do schema não autorizada."
  if (request.schemaManifestHash !== POLICY.schemaManifestHash) return "Hash do manifesto não autorizado."
  if (typeof request.xmlPayload !== "string") return "Payload XML ausente."
  const payloadBytes = Buffer.byteLength(request.xmlPayload, "utf8")
  if (request.payloadBytes !== payloadBytes) return "Tamanho declarado do XML divergente."
  if (payloadBytes > POLICY.maxPayloadBytes) return "Payload XML excede o limite."
  if (!Number.isInteger(request.maxPayloadBytes) || request.maxPayloadBytes < 1 || request.maxPayloadBytes > POLICY.maxPayloadBytes) {
    return "Limite de payload inválido."
  }
  const xmlHash = createHash("sha256").update(request.xmlPayload, "utf8").digest("hex")
  if (!secureEqual(request.xmlSha256, xmlHash)) return "Hash declarado do XML divergente."
  if (!Number.isInteger(request.attempt) || request.attempt < 1) return "Tentativa inválida."
  const deadline = Date.parse(request.deadline)
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return "Deadline expirado."
  return null
}

function responseFrom(request, result) {
  return {
    ...result,
    jobId: request.jobId,
    storeId: request.storeId,
    correlationId: request.correlationId,
    contractVersion: POLICY.contractVersion,
    schemaVersion: POLICY.schemaPackage,
    xmlSha256: request.xmlSha256,
    completedAt: new Date().toISOString(),
  }
}

function cacheKey(request) {
  return [
    request.jobId,
    request.storeId,
    request.xmlSha256,
    request.schemaVersion,
    request.schemaManifestHash,
  ].join(":")
}

async function executeValidation(request) {
  const jobKey = `${request.storeId}:${request.jobId}`
  const previousHash = jobHashes.get(jobKey)
  if (previousHash && previousHash !== request.xmlSha256) {
    return responseFrom(request, {
      valid: false,
      outcome: "HASH_DIVERGENTE",
      issues: [{
        code: "job_payload_changed",
        category: "INTEGRITY",
        message: "O mesmo jobId foi reutilizado com payload divergente.",
        retryable: false,
      }],
      engine: null,
      durationMs: 0,
    })
  }
  const key = cacheKey(request)
  const cached = cache.get(key)
  if (cached) return cached
  jobHashes.set(jobKey, request.xmlSha256)
  const result = await validator.validate(request.xmlPayload, {
    maxPayloadBytes: request.maxPayloadBytes,
    timeoutMs: Math.max(1, Date.parse(request.deadline) - Date.now()),
  })
  const response = responseFrom(request, result)
  cache.set(key, response)
  if (cache.size > 256) cache.delete(cache.keys().next().value)
  return response
}

function drainQueue() {
  if (active >= POLICY.concurrency) return
  const next = queue.shift()
  if (!next) return
  active += 1
  executeValidation(next.request)
    .then((result) => json(next.response, 200, result))
    .catch(() =>
      json(next.response, 500, {
        valid: false,
        outcome: "RESPOSTA_INCERTA",
        issues: [{
          code: "worker_queue_failure",
          category: "INFRASTRUCTURE",
          message: "Falha inconclusiva no worker XSD.",
          retryable: false,
        }],
        engine: null,
        durationMs: 0,
      }),
    )
    .finally(() => {
      active -= 1
      drainQueue()
    })
}

async function readJson(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.byteLength
    if (bytes > MAX_HTTP_BYTES) throw new Error("body-limit")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

const server = createServer(async (request, response) => {
  response.setHeader("connection", "close")
  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, { status: "ok", service: "fiscal-xsd-worker" })
    return
  }
  if (request.method === "GET" && request.url === "/ready") {
    try {
      const inspection = await validator.inspectIntegrity()
      json(response, 200, { status: "ready", engine: inspection.engine })
    } catch (error) {
      json(response, 503, {
        status: "not-ready",
        message: sanitizeMessage(error instanceof Error ? error.message : "Falha de integridade."),
      })
    }
    return
  }
  if (request.method !== "POST" || request.url !== "/validate") {
    json(response, 404, { error: "not-found" })
    return
  }
  if (request.headers["content-type"]?.split(";", 1)[0] !== "application/json") {
    json(response, 415, { error: "content-type-required" })
    return
  }
  let body
  try {
    body = await readJson(request)
  } catch {
    json(response, 400, { error: "invalid-json-or-size" })
    return
  }
  const issue = requestIssue(body)
  if (issue) {
    json(response, 422, { error: issue })
    return
  }
  if (queue.length >= MAX_QUEUE) {
    json(response, 503, { error: "backpressure" })
    return
  }
  queue.push({ request: body, response })
  drainQueue()
})

server.requestTimeout = 5_000
server.headersTimeout = 2_000
server.keepAliveTimeout = 1_000
server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ event: "worker_started", port: PORT, concurrency: POLICY.concurrency }))
})

function shutdown(signal) {
  console.log(JSON.stringify({ event: "worker_stopping", signal }))
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
