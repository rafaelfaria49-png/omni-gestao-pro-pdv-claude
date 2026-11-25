import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MercadoLivreAdapter } from "./adapter"
import { MELI_CALLBACK_PATH, mercadoLivreConfig, type MercadoLivreConfig } from "./config"
import { openMeli, sealMeli } from "./crypto"
import { requireMeliConfig } from "./http"

const origin = "https://omni.example.invalid"
const sellerId = "9223372036854775806"
const env = {
  MELI_OAUTH_ENABLED: "1",
  MELI_OAUTH_STORE_ALLOWLIST: "store-a, store-b",
  MELI_OAUTH_CLIENT_ID: "9999",
  MELI_OAUTH_CLIENT_SECRET: "synthetic-client-secret",
  MELI_OAUTH_REDIRECT_URI: origin + MELI_CALLBACK_PATH,
  MELI_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
}
const config = mercadoLivreConfig(env) as MercadoLivreConfig
const adapter = new MercadoLivreAdapter(config)
const request = vi.fn<typeof fetch>()

function tokenJson(scope = "read offline_access") {
  return new Response(`{"access_token":"fake-access","refresh_token":"fake-refresh","user_id":${sellerId},"expires_in":21600,"token_type":"Bearer","scope":"${scope}"}`)
}

beforeEach(() => {
  request.mockReset()
  vi.stubGlobal("fetch", request)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("configuração privada e criptografia", () => {
  it("exige flag exata, allowlist, callback HTTPS estático e chave de 32 bytes", () => {
    expect(mercadoLivreConfig({})).toBeNull()
    expect(mercadoLivreConfig({ ...env, MELI_OAUTH_ENABLED: "true" })).toBeNull()
    expect(mercadoLivreConfig({ ...env, MELI_OAUTH_STORE_ALLOWLIST: " , " })).toBeNull()
    expect(mercadoLivreConfig({ ...env, MELI_OAUTH_ENCRYPTION_KEY: "short" })).toBeNull()
    for (const url of [
      "http://omni.example.invalid" + MELI_CALLBACK_PATH, env.MELI_OAUTH_REDIRECT_URI + "?storeId=store-a",
      env.MELI_OAUTH_REDIRECT_URI + "#segredo", origin + "/callback", "https://someone@omni.example.invalid" + MELI_CALLBACK_PATH,
    ]) expect(mercadoLivreConfig({ ...env, MELI_OAUTH_REDIRECT_URI: url })).toBeNull()
    expect(config.storeIds.has("store-a")).toBe(true)
    expect(config.storeIds.has("store")).toBe(false)
  })

  it("vincula o AEAD à loja, ao app, ao vendedor, à concessão e à finalidade", () => {
    const scope = ["refresh-token", "store-a", sellerId, "grant-1"]
    const ciphertext = sealMeli(config, scope, "fake-refresh")
    expect(sealMeli(config, scope, "fake-refresh")).not.toBe(ciphertext)
    expect(ciphertext).not.toContain("fake-refresh")
    expect(openMeli(config, scope, ciphertext)).toBe("fake-refresh")
    for (const change of [
      ["access-token", ...scope.slice(1)], [scope[0], "store-b", ...scope.slice(2)],
      [scope[0], scope[1], "1234", scope[3]], [...scope.slice(0, 3), "grant-2"],
    ]) expect(openMeli(config, change, ciphertext)).toBeNull()
    expect(openMeli({ ...config, clientId: "9998" }, scope, ciphertext)).toBeNull()
    expect(openMeli({ ...config, key: Buffer.alloc(32, 8) }, scope, ciphertext)).toBeNull()
    const parts = ciphertext.split(".")
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1)
    expect(openMeli(config, scope, parts.join("."))).toBeNull()
  })

  it("limita a vendedores de teste quando o ambiente não é produção", () => {
    expect(mercadoLivreConfig(env)?.testSellersOnly).toBe(true)
    expect(mercadoLivreConfig({ ...env, VERCEL_ENV: "preview" })?.testSellersOnly).toBe(true)
    expect(mercadoLivreConfig({ ...env, VERCEL_ENV: "production" })?.testSellersOnly).toBe(false)
  })

  it("não aceita loja implícita nem mutação de outra origem", () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    const req = (method: string, headers?: HeadersInit) => new Request(origin + "/api", { method, headers })
    const unit = { "x-assistec-loja-id": "store-a" }
    expect(() => requireMeliConfig(req("GET"), "store-a")).toThrow(expect.objectContaining({ code: "invalid_state" }))
    expect(() => requireMeliConfig(req("POST", { ...unit, Origin: "https://other.example.invalid" }), "store-a")).toThrow(expect.objectContaining({ code: "invalid_state" }))
    expect(() => requireMeliConfig(req("GET", unit), "store-b")).toThrow(expect.objectContaining({ code: "invalid_state" }))
    expect(() => requireMeliConfig(req("GET", unit), "store-c")).toThrow(expect.objectContaining({ code: "not_configured" }))
    expect(requireMeliConfig(req("DELETE", { ...unit, Origin: origin }), "store-a").clientId).toBe(config.clientId)
  })
})

