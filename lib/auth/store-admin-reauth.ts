/**
 * Reautenticação da administradora da loja (ADMIN STORE) — GOAL
 * PADARIA-STORE-ADMIN-CASH-AUTH-001.
 *
 * O Caixa Seguro dependia do PIN GLOBAL de supervisor (`User.pin`, sem `storeId`): a
 * cliente só conseguia fechar o caixa conhecendo o mesmo segredo das contas internas.
 * Aqui a aprovação passa a ser a SENHA DE LOGIN da própria conta (`AdminUser.password`),
 * conferida no servidor, e vira uma autorização curta e assinada.
 *
 * Contrato do token (mesma construção de `pin-authorization.ts`, domínio separado):
 *  - **assinatura**: HMAC-SHA256 com chave derivada de `AUTH_SECRET` pelo schema deste
 *    módulo — um token de PIN nunca verifica aqui, nem o contrário;
 *  - **vínculo**: `userId` (a própria administradora), `storeId`, `action`, `resource`
 *    (a sessão de caixa) e `sv` (`sessionVersion`: revogar a sessão mata a autorização);
 *  - **expiração**: `exp` conferido sempre no servidor.
 *
 * Nenhuma senha entra neste módulo. Web Crypto, para ficar Edge-safe como o irmão.
 */

/** Schema versionado — mudar o contrato invalida todos os tokens antigos. */
export const STORE_ADMIN_REAUTH_SCHEMA = "omni.store.admin-reauth/v1" as const

/** Cookie próprio: não sobrescreve nem é lido como `assistec_admin_session` (PIN). */
export const STORE_ADMIN_REAUTH_COOKIE = "assistec_store_admin_reauth"

/**
 * 15 min, como a co-assinatura por PIN. O resumo revelado dura 5 min na tela; a folga
 * cobre a contagem da gaveta com o modal de fechamento já aberto.
 */
export const STORE_ADMIN_REAUTH_MAX_AGE_SECONDS = 15 * 60

/** Ação única do Caixa Seguro: ver o resumo, sangria, suprimento e fechamento. */
export const CAIXA_SEGURO_ACTION = "caixa_seguro" as const

export type StoreAdminReauthPayload = Readonly<{
  v: typeof STORE_ADMIN_REAUTH_SCHEMA
  /** `AdminUser.id` da administradora que confirmou a própria senha. */
  userId: string
  storeId: string
  action: string
  /** `SessaoCaixa.id` aprovada. */
  resource: string
  /** `AdminUser.sessionVersion` na emissão. */
  sv: number
  iat: number
  exp: number
  nonce: string
}>

export type StoreAdminReauthFailure =
  | "missing_server_secret"
  | "missing_cookie"
  | "malformed_token"
  | "invalid_signature"
  | "schema_mismatch"
  | "expired"
  | "user_mismatch"
  | "store_mismatch"
  | "action_mismatch"
  | "resource_mismatch"
  | "session_version_mismatch"

export type StoreAdminReauthVerification =
  | { ok: true; payload: StoreAdminReauthPayload }
  | { ok: false; reason: StoreAdminReauthFailure }

type SessionLike = {
  user?: { id?: string; role?: string; accessScope?: string | null; platformAuthority?: boolean }
} | null | undefined

/**
 * Experiência STORE: conta de cliente com escopo explícito. Contas internas legadas
 * (`accessScope` NULL) e a plataforma ficam fora — continuam com o PIN de supervisor.
 */
export function isStoreExperienceSession(session: SessionLike): boolean {
  return session?.user?.platformAuthority !== true && session?.user?.accessScope === "STORE"
}

/** Só a ADMIN da loja aprova o Caixa Seguro. CAIXA/OPERADOR/GERENTE STORE não. */
export function isStoreAdminSession(session: SessionLike): boolean {
  return isStoreExperienceSession(session) && String(session?.user?.role ?? "").toUpperCase() === "ADMIN"
}

const encoder = new TextEncoder()

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const derived = await crypto.subtle.sign("HMAC", base, encoder.encode(STORE_ADMIN_REAUTH_SCHEMA))
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
}

