export const MELI_NUMERIC_ID_PATTERN = "[1-9][0-9]{0,18}"

export type MarketplaceSeller = {
  id: string
  nickname: string | null
  siteStatus: string | null
  testAccount: boolean
}

export type MarketplaceReadConnectionState =
  | "not_configured"
  | "awaiting_authorization"
  | "validated"
  | "token_expired"
  | "reconnect_required"
  | "insufficient_permissions"
  | "disconnected"
  | "communication_error"

export type MarketplaceReadConnection = {
  enabled: boolean
  state: MarketplaceReadConnectionState
  seller: MarketplaceSeller | null
  scopes: string[]
  canRead: boolean
  canDisconnect: boolean
}

type MarketplaceListingAttributes = {
  sku: string | null
  sellerCustomField: string | null
  color: string | null
  size: string | null
}

export type MarketplaceReadVariation = MarketplaceListingAttributes & {
  id: string
  price: number | null
  availableQuantity: number | null
  images: string[]
}

export type MarketplaceReadListing = MarketplaceListingAttributes & {
  id: string
  title: string
  status: string
  currency: string | null
  price: number | null
  availableQuantity: number | null
  categoryId: string | null
  images: string[]
  variations: MarketplaceReadVariation[]
  userProductId: string | null
  familyId: string | null
  familyName: string | null
}

export type MarketplaceReadPage = {
  listings: MarketplaceReadListing[]
  nextCursor: string | null
  unavailable: number
}
