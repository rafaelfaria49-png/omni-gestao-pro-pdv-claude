/** Tipos estáveis da API HTTP de catálogo marketplace (cliente não importa Prisma). */

export type MarketplaceProductLinkStatusCode = "NOT_PUBLISHED" | "PUBLISHED" | "ERROR"

export type MarketplaceProductSyncStatusCode = "IDLE" | "PENDING" | "SYNCED" | "SYNC_ERROR"

export type MarketplaceProductLinkDTO = {
  id: string
  connectionId: string
  provider: string
  externalId: string | null
  status: MarketplaceProductLinkStatusCode
  syncStatus: MarketplaceProductSyncStatusCode
  price: number
  stock: number
  publishedAt: string | null
  metadata: unknown
  updatedAt: string
}

export type MarketplaceCatalogProductDTO = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
  price: number
  metadata: unknown
  /** Vínculos desta unidade; filtrados por `connectionId` na query quando informado. */
  links: MarketplaceProductLinkDTO[]
}