describe("contrato OAuth Mercado Livre", () => {
  it("monta autorização oficial com state/PKCE S256 e troca code por POST form", async () => {
    const authorization = new URL(adapter.authorizationUrl("state-test", "challenge-test"))
    expect(authorization.origin + authorization.pathname).toBe("https://auth.mercadolivre.com.br/authorization")
    expect(Object.fromEntries(authorization.searchParams)).toEqual({
      client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
      state: "state-test", code_challenge: "challenge-test", code_challenge_method: "S256",
    })
    request.mockResolvedValueOnce(tokenJson())
    const grant = await adapter.exchangeCode("test-code", "test-verifier")
    const [url, init] = request.mock.calls[0]
    expect(String(url)).toBe("https://api.mercadolibre.com/oauth/token")
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" })
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code", code: "test-code", code_verifier: "test-verifier",
      redirect_uri: config.redirectUri, client_id: config.clientId, client_secret: config.clientSecret,
    })
    expect(grant).toMatchObject({ sellerId, scopes: ["offline_access", "read"] })
    expect(grant.expiresAt).toBeGreaterThan(Date.now())
  })

  it.each(["offline_access", "read", "read offline_access write", "read offline_access urn:mp:scope"])("recusa grant fora de leitura e offline (%s)", async (scope) => {
    request.mockResolvedValueOnce(tokenJson(scope))
    await expect(adapter.exchangeCode("test-code", "test-verifier")).rejects.toMatchObject({ code: "insufficient_permissions" })
  })

  it("renova por POST e classifica revogação sem devolver a mensagem original", async () => {
    request.mockResolvedValueOnce(Response.json({ error: "invalid_grant", message: "sensitive-upstream-message" }, { status: 400 }))
    await expect(adapter.refresh("previous-refresh")).rejects.toMatchObject({ code: "reconnect_required" })
    const [, init] = request.mock.calls[0]
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      grant_type: "refresh_token", refresh_token: "previous-refresh", client_id: config.clientId, client_secret: config.clientSecret,
    })
  })

  it("lê somente campos públicos de /users/me e preserva Int64", async () => {
    request.mockResolvedValueOnce(new Response(`{"id":${sellerId},"site_id":"MLB","nickname":"QA","email":"private@example.invalid","status":{"site_status":"active"},"tags":["test_user"]}`))
    await expect(adapter.identifySeller("fake-access")).resolves.toEqual({ id: sellerId, nickname: "QA", testAccount: true, siteStatus: "active" })
    expect(String(request.mock.calls[0][0])).toBe("https://api.mercadolibre.com/users/me")
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer fake-access" })
    request.mockResolvedValueOnce(Response.json({ id: "12", site_id: "MLA" }))
    await expect(adapter.identifySeller("fake-access")).rejects.toMatchObject({ code: "account_mismatch" })
  })

  it.each([401, 403, 429, 503])("mapeia HTTP %i e preserva Retry-After em 429", async (status) => {
    request.mockResolvedValueOnce(new Response("indisponível", { status, headers: { "Retry-After": "17" } }))
    const code = { 401: "reconnect_required", 403: "insufficient_permissions", 429: "rate_limited", 503: "communication_error" }[status]
    await expect(adapter.identifySeller("fake-access")).rejects.toMatchObject({ code, ...(status === 429 && { retryAfter: 17 }) })
  })

  it("trata falha de rede e JSON inesperado com erro seguro", async () => {
    request.mockRejectedValueOnce(new Error("upstream secret")).mockResolvedValueOnce(Response.json({ id: 1 }))
    for (let i = 0; i < 2; i++) {
      await expect(adapter.identifySeller("fake-access")).rejects.toMatchObject({ code: "communication_error" })
    }
  })
})

