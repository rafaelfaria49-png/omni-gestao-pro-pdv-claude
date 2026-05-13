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

export async function listMarketplaceConnections(storeId: string) {
  return prisma.marketplaceConnection.findMany({
    where: { storeId },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    select: {
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
    },
  })
}

export async function createMarketplaceConnection(input: {
  storeId: string
  provider: MarketplaceProvider
  accountName: string
  metadata?: Record<string, unknown> | null
}) {
  const name = input.accountName.trim() || defaultAccountName(input.provider)
  return prisma.marketplaceConnection.create({
    data: {
      storeId: input.storeId,
      provider: input.provider,
      accountName: name,
      status: "CONNECTED",
      accessToken: TOKEN_PLACEHOLDER,
      refreshToken: "",
      metadata: (input.metadata ?? undefined) as object | undefined,
    },
    select: {
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
    },
  })
}

export async function patchMarketplaceConnection(input: {
  storeId: string
  id: string
  accountName?: string
  status?: MarketplaceConnectionStatus
  metadata?: Record<string, unknown> | null
  simulateSync?: boolean
}) {
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
      select: {
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
      },
    })
  }

  const data: Prisma.MarketplaceConnectionUpdateInput = {}
  if (input.accountName !== undefined) data.accountName = input.accountName.trim() || existing.accountName
  if (input.status !== undefined) data.status = input.status
  if (input.metadata !== undefined) {
    data.metadata =
      input.metadata === null ? Prisma.DbNull : (input.metadata as Prisma.InputJsonValue)
  }

  if (Object.keys(data).length === 0) {
    return prisma.marketplaceConnection.findFirst({
      where: { id: input.id, storeId: input.storeId },
      select: {
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
      },
    })
  }

  await prisma.marketplaceConnection.update({
    where: { id: input.id },
    data,
  })
  return prisma.marketplaceConnection.findFirst({
    where: { id: input.id, storeId: input.storeId },
    select: {
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
    },
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
