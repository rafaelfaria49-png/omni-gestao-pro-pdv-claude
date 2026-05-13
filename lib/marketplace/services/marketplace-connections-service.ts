import type { MarketplaceConnectionStatus, MarketplaceProvider } from "@/generated/prisma"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { MARKETPLACE_PROVIDER_IDS } from "@/lib/marketplace/providers"

const TOKEN_PLACEHOLDER = "[encrypted:placeholder]"

const SYNC_MESSAGES = [
  "Sincronizando anúncios…",
  "Pedidos importados",
  "Estoque sincronizado",
  "Preço atualizado",
] as const

/** Select único para listagem / API — evita uniões de payload sem `syncLogs`. */
export const MARKETPLACE_CONNECTION_API_SELECT = Prisma.validator<Prisma.MarketplaceConnectionSelect>()({
  id: true,
  storeId: true,
  provider: true,
  accountName: true,
  status: true,
  metadata: true,
  lastSyncAt: true,
  lastSyncMessage: true,
  createdAt: true,
  updatedAt: true,
  syncLogs: {
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, message: true, createdAt: true },
  },
})

export type MarketplaceConnectionApiRow = Prisma.MarketplaceConnectionGetPayload<{
  select: typeof MARKETPLACE_CONNECTION_API_SELECT
}>

export function serializeMarketplaceConnection(row: MarketplaceConnectionApiRow) {
  return {
    id: row.id,
    storeId: row.storeId,
    provider: row.provider,
    accountName: row.accountName,
    status: row.status,
    metadata: row.metadata ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncMessage: row.lastSyncMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recentSyncLogs: row.syncLogs.map((l) => ({
      id: l.id,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  }
}

function metadataToPrismaCreate(
  v: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (v === undefined) return undefined
  if (v === null) return Prisma.DbNull
  return v as Prisma.InputJsonValue
}

function metadataToPrismaUpdate(
  v: Record<string, unknown> | null | undefined
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (v === null) return Prisma.DbNull
  return v as Prisma.InputJsonValue
}

export async function listMarketplaceConnections(storeId: string): Promise<MarketplaceConnectionApiRow[]> {
  return prisma.marketplaceConnection.findMany({
    where: { storeId },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    select: MARKETPLACE_CONNECTION_API_SELECT,
  })
}

export async function createMarketplaceConnection(input: {
  storeId: string
  provider: MarketplaceProvider
  accountName: string
  metadata?: Record<string, unknown> | null
}): Promise<MarketplaceConnectionApiRow> {
  const name = input.accountName.trim() || defaultAccountName(input.provider)
  return prisma.marketplaceConnection.create({
    data: {
      storeId: input.storeId,
      provider: input.provider,
      accountName: name,
      status: "CONNECTED",
      accessToken: TOKEN_PLACEHOLDER,
      refreshToken: "",
      metadata: metadataToPrismaCreate(input.metadata),
    },
    select: MARKETPLACE_CONNECTION_API_SELECT,
  })
}

export async function patchMarketplaceConnection(input: {
  storeId: string
  id: string
  accountName?: string
  status?: MarketplaceConnectionStatus
  metadata?: Record<string, unknown> | null
  simulateSync?: boolean
}): Promise<MarketplaceConnectionApiRow | null> {
  const existing = await prisma.marketplaceConnection.findFirst({
    where: { id: input.id, storeId: input.storeId },
  })
  if (!existing) return null

  if (input.simulateSync) {
    const now = new Date()
    const lastMsg = SYNC_MESSAGES[SYNC_MESSAGES.length - 1]
    await prisma.$transaction([
      prisma.marketplaceSyncLog.createMany({
        data: SYNC_MESSAGES.map((message) => ({
          storeId: input.storeId,
          connectionId: input.id,
          message,
        })),
      }),
      prisma.marketplaceConnection.update({
        where: { id: input.id },
        data: {
          status: "CONNECTED",
          lastSyncAt: now,
          lastSyncMessage: lastMsg,
        },
      }),
    ])
    return prisma.marketplaceConnection.findFirst({
      where: { id: input.id, storeId: input.storeId },
      select: MARKETPLACE_CONNECTION_API_SELECT,
    })
  }

  const data: Prisma.MarketplaceConnectionUpdateInput = {}
  if (input.accountName !== undefined) data.accountName = input.accountName.trim() || existing.accountName
  if (input.status !== undefined) data.status = input.status
  if (input.metadata !== undefined) {
    data.metadata = metadataToPrismaUpdate(input.metadata)
  }

  if (Object.keys(data).length === 0) {
    return prisma.marketplaceConnection.findFirst({
      where: { id: input.id, storeId: input.storeId },
      select: MARKETPLACE_CONNECTION_API_SELECT,
    })
  }

  await prisma.marketplaceConnection.update({
    where: { id: input.id },
    data,
  })
  return prisma.marketplaceConnection.findFirst({
    where: { id: input.id, storeId: input.storeId },
    select: MARKETPLACE_CONNECTION_API_SELECT,
  })
}

export async function deleteMarketplaceConnection(storeId: string, id: string) {
  const r = await prisma.marketplaceConnection.deleteMany({ where: { id, storeId } })
  return r.count === 1
}

export function defaultAccountName(provider: MarketplaceProvider): string {
  switch (provider) {
    case "MERCADO_LIVRE":
      return "Conta Mercado Livre"
    case "SHOPEE":
      return "Conta Shopee"
    case "AMAZON":
      return "Conta Amazon"
    case "MAGALU":
      return "Conta Magalu"
    default:
      return "Conta marketplace"
  }
}

export function parseProvider(body: unknown): MarketplaceProvider | null {
  if (!body || typeof body !== "object") return null
  const p = (body as { provider?: unknown }).provider
  if (typeof p !== "string") return null
  if (!MARKETPLACE_PROVIDER_IDS.includes(p as MarketplaceProvider)) return null
  return p as MarketplaceProvider
}
