import { createHash } from "node:crypto"

export const SESSION_COOKIE_BASE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const

export interface ExtractedSessionToken {
  cookieName: string
  cookieNames: string[]
  token: string
}

const DEFAULT_TTL_MS = 15 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 10_000

const SESSION_COOKIE_NAME_RE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/i

/**
 * Extrai tokens de sessão Auth.js do header `Cookie`, suportando cookies simples
 * e fragmentados (`.0`, `.1`, …) nos formatos HTTP e HTTPS (`__Secure-`).
 */
export function extractAuthSessionTokens(cookieHeader: string | null | undefined): ExtractedSessionToken[] {
  if (!cookieHeader) return []

  const rawCookies = new Map<string, string>()
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=")
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name || !value) continue
    rawCookies.set(name, value)
  }

  const results: ExtractedSessionToken[] = []
  for (const baseName of SESSION_COOKIE_BASE_NAMES) {
    const direct = rawCookies.get(baseName)
    if (direct) {
      results.push({ cookieName: baseName, cookieNames: [baseName], token: direct })
      continue
    }

    const chunks: Array<{ index: number; name: string; value: string }> = []
    const prefix = `${baseName}.`
    for (const [name, value] of rawCookies.entries()) {
      if (!name.startsWith(prefix)) continue
      const suffix = name.slice(prefix.length)
      if (!/^\d+$/.test(suffix)) continue
      chunks.push({ index: Number(suffix), name, value })
    }
    if (chunks.length > 0) {
      chunks.sort((a, b) => a.index - b.index)
      results.push({
        cookieName: baseName,
        cookieNames: chunks.map((c) => c.name),
        token: chunks.map((c) => c.value).join(""),
      })
    }
  }

  return results
}

/** Hash SHA-256 opaco: o token bruto nunca é retido em memória nem registrado. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export class SignoutTokenFence {
  private readonly entries = new Map<string, number>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(options?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  markSignedOut(tokens: readonly string[], now = Date.now()): void {
    this.pruneExpired(now)
    const expiresAt = now + this.ttlMs
    for (const token of tokens) {
      if (!token) continue
      const hash = hashSessionToken(token)
      // Re-insere para manter ordem de recência na evicção limitada.
      this.entries.delete(hash)
      this.entries.set(hash, expiresAt)
    }
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      this.entries.delete(oldestKey)
    }
  }

  unmark(tokens: readonly string[]): void {
    for (const token of tokens) {
      if (!token) continue
      this.entries.delete(hashSessionToken(token))
    }
  }

  isSignedOut(tokens: readonly string[], now = Date.now()): boolean {
    for (const token of tokens) {
      if (!token) continue
      const hash = hashSessionToken(token)
      const expiresAt = this.entries.get(hash)
      if (expiresAt === undefined) continue
      if (expiresAt > now) return true
      this.entries.delete(hash)
    }
    return false
  }

  size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  private pruneExpired(now: number): void {
    for (const [hash, expiresAt] of this.entries.entries()) {
      if (expiresAt <= now) this.entries.delete(hash)
    }
  }
}

const GLOBAL_FENCE_KEY = Symbol.for("omni.auth.signoutTokenFence")

type GlobalWithFence = typeof globalThis & {
  [GLOBAL_FENCE_KEY]?: SignoutTokenFence
}

/**
 * Instância compartilhada no processo Node entre `route.ts` (`/api/auth/*`) e `proxy.ts`.
 * Em `globalThis` para permanecer única mesmo quando Next.js avalia bundles separados.
 */
export function getSignoutTokenFence(): SignoutTokenFence {
  const g = globalThis as GlobalWithFence
  if (!g[GLOBAL_FENCE_KEY]) {
    g[GLOBAL_FENCE_KEY] = new SignoutTokenFence()
  }
  return g[GLOBAL_FENCE_KEY]
}

export function isSessionCookieSetHeader(setCookieValue: string): boolean {
  const firstPair = setCookieValue.split(";")[0] ?? ""
  const eq = firstPair.indexOf("=")
  if (eq <= 0) return false
  const name = firstPair.slice(0, eq).trim()
  return SESSION_COOKIE_NAME_RE.test(name)
}

export function isClearingSetCookieHeader(setCookieValue: string): boolean {
  const parts = setCookieValue.split(";").map((p) => p.trim())
  const firstPair = parts[0] ?? ""
  const eq = firstPair.indexOf("=")
  if (eq > 0 && firstPair.slice(eq + 1).trim() === "") return true
  for (const attr of parts.slice(1)) {
    if (/^max-age\s*=\s*0$/i.test(attr)) return true
    if (/^expires\s*=\s*thu,\s*01\s+jan\s+1970/i.test(attr)) return true
  }
  return false
}