const figure = "https://http2.mlstatic.com/D_QA.webp"
const search = (results = ["MLB1", "MLB2", "MLB3"]) => Response.json({ results, scroll_id: "provider-scroll==" })

describe("consulta autorizada de anúncios", () => {
  it("pagina por seller, usa multiget e preserva clássico e User Products", async () => {
    request.mockResolvedValueOnce(search()).mockResolvedValueOnce(Response.json([
      { code: 200, body: {
        id: "MLB2", seller_id: sellerId, status: "paused", family_id: "119", family_name: "Camiseta UP",
        user_product_id: "MLBU2", attributes: [{ id: "COLOR", value_name: "Azul" }, { id: "SIZE", value_name: "G" }],
      } },
      { code: 404, body: { message: "indisponível" } },
      { code: 200, body: {
        id: "MLB1", seller_id: sellerId, title: "Camiseta clássica", status: "active", price: 35, currency_id: "BRL",
        category_id: "MLB123", available_quantity: 0, secure_thumbnail: "https://example.invalid/payload",
        pictures: [{ id: "p", secure_url: figure }],
        variations: [{
          id: 20, price: 36, available_quantity: 4, picture_ids: ["p", "missing"], seller_custom_field: "legado",
          attributes: [{ id: "SELLER_SKU", value_name: "CAM-VER-M" }],
          attribute_combinations: [{ id: "COLOR", value_name: "Verde" }, { id: "SIZE", value_name: "M" }],
        }],
      } },
    ]))
    const page = await adapter.listAds("fake-access", sellerId)
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.pathname).toBe(`/users/${sellerId}/items/search`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ search_type: "scan", limit: "20" })
    const batch = new URL(String(request.mock.calls[1][0]))
    expect(batch.pathname).toBe("/items")
    expect(batch.searchParams.get("ids")).toBe("MLB1,MLB2,MLB3")
    expect(page).toMatchObject({ nextCursor: "provider-scroll==", unavailable: 1, listings: [
      { id: "MLB1", availableQuantity: 0, images: [figure], variations: [
        { id: "20", sku: "CAM-VER-M", sellerCustomField: "legado", color: "Verde", size: "M", price: 36, availableQuantity: 4, images: [figure] },
      ] },
      { id: "MLB2", title: "Camiseta UP", userProductId: "MLBU2", familyId: "119", color: "Azul", size: "G", variations: [] },
    ] })
    request.mockResolvedValueOnce(search([]))
    await expect(adapter.listAds("fake-access", sellerId, page.nextCursor!)).resolves.toEqual({ listings: [], nextCursor: null, unavailable: 0 })
    expect(new URL(String(request.mock.calls[2][0])).searchParams.get("scroll_id")).toBe("provider-scroll==")
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true)
  })

  it.each([
    { id: "MLB1", seller_id: "1111", status: "active" },
    { id: "MLB2", seller_id: sellerId, status: "active" },
  ])("recusa item de outra conta ou fora dos IDs esperados", async (body) => {
    request.mockResolvedValueOnce(search(["MLB1"])).mockResolvedValueOnce(Response.json([{ code: 200, body }]))
    await expect(adapter.listAds("fake-access", sellerId)).rejects.toMatchObject({ code: "account_mismatch" })
  })

  it("orienta reiniciar quando o cursor externo foi rejeitado", async () => {
    request.mockResolvedValueOnce(Response.json({ error: "bad_request" }, { status: 400 }))
    await expect(adapter.listAds("fake-access", sellerId, "expired")).rejects.toMatchObject({ code: "invalid_cursor" })
  })
})

