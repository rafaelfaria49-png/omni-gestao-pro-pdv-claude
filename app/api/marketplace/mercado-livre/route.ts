import { requireModuleApi } from "@/lib/auth/module-access"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { MercadoLivreAdapter } from "@/lib/marketplace/mercado-livre/adapter"
import { disconnectMercadoLivre, startMercadoLivre } from "@/lib/marketplace/mercado-livre/connection-service"
import { meliError, meliJson, requireMeliConfig, setMeliCookie } from "@/lib/marketplace/mercado-livre/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const denied = await requireModuleApi(req, "marketplace")
    if (denied) return denied
    const gate = await requireMarketplaceApi(req)
    if (!gate.ok) return gate.response
    const config = requireMeliConfig(req, gate.storeId)
    const { authorizationUrl, cookie } = await startMercadoLivre(config, new MercadoLivreAdapter(config), gate)
    const response = meliJson({ authorizationUrl })
    setMeliCookie(response, cookie)
    return response
  } catch (error) {
    return meliError(error)
  }
}

export async function DELETE(req: Request) {
  try {
    const denied = await requireModuleApi(req, "marketplace")
    if (denied) return denied
    const gate = await requireMarketplaceApi(req)
    if (!gate.ok) return gate.response
    const config = requireMeliConfig(req, gate.storeId)
    await disconnectMercadoLivre(config, gate)
    const response = meliJson({ ok: true })
    setMeliCookie(response, "", true)
    return response
  } catch (error) {
    return meliError(error)
  }
}
