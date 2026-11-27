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

/**
 * Cerca em memória limitada (defesa em profundidade no processo Node atual).
 *
 * CONTRATO DE SEGURANÇA DISTRIBUÍDA:
 * - A garantia de que respostas atrasadas (`/api/auth/session` ou `proxy.ts`) NUNCA
 *   restauram um cookie encerrado nem apagam o cookie de um novo login legítimo é
 *   **100% STATELESS** (`stripSessionCookies`): funciona entre instâncias serverless
 *   distintas, funções isoladas (`proxy` vs `route`) e cold starts, sem depender desta
 *   cerca nem de TTL/evicção.
 * - A revogação distribuída contra replay de cookie copiado após logout é garantida pelo
 *   PostgreSQL (`admin_sessions`) quando `AUTH_SESSION_REVOCATION=on`.
 * - Esta cerca atua como defesa complementar no mesmo processo para respostas JSON
 *   concorrentes de `/api/auth/session` e SÓ marca tokens APÓS o Auth.js validar CSRF
 *   e emitir limpeza de sessão — nunca antes (impedindo negação de serviço via CSRF
 *   forjado ou reversão de logout válido por tentativa concorrente rejeitada).
 */
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

export function getSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie()
  }
  const single = headers.get("set-cookie")
  return single ? [single] : []
}

/**
 * Remove TODOS os cabeçalhos `Set-Cookie` do cookie de sessão Auth.js (`authjs.session-token*`,
 * `__Secure-authjs.session-token*` e fragmentos `.0`/`.1`) de respostas de leitura/proxy,
 * preservando integralmente todos os demais cabeçalhos e cookies (ex.: `assistec-active-store`,
 * `authjs.csrf-token`).
 *
 * Por que remover tanto restaurações quanto limpezas em caminhos de leitura/proxy:
 * 1. Em runtime serverless distribuído (Vercel), respostas atrasadas de `GET/POST /api/auth/session`
 *    ou `proxy.ts` em outra instância/cold-start JAMAIS podem reemitir um cookie de sessão encerrado.
 * 2. Quando um logout é seguido rapidamente por um novo login legítimo (mesmo operador ou outro),
 *    uma resposta atrasada da sessão anterior JAMAIS pode enviar `Max-Age=0` e apagar o cookie
 *    recém-emitido do novo login.
 * 3. Somente fluxos explícitos de mutação de sessão (`signIn` / `POST /api/auth/callback/*` e
 *    `POST /api/auth/signout`) gravam ou limpam o cookie de sessão.
 */
export function stripSessionCookies(response: Response): Response {
  const setCookies = getSetCookieHeaders(response.headers)
  const hasSessionCookie = setCookies.some((cookie) => isSessionCookieSetHeader(cookie))
  if (!hasSessionCookie) return response

  const nextHeaders = new Headers(response.headers)
  nextHeaders.delete("set-cookie")
  for (const cookie of setCookies) {
    if (isSessionCookieSetHeader(cookie)) {
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
 * Resposta `200 null` de `/api/auth/session` para token já encerrado, SEM emitir
 * qualquer `Set-Cookie` (preserva eventual cookie de um novo login legítimo no navegador;
 * a limpeza explícita do cookie encerrado já foi emitida pelo `POST /api/auth/signout`).
 */
export function buildSignedOutSessionResponse(): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "private, no-cache, no-store",
    Pragma: "no-cache",
    Expires: "0",
  })
  return new Response("null", { status: 200, headers })
}

/**
 * Verifica se a resposta de `POST /api/auth/signout` efetivamente encerrou a sessão
 * limpando o cookie de sessão após validação de CSRF pelo Auth.js v5.
 * Em rejeições de CSRF (`302 .../error?error=MissingCSRF` ou `200 {"url":".../error?error=MissingCSRF"}`),
 * nenhum `Set-Cookie` de limpeza é emitido.
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

async function handleSessionRequest<TRequest extends Request>(
  req: TRequest,
  execute: (req: TRequest) => Promise<Response> | Response,
  fence: SignoutTokenFence,
): Promise<Response> {
  const incoming = extractAuthSessionTokens(req.headers.get("cookie"))
  const tokens = incoming.map((item) => item.token)

  if (tokens.length > 0 && fence.isSignedOut(tokens)) {
    return buildSignedOutSessionResponse()
  }

  const response = await execute(req)

  if (tokens.length > 0 && fence.isSignedOut(tokens)) {
    return buildSignedOutSessionResponse()
  }

  // Garantia stateless entre instâncias: consultas `/api/auth/session` jamais
  // reescrevem nem apagam o cookie de sessão no navegador.
  return stripSessionCookies(response)
}

/**
 * Envolve os handlers GET/POST do Auth.js (`/api/auth/[...nextauth]`):
 * - Em `GET` e `POST /api/auth/session`: remove qualquer `Set-Cookie` de sessão
 *   (proteção stateless contra restauração entre instâncias/cold-starts e contra
 *   remoção acidental de um novo login por resposta atrasada) e aplica a cerca local
 *   como defesa complementar para o corpo JSON.
 * - Em `POST /api/auth/signout`: executa primeiro o handler do Auth.js (que valida CSRF
 *   e emite `Set-Cookie: Max-Age=0`) e SÓ marca o token na cerca após confirmação de
 *   limpeza (`didSignoutClearSession`). Assim, tentativas com CSRF inválido nunca
 *   interrompem sessões legítimas nem desfazem logouts válidos concorrentes.
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
      return handleSessionRequest(req, baseHandlers.GET, fence)
    },

    async POST(req: TRequest): Promise<Response> {
      const pathname = requestPathname(req)
      if (pathname.endsWith("/session")) {
        return handleSessionRequest(req, baseHandlers.POST, fence)
      }
      if (!pathname.endsWith("/signout")) {
        return baseHandlers.POST(req)
      }

      const incoming = extractAuthSessionTokens(req.headers.get("cookie"))
      const tokens = incoming.map((item) => item.token)

      const response = await baseHandlers.POST(req)
      if (tokens.length > 0 && didSignoutClearSession(response)) {
        fence.markSignedOut(tokens)
      }
      return response
    },
  }
}
