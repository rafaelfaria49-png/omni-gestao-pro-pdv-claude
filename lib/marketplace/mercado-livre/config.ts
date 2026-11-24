import "server-only"

export const MELI_CALLBACK_PATH = "/api/marketplace/mercado-livre/callback"
export const MELI_CONNECTION_PREFIX = "meli-oauth-v1-"
export const MELI_OAUTH_COOKIE = "__Host-omni-meli-oauth"
export const MELI_STATE_TTL_MS = 10 * 60_000

export type MercadoLivreConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  origin: string
  key: Buffer
  storeIds: ReadonlySet<string>
  testSellersOnly: boolean
}

export function mercadoLivreConfig(env: Readonly<Record<string, string | undefined>> = process.env): MercadoLivreConfig | null {
  if (env.MELI_OAUTH_ENABLED !== "1") return null
  const storeIds = new Set((env.MELI_OAUTH_STORE_ALLOWLIST ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  const clientId = env.MELI_OAUTH_CLIENT_ID?.trim()
  const clientSecret = env.MELI_OAUTH_CLIENT_SECRET?.trim()
  const redirectUri = env.MELI_OAUTH_REDIRECT_URI?.trim()
  const encodedKey = env.MELI_OAUTH_ENCRYPTION_KEY?.trim()
  if (!storeIds.size || !clientId || !/^[1-9][0-9]{0,18}$/.test(clientId) || !clientSecret ||
      !redirectUri || !encodedKey || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) return null
  const key = Buffer.from(encodedKey, "base64url")
  if (key.length !== 32 || key.toString("base64url") !== encodedKey) return null
  try {
    const url = new URL(redirectUri)
    if (url.protocol !== "https:" || redirectUri !== url.origin + MELI_CALLBACK_PATH) return null
    return { clientId, clientSecret, redirectUri, origin: url.origin, key, storeIds, testSellersOnly: env.VERCEL_ENV === "preview" }
  } catch {
    return null
  }
}