export async function createStoreAdminReauthToken(
  input: { userId: string; storeId: string; action: string; resource: string; sessionVersion: number },
  secret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(nowMs / 1000)
  const nonce = new Uint8Array(16)
  crypto.getRandomValues(nonce)
  const payload: StoreAdminReauthPayload = {
    v: STORE_ADMIN_REAUTH_SCHEMA,
    userId: input.userId,
    storeId: input.storeId,
    action: input.action,
    resource: input.resource,
    sv: input.sessionVersion,
    iat,
    exp: iat + STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
    nonce: base64UrlEncode(nonce),
  }
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign("HMAC", await deriveKey(secret), encoder.encode(body))
  return `${body}.${base64UrlEncode(sig)}`
}

function isPayloadShape(value: unknown): value is StoreAdminReauthPayload {
  if (typeof value !== "object" || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.userId === "string" &&
    typeof p.storeId === "string" &&
    typeof p.action === "string" &&
    typeof p.resource === "string" &&
    typeof p.sv === "number" &&
    typeof p.iat === "number" &&
    typeof p.exp === "number" &&
    typeof p.nonce === "string"
  )
}

/** Todos os campos de `expected` são obrigatórios: não existe token "genérico" aqui. */
export async function verifyStoreAdminReauthToken(
  token: string | undefined | null,
  secret: string | null,
  expected: { userId: string; storeId: string; action: string; resource: string; sessionVersion: number },
  nowMs: number = Date.now(),
): Promise<StoreAdminReauthVerification> {
  if (!secret) return { ok: false, reason: "missing_server_secret" }
  if (!token) return { ok: false, reason: "missing_cookie" }

  const parts = token.split(".")
  if (parts.length !== 2) return { ok: false, reason: "malformed_token" }
  const [body, sigB64] = parts as [string, string]

  let sigBytes: Uint8Array
  try {
    sigBytes = base64UrlDecode(sigB64)
  } catch {
    return { ok: false, reason: "malformed_token" }
  }
  const valid = await crypto.subtle.verify("HMAC", await deriveKey(secret), sigBytes, encoder.encode(body))
  if (!valid) return { ok: false, reason: "invalid_signature" }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)))
  } catch {
    return { ok: false, reason: "malformed_token" }
  }
  if (!isPayloadShape(payload)) return { ok: false, reason: "malformed_token" }
  if ((payload as { v?: unknown }).v !== STORE_ADMIN_REAUTH_SCHEMA) return { ok: false, reason: "schema_mismatch" }

  // "não é finito OU já passou": comparar NaN seria fail-open.
  if (!Number.isFinite(payload.exp) || Math.floor(nowMs / 1000) >= payload.exp) {
    return { ok: false, reason: "expired" }
  }
  if (!expected.userId.trim() || payload.userId !== expected.userId) return { ok: false, reason: "user_mismatch" }
  if (!expected.storeId.trim() || payload.storeId !== expected.storeId) return { ok: false, reason: "store_mismatch" }
  if (!expected.action.trim() || payload.action !== expected.action) return { ok: false, reason: "action_mismatch" }
  if (!expected.resource.trim() || payload.resource !== expected.resource) {
    return { ok: false, reason: "resource_mismatch" }
  }
  if (payload.sv !== expected.sessionVersion) return { ok: false, reason: "session_version_mismatch" }

  return { ok: true, payload }
}

type CookieOptions = {
  name: string
  value: string
  httpOnly: boolean
  secure: boolean
  sameSite: "strict"
  path: string
  maxAge: number
}

export function buildStoreAdminReauthCookieOptions(token: string): CookieOptions {
  return {
    name: STORE_ADMIN_REAUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
  }
}

export function buildStoreAdminReauthClearCookieOptions(): CookieOptions {
  return { ...buildStoreAdminReauthCookieOptions(""), maxAge: 0 }
}

/** Balde próprio no motor de rate limit, só pela identidade autenticada. */
export function buildStoreAdminReauthRateLimitKey(userId: string): string {
  return `store-admin-reauth:v1:user:${userId}`
}
