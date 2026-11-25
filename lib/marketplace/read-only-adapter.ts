import type { MarketplaceProviderCode } from "./connection-api-types"
import type { MarketplaceReadPage, MarketplaceSeller } from "./read-only-types"

/** Contrato de consulta do canal. Publicação, estoque e pedidos ficam em capacidades próprias. */
export interface MarketplaceReadOnlyAdapter {
  readonly provider: MarketplaceProviderCode
  authorizationUrl(state: string, challenge: string): string
  exchangeCode(code: string, verifier: string): Promise<MarketplaceGrant>
  refresh(refreshToken: string): Promise<MarketplaceGrant>
  identifySeller(accessToken: string): Promise<MarketplaceSeller>
  listAds(accessToken: string, sellerId: string, cursor?: string): Promise<MarketplaceReadPage>
}

export type MarketplaceGrant = {
  accessToken: string
  refreshToken: string
  sellerId: string
  expiresAt: number
  scopes: string[]
}