export function buildSessionCookieClearHeaders(cookieNames: readonly string[]): string[] {
  const unique = [...new Set(cookieNames.length > 0 ? cookieNames : ["authjs.session-token"])]
  return unique.map((name) => {
    const secure = name.startsWith("__Secure-") ? "; Secure" : ""
    return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`
  })
}

export function getSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie()
  }
  const single = headers.get("set-cookie")
  return single ? [single] : []
}

/**
 * Remove qualquer `Set-Cookie` que reemita um cookie de sessão válido (`authjs.session-token*`),
 * preservando integralmente cabeçalhos de limpeza (`Max-Age=0`) e demais cookies da resposta.
 */
export function stripRestoringSessionCookies(response: Response): Response {
  const setCookies = getSetCookieHeaders(response.headers)
  const hasRestoringSessionCookie = setCookies.some(
    (cookie) => isSessionCookieSetHeader(cookie) && !isClearingSetCookieHeader(cookie),
  )
  if (!hasRestoringSessionCookie) return response

  const nextHeaders = new Headers(response.headers)
  nextHeaders.delete("set-cookie")
  for (const cookie of setCookies) {
    if (isSessionCookieSetHeader(cookie) && !isClearingSetCookieHeader(cookie)) {
      continue
    }
    nextHeaders.append("set-cookie", cookie)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  })
}

/**
 * Resposta de `/api/auth/session` quando o token de entrada pertence a uma sessão
 * já encerrada (antes ou durante o processamento concorrente da requisição).
 */
export function buildSignedOutSessionResponse(cookieNames: readonly string[]): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache, no-store",
    Pragma: "no-cache",
    Expires: "0",
  })
  for (const clearCookie of buildSessionCookieClearHeaders(cookieNames)) {
    headers.append("set-cookie", clearCookie)
  }
  return new Response("null", { status: 200, headers })
}

/**
 * Verifica se a resposta de `POST /api/auth/signout` efetivamente encerrou a sessão
 * limpando o cookie de sessão. Em rejeições de CSRF do Auth.js v5 (`302 .../error?error=MissingCSRF`
 * ou `200 {"url":".../error?error=MissingCSRF"}`), nenhum `Set-Cookie` de limpeza é emitido —
 * nesse caso a marcação na cerca é desfeita para impedir logout forjado (CSRF DoS).
 */
export function didSignoutClearSession(response: Response): boolean {
  const setCookies = getSetCookieHeaders(response.headers)
  return setCookies.some(
    (cookie) => isSessionCookieSetHeader(cookie) && isClearingSetCookieHeader(cookie),
  )
}

export interface AuthRouteHandlers<TRequest extends Request = Request> {
  GET: (req: TRequest) => Promise<Response> | Response
  POST: (req: TRequest) => Promise<Response> | Response
}

function requestPathname(req: Request): string {
  try {
    return new URL(req.url).pathname
  } catch {
    return ""
  }
}

async function handleFencedSessionRequest<TRequest extends Request>(
  req: TRequest,
  execute: (req: TRequest) => Promise<Response> | Response,
  fence: SignoutTokenFence,
): Promise<Response> {
  const incoming = extractAuthSessionTokens(req.headers.get("cookie"))
  const tokens = incoming.map((item) => item.token)
  const cookieNames = incoming.flatMap((item) => item.cookieNames)

  if (tokens.length > 0 && fence.isSignedOut(tokens)) {
    return buildSignedOutSessionResponse(cookieNames)
  }

  const response = await execute(req)

  if (tokens.length > 0 && fence.isSignedOut(tokens)) {
    return buildSignedOutSessionResponse(cookieNames)
  }

  return response
}

/**
 * Envolve os handlers GET/POST do Auth.js (`/api/auth/[...nextauth]`) com cerca
 * de encerramento de sessão:
 * - Em `POST /api/auth/signout`: marca o hash do token de entrada ANTES do handler
 *   assíncrono e desfaz se o Auth.js não emitir limpeza do cookie (ex.: falha de CSRF).
 * - Em `GET` e `POST /api/auth/session`: se o token de entrada já foi encerrado antes OU
 *   durante a consulta assíncrona ao banco, descarta a resposta autenticada e qualquer
 *   `Set-Cookie` reemitido, retornando `null` com limpeza explícita de todos os cookies
 *   de sessão recebidos (inclusive fragmentados `.0`/`.1`).
 * - O próximo login legítimo gera um JWT novo (hash distinto) e segue imediatamente.
 */
export function createAuthRouteHandlers<TRequest extends Request>(
  baseHandlers: AuthRouteHandlers<TRequest>,
  fence: SignoutTokenFence = getSignoutTokenFence(),
): AuthRouteHandlers<TRequest> {
  return {
    async GET(req: TRequest): Promise<Response> {
      const pathname = requestPathname(req)
      if (!pathname.endsWith("/session")) {
        return baseHandlers.GET(req)
      }
      return handleFencedSessionRequest(req, baseHandlers.GET, fence)
    },

    async POST(req: TRequest): Promise<Response> {
      const pathname = requestPathname(req)
      if (pathname.endsWith("/session")) {
        return handleFencedSessionRequest(req, baseHandlers.POST, fence)
      }
      if (!pathname.endsWith("/signout")) {
        return baseHandlers.POST(req)
      }

      const incoming = extractAuthSessionTokens(req.headers.get("cookie"))
      const tokens = incoming.map((item) => item.token)

      if (tokens.length > 0) {
        fence.markSignedOut(tokens)
      }

      try {
        const response = await baseHandlers.POST(req)
        if (tokens.length > 0 && !didSignoutClearSession(response)) {
          fence.unmark(tokens)
        }
        return response
      } catch (error) {
        if (tokens.length > 0) {
          fence.unmark(tokens)
        }
        throw error
      }
    },
  }
}