const sellerIdNext = "9223372036854775807"
const safeMaxId = "9007199254740991"
const aboveSafeA = "9007199254740992"
const aboveSafeB = "9007199254740993"

describe("integridade Int64, bordas JSON e isolamento em Node 20 e Node 24", () => {
  it.each([
    ["inteiro seguro", "745001"],
    ["Number.MAX_SAFE_INTEGER", safeMaxId],
    ["acima do limite seguro A", aboveSafeA],
    ["acima do limite seguro B", aboveSafeB],
    ["Int64 19 dígitos (penúltimo)", sellerId],
    ["Int64 19 dígitos (máximo)", sellerIdNext],
  ])("preserva exatamente %s em /oauth/token e /users/me", async (_label, id) => {
    request
      .mockResolvedValueOnce(new Response(`{"access_token":"tok","refresh_token":"ref","user_id":${id},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${id},"site_id":"MLB","nickname":"LOJA-${id}","status":{"site_status":"active"},"tags":["test_user"]}`))

    const grant = await adapter.exchangeCode("code-1", "verifier-1")
    const seller = await adapter.identifySeller(grant.accessToken)
    expect(grant.sellerId).toBe(id)
    expect(seller.id).toBe(id)
    expect(grant.sellerId).toBe(seller.id)
  })

  it("distingue IDs Int64 consecutivos entre grant e /users/me e no AEAD entre lojas", async () => {
    request
      .mockResolvedValueOnce(new Response(`{"access_token":"tok","refresh_token":"ref","user_id":${sellerId},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${sellerIdNext},"site_id":"MLB","nickname":"OUTRA","tags":["test_user"]}`))

    const grant = await adapter.exchangeCode("code-1", "verifier-1")
    const seller = await adapter.identifySeller(grant.accessToken)
    expect(grant.sellerId).toBe(sellerId)
    expect(seller.id).toBe(sellerIdNext)
    expect(grant.sellerId).not.toBe(seller.id)

    const cipherA = sealMeli(config, ["access-token", "store-a", sellerId, "grant-1"], "secret-a")
    expect(openMeli(config, ["access-token", "store-a", sellerId, "grant-1"], cipherA)).toBe("secret-a")
    expect(openMeli(config, ["access-token", "store-a", sellerIdNext, "grant-1"], cipherA)).toBeNull()
    expect(openMeli(config, ["access-token", "store-b", sellerId, "grant-1"], cipherA)).toBeNull()
  })

  it("preserva IDs Int64 consecutivos em variantes, family_id numérico, preços com centavos, quantidades e strings com JSON", async () => {
    const jsonLikeTitle = `{"id":${sellerIdNext},"seller_id":${aboveSafeB},"price":"nao-e-numero"}`
    const rawMultiget = `[
      {
        "code": 200,
        "body": {
          "id": "MLB9223372036854775807",
          "seller_id": ${sellerId},
          "title": ${JSON.stringify(jsonLikeTitle)},
          "status": "active",
          "currency_id": "BRL",
          "price": 129.95,
          "available_quantity": 15,
          "user_product_id": "MLBU9223372036854775807",
          "family_id": ${sellerIdNext},
          "family_name": "Linha Int64",
          "pictures": [{"id": "pic-int64", "secure_url": "${figure}"}],
          "variations": [
            {
              "id": ${sellerId},
              "price": 129.95,
              "available_quantity": 7,
              "picture_ids": ["pic-int64"],
              "attributes": [{"id": "SELLER_SKU", "value_name": "SKU-A"}],
              "attribute_combinations": [{"id": "COLOR", "value_name": "Preto"}, {"id": "SIZE", "value_name": "M"}]
            },
            {
              "id": ${sellerIdNext},
              "price": 134.50,
              "available_quantity": 8,
              "picture_ids": ["pic-int64"],
              "attributes": [{"id": "SELLER_SKU", "value_name": "SKU-B"}],
              "attribute_combinations": [{"id": "COLOR", "value_name": "Branco"}, {"id": "SIZE", "value_name": "G"}]
            }
          ]
        }
      }
    ]`

    request
      .mockResolvedValueOnce(search(["MLB9223372036854775807"]))
      .mockResolvedValueOnce(new Response(rawMultiget))

    const page = await adapter.listAds("fake-access", sellerId)
    expect(page.listings).toHaveLength(1)
    const [listing] = page.listings
    expect(listing.id).toBe("MLB9223372036854775807")
    expect(listing.title).toBe(jsonLikeTitle)
    expect(listing.price).toBe(129.95)
    expect(listing.availableQuantity).toBe(15)
    expect(listing.userProductId).toBe("MLBU9223372036854775807")
    expect(listing.familyId).toBe(sellerIdNext)
    expect(listing.variations.map((v) => ({ id: v.id, price: v.price, qty: v.availableQuantity }))).toEqual([
      { id: sellerId, price: 129.95, qty: 7 },
      { id: sellerIdNext, price: 134.5, qty: 8 },
    ])
  })

  it("recusa item de vendedor Int64 consecutivo diferente com account_mismatch", async () => {
    const rawMultiget = `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerIdNext},"status":"active","price":10.25,"available_quantity":1}}]`
    request
      .mockResolvedValueOnce(search(["MLB1"]))
      .mockResolvedValueOnce(new Response(rawMultiget))

    await expect(adapter.listAds("fake-access", sellerId)).rejects.toMatchObject({ code: "account_mismatch" })
  })

  it("aceita chaves JSON escapadas para identificadores Int64 sem perda de precisão", async () => {
    request.mockResolvedValueOnce(new Response(`{"\\u0069d":${sellerIdNext},"site_id":"MLB","nickname":"ESCAPED","tags":["test_user"]}`))
    await expect(adapter.identifySeller("fake-access")).resolves.toEqual({
      id: sellerIdNext,
      nickname: "ESCAPED",
      siteStatus: null,
      testAccount: true,
    })
  })

  it.each([
    ["JSON inválido", '{"id":9223372036854775806,"site_id":"MLB",}'],
    ["zero", '{"id":0,"site_id":"MLB"}'],
    ["negativo", '{"id":-9223372036854775806,"site_id":"MLB"}'],
    ["fracionário", '{"id":123.45,"site_id":"MLB"}'],
    ["fracionário .0", '{"id":123.0,"site_id":"MLB"}'],
    ["notação exponencial", '{"id":1e18,"site_id":"MLB"}'],
    ["20 dígitos fora do contrato", '{"id":10000000000000000000,"site_id":"MLB"}'],
    ["string com zero à esquerda", '{"id":"0123","site_id":"MLB"}'],
    ["booleano", '{"id":true,"site_id":"MLB"}'],
    ["campo duplicado literal", `{"id":1,"id":${sellerId},"site_id":"MLB"}`],
    ["campo duplicado com escape", `{"id":1,"\\u0069d":${sellerId},"site_id":"MLB"}`],
  ])("rejeita fail-closed em /users/me para %s", async (_label, body) => {
    request.mockResolvedValueOnce(new Response(body))
    await expect(adapter.identifySeller("fake-access")).rejects.toMatchObject({ code: "communication_error" })
  })

  it.each([
    ["family_id negativo", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"status":"active","family_id":-10}}]`],
    ["family_id fracionário", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"status":"active","family_id":10.5}}]`],
    ["family_id exponencial", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"status":"active","family_id":1e18}}]`],
    ["variation id negativo", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"status":"active","variations":[{"id":-5}]}}]`],
    ["variation id exponencial", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"status":"active","variations":[{"id":1e10}]}}]`],
    ["campo duplicado no multiget", `[{"code":200,"body":{"id":"MLB1","seller_id":${sellerId},"seller_id":${sellerIdNext},"status":"active"}}]`],
  ])("rejeita fail-closed em /items para %s", async (_label, rawMultiget) => {
    request
      .mockResolvedValueOnce(search(["MLB1"]))
      .mockResolvedValueOnce(new Response(rawMultiget))

    await expect(adapter.listAds("fake-access", sellerId)).rejects.toMatchObject({ code: "communication_error" })
  })
})
