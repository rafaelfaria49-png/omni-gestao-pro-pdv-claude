// Preload exclusivo do E2E. Nenhuma chamada HTTP chega às APIs do Mercado Livre.
import { createHash } from "node:crypto"
import { appendFileSync } from "node:fs"
import { setTimeout as delay } from "node:timers/promises"

const evidence = process.env.MELI_E2E_PROVIDER_EVENTS
const clientId = "99990001"
if (!evidence || process.env.MELI_OAUTH_CLIENT_ID !== clientId) throw new Error("Fixture Mercado Livre fora de QA.")

const liveFetch = globalThis.fetch
const codes = new Set()
const activeRefresh = new Map()
const sellers = { classic: 745001, different: 745002, slow: 745002, expiring: 745003, revoked: 745003, limited: 745003, lost: 745003, commercial: 745004, fault: 745005 }
const shortGrants = new Set(["expiring", "revoked", "lost"])
const grantKey = (kind) => `${clientId}:${sellers[kind]}`
let sequence = 0

function token(kind, expires = 21_600) {
  const suffix = `${kind}-${++sequence}`
  const refreshToken = `qa-refresh-${suffix}`
  // Um novo consentimento e uma renovação substituem o último refresh por app e vendedor.
  activeRefresh.set(grantKey(kind), refreshToken)
  return Response.json({
    access_token: `qa-access-${suffix}`,
    refresh_token: refreshToken,
    user_id: sellers[kind],
    expires_in: expires,
    token_type: "Bearer",
    scope: "offline_access read",
  })
}

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin !== "https://api.mercadolibre.com") return liveFetch(input, init)
  const req = new Request(input, init)
  const emit = (event) => appendFileSync(evidence, event + "\n")
  if (url.pathname === "/oauth/token" && req.method === "POST") {
    const params = new URLSearchParams(await req.text())
    if (params.get("client_id") !== clientId || params.get("client_secret") !== process.env.MELI_OAUTH_CLIENT_SECRET) {
      return Response.json({ error: "invalid_client" }, { status: 401 })
    }
    if (params.get("grant_type") === "authorization_code") {
      emit("exchange")
      const [kind, nonce, challenge] = (params.get("code") ?? "").split(":")
      const verifier = params.get("code_verifier") ?? ""
      if (!nonce || !Object.hasOwn(sellers, kind) || codes.has(nonce) ||
        params.get("redirect_uri") !== process.env.MELI_OAUTH_REDIRECT_URI || !/^[\w-]{43}$/.test(verifier) ||
        createHash("sha256").update(verifier).digest("base64url") !== challenge) {
        return Response.json({ error: "invalid_grant" }, { status: 400 })
      }
      codes.add(nonce)
      if (kind === "fault" || kind === "slow") await delay(1_500)
      if (kind === "fault") {
        return Response.json({
          error: "qa-ingress-provider-error", request_code: params.get("code"), client_secret: params.get("client_secret"),
        }, { status: 503 })
      }
      return token(kind, shortGrants.has(kind) ? 1 : 21_600)
    }
    if (params.get("grant_type") === "refresh_token") {
      emit("refresh")
      const refresh = params.get("refresh_token")
      const kind = refresh?.match(/^qa-refresh-([a-z]+)-[0-9]+$/)?.[1]
      if (!kind || !Object.hasOwn(sellers, kind) || activeRefresh.get(grantKey(kind)) !== refresh) {
        return Response.json({ error: "invalid_grant" }, { status: 400 })
      }
      activeRefresh.delete(grantKey(kind))
      if (kind === "revoked") return Response.json({ error: "invalid_grant" }, { status: 400 })
      if (kind === "lost") throw new TypeError("Falha de rede sintética após o envio")
      if (kind === "expiring") {
        await delay(700)
        return token("limited")
      }
      return token(kind)
    }
    return Response.json({ error: "invalid_grant" }, { status: 400 })
  }
  const kind = req.headers.get("authorization")?.match(/^Bearer qa-access-([a-z]+)-[0-9]+$/)?.[1]
  if (!kind || !Object.hasOwn(sellers, kind)) return Response.json({ error: "invalid_token" }, { status: 401 })
  const id = sellers[kind]
  if (req.method === "GET" && url.pathname === "/users/me") {
    emit("identity")
    return Response.json({
      id, nickname: `VENDEDOR-QA-${id}`, site_id: "MLB",
      status: { site_status: "active" }, tags: kind === "commercial" ? [] : ["test_user"], email: "never-expose@example.invalid",
    })
  }
  if (req.method === "GET" && url.pathname === `/users/${id}/items/search`) {
    emit("search")
    const scroll = url.searchParams.get("scroll_id")
    if (url.searchParams.get("search_type") !== "scan" || url.searchParams.get("limit") !== "20") {
      return Response.json({ error: "parametros_invalidos" }, { status: 400 })
    }
    if (kind === "limited" && scroll) return Response.json({}, { status: 429, headers: { "Retry-After": "12" } })
    return Response.json({
      results: scroll === "qa-scroll-2" ? [] : [scroll ? "MLB7402" : "MLB7401"],
      scroll_id: scroll === "qa-scroll-2" ? null : scroll ? "qa-scroll-2" : "qa-scroll-1",
    })
  }
  if (req.method === "GET" && url.pathname === "/items") {
    emit("multiget")
    const item = url.searchParams.get("ids")
    return Response.json([{ code: 200, body: {
      id: item, seller_id: id, status: "active", currency_id: "BRL", price: 69.9, available_quantity: 7, category_id: "MLB42",
      attributes: [{ id: "COLOR", value_name: "Azul" }, { id: "SELLER_SKU", value_name: "SKU-QA" }],
      ...(item === "MLB7401" ? {
        title: "Camiseta clássica QA",
        pictures: [{ id: "p1", secure_url: "https://http2.mlstatic.com/D_QA.webp" }],
        variations: [{ id: 401, available_quantity: 3, picture_ids: ["p1"],
          attributes: [{ id: "SELLER_SKU", value_name: "SKU-AZUL-M-QA" }],
          attribute_combinations: [{ id: "COLOR", value_name: "Azul" }, { id: "SIZE", value_name: "M" }],
        }],
      } : {
        title: "Camiseta User Product QA", user_product_id: "MLBU701", family_id: 701, family_name: "Camisetas QA",
      }),
    } }])
  }
  emit("unexpected")
  return Response.json({ error: "unexpected_fixture_request" }, { status: 500 })
}
