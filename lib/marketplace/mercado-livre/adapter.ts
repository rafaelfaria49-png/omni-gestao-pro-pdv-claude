import "server-only"
import { z } from "zod"
import type { MarketplaceGrant, MarketplaceReadOnlyAdapter } from "../read-only-adapter"
import type { MarketplaceReadListing, MarketplaceReadPage, MarketplaceSeller } from "../read-only-types"
import type { MercadoLivreConfig } from "./config"
import { MeliFailure } from "./errors"

const AUTHORIZATION_URL = "https://auth.mercadolivre.com.br/authorization"
const API_ORIGIN = "https://api.mercadolibre.com"
const PAGE_SIZE = 20
const TIMEOUT_MS = 5_000
const EXTERNAL_IDS = new Set(["id", "user_id", "seller_id", "family_id"])
const numericId = z.string().regex(/^[1-9][0-9]{0,18}$/)
const itemId = z.string().regex(/^MLB[0-9]{1,19}$/)
const optionalText = z.string().max(500).nullish()
const money = z.number().finite().nonnegative().nullish()
const quantity = z.number().int().nonnegative().safe().nullish()
const attributes = z.array(z.object({ id: z.string(), value_name: optionalText })).nullish()

const grantResponse = z.object({
  access_token: z.string().min(1).max(4000),
  refresh_token: z.string().min(1).max(4000),
  user_id: numericId,
  expires_in: z.number().int().positive().max(48 * 3_600),
  token_type: z.string().refine((type) => type.toLowerCase() === "bearer"),
  scope: z.string().max(2000),
})

const sellerResponse = z.object({
  id: numericId,
  site_id: z.string(),
  nickname: optionalText,
  status: z.object({ site_status: optionalText }).nullish(),
  tags: z.array(z.string()).nullish(),
})

const scanResponse = z.object({
  results: z.array(itemId).max(PAGE_SIZE),
  scroll_id: z.string().min(1).max(2048).nullish(),
})

const itemResponse = z.object({
  id: itemId,
  seller_id: numericId,
  title: optionalText,
  status: z.string().min(1).max(60),
  currency_id: z.string().regex(/^[A-Z]{3}$/).nullish(),
  price: money,
  available_quantity: quantity,
  category_id: optionalText,
  secure_thumbnail: z.string().nullish(),
  attributes,
  seller_custom_field: optionalText,
  user_product_id: optionalText,
  family_id: optionalText,
  family_name: optionalText,
  pictures: z.array(z.object({ id: z.string(), secure_url: z.string().nullish(), url: z.string().nullish() })).nullish(),
  variations: z.array(z.object({
    id: numericId,
    price: money,
    available_quantity: quantity,
    attributes,
    attribute_combinations: attributes,
    seller_custom_field: optionalText,
    picture_ids: z.array(z.string()).nullish(),
  })).nullish(),
})

const multigetResponse = z.array(z.object({ code: z.number().int(), body: z.unknown() })).max(PAGE_SIZE)
const itemFields = Object.keys(itemResponse.shape).join(",")

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (!result.success) throw new MeliFailure("communication_error")
  return result.data
}

function retrySeconds(value: string | null) {
  if (!value) return 30
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000)
  return Number.isFinite(seconds) ? Math.max(1, Math.min(3600, seconds)) : 30
}

/** IDs do Mercado Livre podem ser Int64. Preserva os dígitos originais do JSON em Node 24. */
function parseMeliJson(body: string): unknown {
  return JSON.parse(body, (key, value, context?: { source?: string }) => {
    if (!EXTERNAL_IDS.has(key) || typeof value !== "number") return value
    return context?.source ?? (Number.isSafeInteger(value) ? String(value) : null)
  })
}

function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.endsWith(".mlstatic.com")) return null
    return url.href
  } catch {
    return null
  }
}

function listingAttributes(fields: z.infer<typeof attributes>, sellerCustomField?: string | null) {
  const valueOf = (id: string) => fields?.find((field) => field.id === id)?.value_name?.trim() || null
  return {
    sku: valueOf("SELLER_SKU"),
    sellerCustomField: sellerCustomField?.trim() || null,
    color: valueOf("COLOR") ?? valueOf("MAIN_COLOR"),
    size: valueOf("SIZE"),
  }
}

function projectListing(item: z.infer<typeof itemResponse>): MarketplaceReadListing {
  const pictures = new Map<string, string>()
  for (const picture of item.pictures ?? []) {
    const url = mediaUrl(picture.secure_url) ?? mediaUrl(picture.url)
    if (url) pictures.set(picture.id, url)
  }
  const thumbnail = mediaUrl(item.secure_thumbnail)
  return {
    id: item.id,
    title: item.title?.trim() || item.family_name?.trim() || item.id,
    status: item.status,
    price: item.price ?? null,
    currency: item.currency_id ?? null,
    availableQuantity: item.available_quantity ?? null,
    categoryId: item.category_id ?? null,
    images: pictures.size ? Array.from(new Set(pictures.values())) : thumbnail ? [thumbnail] : [],
    ...listingAttributes(item.attributes, item.seller_custom_field),
    userProductId: item.user_product_id ?? null,
    familyId: item.family_id ?? null,
    familyName: item.family_name ?? null,
    variations: (item.variations ?? []).map((variation) => ({
      id: variation.id,
      price: variation.price ?? null,
      availableQuantity: variation.available_quantity ?? null,
      ...listingAttributes([...(variation.attributes ?? []), ...(variation.attribute_combinations ?? [])], variation.seller_custom_field),
      images: (variation.picture_ids ?? []).flatMap((id) => pictures.get(id) ?? []),
    })),
  }
}

