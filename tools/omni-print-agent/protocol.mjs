// Omni Print local agent — wire protocol helpers (no dependencies). OMNI-PRINT-004C candidate.
import { createHash } from "node:crypto"

export const AGENT_VERSION = "omni-print-agent/0.2.0-d04"
export const REASONS = Object.freeze({
  PRINTER_NOT_FOUND: "PRINTER_NOT_FOUND", PRINTER_OFFLINE: "PRINTER_OFFLINE", PRINTER_PAUSED: "PRINTER_PAUSED",
  PRINTER_ERROR: "PRINTER_ERROR", PAPER_OUT: "PAPER_OUT", SPOOLER_UNAVAILABLE: "SPOOLER_UNAVAILABLE",
  OPEN_FAILED: "OPEN_FAILED", START_DOC_FAILED: "START_DOC_FAILED", WRITE_FAILED: "WRITE_FAILED", END_DOC_FAILED: "END_DOC_FAILED",
  PAYLOAD_REFUSED: "PAYLOAD_REFUSED", TIMEOUT_BEFORE_SUBMIT: "TIMEOUT_BEFORE_SUBMIT", TIMEOUT_AFTER_SUBMIT: "TIMEOUT_AFTER_SUBMIT",
  AGENT_RESTARTED: "AGENT_RESTARTED", NOT_FOUND_IN_JOURNAL: "NOT_FOUND_IN_JOURNAL",
})

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex")

/**
 * Same allow-list as lib/printing/direct/renderer.ts#validateEscPos: the agent refuses any command
 * outside the non-fiscal receipt subset (no drawer kick ESC p, no DLE real-time, no GS ( functions).
 */
export function validateEscPos(bytes) {
  let i = 0, cut = false
  while (i < bytes.length) {
    const b = bytes[i]
    if (b === 0x0a || (b >= 0x20 && b !== 0x7f)) { i++; continue }
    if (b === 0x1b) {
      const c = bytes[i + 1], n = bytes[i + 2]
      if (c === 0x40) { i += 2; continue }
      if (c === 0x74 && n === 16) { i += 3; continue }
      if (c === 0x61 && n !== undefined && n <= 2) { i += 3; continue }
      if (c === 0x45 && (n === 0 || n === 1)) { i += 3; continue }
      if (c === 0x64 && n !== undefined && n <= 10) { i += 3; continue }
      return false
    }
    if (b === 0x1d && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x00) { cut = true; i += 3; continue }
    return false
  }
  return cut && bytes.length > 0
}

/** Server URL policy: https only (loopback http allowed for a disposable lab). No credentials, no path tricks. */
export function normalizeServerUrl(raw) {
  const u = new URL(String(raw))
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]"
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) throw new Error("SERVER_URL_MUST_BE_HTTPS")
  if (u.username || u.password || u.search || u.hash) throw new Error("SERVER_URL_INVALID")
  return u.origin
}

export class HttpError extends Error {
  constructor(status, code) { super(code || "HTTP_" + status); this.status = status; this.code = code }
}

/** Minimal JSON client: no redirects, no cookies, bounded response, explicit timeout. */
export function createClient({ serverUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const origin = normalizeServerUrl(serverUrl)
  return async function call(path, body) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      let res, text
      try {
        res = await fetchImpl(origin + path, { method: "POST", redirect: "error", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body ?? {}) })
        text = await res.text()
      } catch (err) {
        // Only a transport failure is retryable. A local TypeError elsewhere must stop the agent.
        if (err instanceof TypeError || err?.name === 'AbortError' || err?.name === 'TimeoutError') err.transportFailure = true
        throw err
      }
      if (text.length > 4 * 1024 * 1024) throw new HttpError(502, "RESPONSE_TOO_LARGE")
      let json = {}
      try { json = text ? JSON.parse(text) : {} } catch { throw new HttpError(res.status, "INVALID_JSON") }
      if (!res.ok || json.ok !== true) throw new HttpError(res.status, json.error)
      return json
    } finally { clearTimeout(timer) }
  }
}
