import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { mercadoLivreConfig } from "@/lib/marketplace/mercado-livre/config"
import { describeMercadoLivre } from "@/lib/marketplace/mercado-livre/connection-service"
import { MeliFailure } from "@/lib/marketplace/mercado-livre/errors"
import { meliError, meliJson } from "@/lib/marketplace/mercado-livre/http"
import { listMarketplaceConnections, serializeMarketplaceConnection } from "@/lib/marketplace/services/marketplace-connections-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST mantém o estado de todas as conexões fora do cache GET do service worker.
export async function POST(req: Request) {
  try {
    const denied = await requireModuleApi(req, "marketplace")
    if (denied) return denied
    const gate = await requireMarketplaceApi(req)
    if (!gate.ok) return gate.response
    if (req.headers.get(ASSISTEC_LOJA_HEADER)?.trim() !== gate.storeId) throw new MeliFailure("invalid_state")
    const config = mercadoLivreConfig()
    const [rows, mercadoLivre] = await Promise.all([
      listMarketplaceConnections(gate.storeId),
      describeMercadoLivre(gate.storeId, req.headers.get("Origin") === config?.origin ? config : null),
    ])
    return meliJson({ connections: rows.map(serializeMarketplaceConnection), mercadoLivre })
  } catch (error) {
    return meliError(error)
  }
}
