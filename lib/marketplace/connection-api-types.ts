/** Tipos estáveis da API HTTP (cliente não importa `@/generated/prisma`). */
export type MarketplaceProviderCode = "MERCADO_LIVRE" | "SHOPEE" | "AMAZON" | "MAGALU"

export type MarketplaceConnectionStatusCode = "DISCONNECTED" | "CONNECTED" | "ERROR" | "SYNCING"

export type MarketplaceSyncLogDTO = {
  id: string
  message: string
  createdAt: string
}

export type MarketplaceConnectionDTO = {
  id: string
  storeId: string
  provider: MarketplaceProviderCode
  accountName: string
  status: MarketplaceConnectionStatusCode
  metadata: unknown
  lastSyncAt: string | null
  lastSyncMessage: string
  createdAt: string
  updatedAt: string
  recentSyncLogs: MarketplaceSyncLogDTO[]
}
