#!/usr/bin/env node
/**
 * Smoke read-only contra um deploy (ex.: Vercel).
 *
 * Uso:
 *   BASE_URL=https://xxx.vercel.app node scripts/smoke-production.mjs
 *
 * Opcional — enviar loja ativa (algumas rotas ops filtram por header):
 *   X_ASSISTEC_LOJA_ID=loja-id BASE_URL=https://... node scripts/smoke-production.mjs
 *
 * Não escreve dados. Não lê nem imprime secrets.
 */

const BASE_URL = (process.env.BASE_URL || "").trim().replace(/\/$/, "")
const LOJA_HEADER = (process.env.X_ASSISTEC_LOJA_ID || "").trim()

if (!BASE_URL) {
  console.error("Defina BASE_URL, ex.: BASE_URL=https://seu-app.vercel.app node scripts/smoke-production.mjs")
  process.exit(1)
}

const PATHS = [
  "/",
  "/api/stores",
  "/api/debug/prod-health",
  "/api/ops/contas-receber-list",
  "/api/ops/contas-pagar-list",
  "/api/ops/ordens",
]

function summarizeJson(path, data) {
  if (data === null || typeof data !== "object") return ""

  const hints = []

  if (Array.isArray(data.stores)) hints.push(`stores=${data.stores.length}`)
  if (Array.isArray(data.rows)) hints.push(`rows=${data.rows.length}`)
  if (Array.isArray(data.ordens)) hints.push(`ordens=${data.ordens.length}`)
  if (Array.isArray(data.clientes)) hints.push(`clientes=${data.clientes.length}`)
  if (typeof data.ok === "boolean") hints.push(`ok=${data.ok}`)

  if (typeof data.storeIdResolved === "string" && data.storeIdResolved)
    hints.push(`storeIdResolved=${data.storeIdResolved}`)

  if (data.counts && typeof data.counts === "object") {
    const c = data.counts
    const parts = []
    for (const k of ["stores", "clientes", "produtos", "vendas"]) {
      if (typeof c[k] === "number") parts.push(`${k}=${c[k]}`)
    }
    if (parts.length) hints.push(`counts(${parts.join(" ")})`)
  }

  const counts = []
  for (const key of ["storesCount", "clientes", "produtos", "vendas"]) {
    if (typeof data[key] === "number") counts.push(`${key}=${data[key]}`)
  }
  if (counts.length) hints.push(counts.join(", "))

  if (data.summary && typeof data.summary === "object") {
    const s = data.summary
    const parts = []
    if (typeof s.quantidade === "number") parts.push(`q=${s.quantidade}`)
    if (typeof s.totalAberto === "number") parts.push(`aberto=${s.totalAberto}`)
    if (parts.length) hints.push(`summary(${parts.join(" ")})`)
  }

  if (typeof data.error === "string" && data.error) hints.push(`error="${truncate(data.error, 120)}"`)

  return hints.length ? ` | ${hints.join(" · ")}` : ""
}

function truncate(s, n) {
  if (s.length <= n) return s
  return `${s.slice(0, n)}…`
}

async function probe(path) {
  const url = `${BASE_URL}${path}`
  const headers = { accept: "application/json, text/html;q=0.9, */*;q=0.8" }
  if (LOJA_HEADER) headers["x-assistec-loja-id"] = LOJA_HEADER

  let status = 0
  let contentType = ""
  let bodySnippet = ""

  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "follow" })
    status = res.status
    contentType = res.headers.get("content-type") || ""

    const buf = await res.arrayBuffer()
    const max = 48_000
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf
    bodySnippet = new TextDecoder("utf-8", { fatal: false }).decode(slice)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`${path}  →  FALHA DE REDE  | ${msg}`)
    return
  }

  const head = bodySnippet.trimStart()
  const maybeJson = head.startsWith("{") || head.startsWith("[")

  let jsonOk = false
  let extra = ""

  if (contentType.includes("application/json") || maybeJson) {
    try {
      const data = JSON.parse(bodySnippet)
      jsonOk = true
      extra = summarizeJson(path, data)
    } catch {
      jsonOk = false
      extra = " | JSON inválido ou truncado"
    }
  } else {
    extra = " | corpo não-JSON (ex.: HTML da página)"
  }

  const authHint =
    status === 401 || status === 403
      ? " (esperado sem cookie/sessão — repetir com navegador logado ou header de loja)"
      : ""

  console.log(`${path}  →  HTTP ${status}${authHint}  | JSON=${jsonOk}${extra}`)
}

async function main() {
  console.log(`Smoke production — BASE_URL=${BASE_URL}${LOJA_HEADER ? ` · x-assistec-loja-id=${LOJA_HEADER}` : ""}`)
  console.log("—".repeat(72))
  for (const p of PATHS) {
    await probe(p)
  }
  console.log("—".repeat(72))
  console.log("Concluído. 401/403 em rotas /api/ops/* podem ser normais sem autenticação.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