export class MercadoLivreAdapter implements MarketplaceReadOnlyAdapter {
  readonly provider = "MERCADO_LIVRE"

  constructor(private readonly config: MercadoLivreConfig) {}

  authorizationUrl(state: string, challenge: string): string {
    const url = new URL(AUTHORIZATION_URL)
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString()
    return url.href
  }

  exchangeCode(code: string, verifier: string): Promise<MarketplaceGrant> {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: verifier,
    })
  }

  refresh(refreshToken: string): Promise<MarketplaceGrant> {
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken })
  }

  async identifySeller(accessToken: string): Promise<MarketplaceSeller> {
    const seller = parse(sellerResponse, await this.request("/users/me", { accessToken }))
    if (seller.site_id !== "MLB") throw new MeliFailure("account_mismatch")
    return {
      id: seller.id,
      nickname: seller.nickname ?? null,
      siteStatus: seller.status?.site_status ?? null,
      testAccount: seller.tags?.includes("test_user") ?? false,
    }
  }

  async listAds(accessToken: string, sellerId: string, cursor?: string): Promise<MarketplaceReadPage> {
    if (!numericId.safeParse(sellerId).success) throw new MeliFailure("account_mismatch")
    const search = new URLSearchParams({ search_type: "scan", limit: String(PAGE_SIZE) })
    if (cursor) search.set("scroll_id", cursor)
    const page = parse(scanResponse, await this.request(`/users/${sellerId}/items/search?${search}`, {
      accessToken,
      pagination: Boolean(cursor),
    }))
    if (!page.results.length) return { listings: [], nextCursor: null, unavailable: 0 }
    if (!page.scroll_id || new Set(page.results).size !== page.results.length) throw new MeliFailure("communication_error")
    const lookup = new URLSearchParams({ ids: page.results.join(","), attributes: itemFields })
    const batch = parse(multigetResponse, await this.request(`/items?${lookup}`, { accessToken }))
    if (batch.length !== page.results.length) throw new MeliFailure("communication_error")
    const items = new Map<string, MarketplaceReadListing>()
    for (const entry of batch) {
      if (entry.code === 404 || entry.code === 410) continue
      if (entry.code === 401) throw new MeliFailure("reconnect_required")
      if (entry.code === 403) throw new MeliFailure("insufficient_permissions")
      if (entry.code === 429) throw new MeliFailure("rate_limited", 30)
      if (entry.code !== 200) throw new MeliFailure("communication_error")
      const item = parse(itemResponse, entry.body)
      if (item.seller_id !== sellerId || !page.results.includes(item.id) || items.has(item.id)) {
        throw new MeliFailure("account_mismatch")
      }
      items.set(item.id, projectListing(item))
    }
    const listings = page.results.flatMap((id) => items.get(id) ?? [])
    return { listings, nextCursor: page.scroll_id, unavailable: page.results.length - listings.length }
  }

  private async token(params: Record<string, string>): Promise<MarketplaceGrant> {
    const body = new URLSearchParams({ ...params, client_id: this.config.clientId, client_secret: this.config.clientSecret })
    const grant = parse(grantResponse, await this.request("/oauth/token", { body }))
    const scopes = [...new Set(grant.scope.split(/\s+/).filter(Boolean))].sort()
    if (scopes.length !== 2 || !scopes.includes("read") || !scopes.includes("offline_access")) {
      throw new MeliFailure("insufficient_permissions")
    }
    return {
      accessToken: grant.access_token,
      refreshToken: grant.refresh_token,
      sellerId: grant.user_id,
      expiresAt: Date.now() + grant.expires_in * 1000,
      scopes,
    }
  }

  private async request(
    path: string,
    { body, accessToken, pagination }: { body?: URLSearchParams; accessToken?: string; pagination?: boolean },
  ): Promise<unknown> {
    let response: Response
    let raw: string
    try {
      response = await fetch(new URL(path, API_ORIGIN), {
        method: body ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      raw = await response.text()
    } catch {
      throw new MeliFailure("communication_error")
    }

    if (response.status === 429) throw new MeliFailure("rate_limited", retrySeconds(response.headers.get("Retry-After")))
    if (response.status === 401) throw new MeliFailure("reconnect_required")
    if (response.status === 403) throw new MeliFailure("insufficient_permissions")
    if (response.status === 400 && pagination) throw new MeliFailure("invalid_cursor")
    let payload: unknown
    try {
      payload = parseMeliJson(raw)
    } catch {
      throw new MeliFailure("communication_error")
    }
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(payload)
      if (error.success && error.data.error === "invalid_grant") throw new MeliFailure("reconnect_required")
      if (error.success && error.data.error === "unauthorized_client") throw new MeliFailure("insufficient_permissions")
      throw new MeliFailure("communication_error")
    }
    return payload
  }
}
