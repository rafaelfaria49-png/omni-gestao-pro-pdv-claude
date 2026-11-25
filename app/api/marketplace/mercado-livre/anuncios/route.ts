import { z } from "zod"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { MercadoLivreAdapter } from "@/lib/marketplace/mercado-livre/adapter"
import { readMercadoLivreAds } from "@/lib/marketplace/mercado-livre/connection-service"
import { MeliFailure } from "@/lib/marketplace/mercado-livre/errors"
import { meliError, meliJson, requireMeliConfig } from "@/lib/marketplace/mercado-livre/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({ cursor: z.string().min(1).max(4096).optional() }).strict()

export async function POST(req: Request) {
  try {
    const denied = await requireModuleApi(req, "marketplace")
    if (denied) return denied
    const gate = await requireMarketplaceApi(req)
    if (!gate.ok) return gate.response
    const config = requireMeliConfig(req, gate.storeId)
    const query = querySchema.safeParse(await req.json().catch(() => null))
    if (!query.success || new URL(req.url).search) throw new MeliFailure("invalid_cursor")
    const page = await readMercadoLivreAds(config, new MercadoLivreAdapter(config), gate.storeId, query.data.cursor)
    return meliJson(page)
  } catch (error) {
    return meliError(error)
  }
}
