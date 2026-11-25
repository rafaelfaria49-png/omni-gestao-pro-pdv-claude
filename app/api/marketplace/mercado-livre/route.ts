import { z } from "zod"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { MercadoLivreAdapter, meliNumericId } from "@/lib/marketplace/mercado-livre/adapter"
import { disconnectMercadoLivre, startMercadoLivre } from "@/lib/marketplace/mercado-livre/connection-service"
import { meliError, meliJson, requireMeliConfig, setMeliCookie } from "@/lib/marketplace/mercado-livre/http"
import { MeliFailure } from "@/lib/marketplace/mercado-livre/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const startSchema = z.object({ sellerId: meliNumericId.optional() }).strict()

export async function POST(req: Request) {
  try {
    const denied = await requireModuleApi(req, "marketplace")
    if (denied) return denied
    const gate = await requireMarketplaceApi(req)
    if (!gate.ok) return gate.response
    const config = requireMeliConfig(req, gate.storeId)
    let data: unknown
    try {
      const body = await req.text()
      data = body ? JSON.parse(body) : {}
    } catch {
      throw new MeliFailure("invalid_seller_id")
    }
    const input = startSchema.safeParse(data)
    if (!input.success) throw new MeliFailure("invalid_seller_id")
    const { authorizationUrl, cookie } = await startMercadoLivre(config, new MercadoLivreAdapter(config), gate, input.data.sellerId)
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
