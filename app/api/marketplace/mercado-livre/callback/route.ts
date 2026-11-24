import type { NextRequest } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { MercadoLivreAdapter } from "@/lib/marketplace/mercado-livre/adapter"
import { mercadoLivreConfig, MELI_OAUTH_COOKIE } from "@/lib/marketplace/mercado-livre/config"
import { finishMercadoLivre, parseMercadoLivreIntent } from "@/lib/marketplace/mercado-livre/connection-service"
import { MeliFailure, meliFailure } from "@/lib/marketplace/mercado-livre/errors"
import { meliError, returnToMarketplace } from "@/lib/marketplace/mercado-livre/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const config = mercadoLivreConfig()
  if (!config) return meliError(new MeliFailure("not_configured"))
  const params = req.nextUrl.searchParams
  const state = params.get("state")
  const code = params.get("code")
  const cookie = req.cookies.get(MELI_OAUTH_COOKIE)?.value
  if (!state || !cookie || params.getAll("state").length !== 1 || params.getAll("code").length > 1 || (code && code.length > 512)) {
    return returnToMarketplace(config, "invalid_state")
  }
  try {
    const intent = parseMercadoLivreIntent(config, cookie, state)
    if (!intent) return returnToMarketplace(config, "invalid_state")
    // A unidade vem exclusivamente da tentativa autenticada, mesmo que a unidade
    // ativa do navegador tenha mudado durante a autorização.
    const scoped = new Request(config.redirectUri, { headers: { [ASSISTEC_LOJA_HEADER]: intent.storeId } })
    const denied = await requireModuleApi(scoped, "marketplace")
    if (denied) return returnToMarketplace(config, "session_required")
    const gate = await requireMarketplaceApi(scoped)
    if (!gate.ok || gate.userId !== intent.userId) return returnToMarketplace(config, "session_required")
    await finishMercadoLivre(config, new MercadoLivreAdapter(config), intent, params.has("error") ? null : code)
    return returnToMarketplace(config, "authorized", true)
  } catch (error) {
    const failure = meliFailure(error)
    return returnToMarketplace(config, failure.code, failure.code !== "invalid_state")
  }
}
