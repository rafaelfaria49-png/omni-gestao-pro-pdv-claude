import { randomBytes } from "node:crypto"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import type {
  MarketplaceCatalogProductDTO,
  MarketplaceProductLinkDTO,
} from "@/lib/marketplace/product-api-types"

const LINK_SELECT = Prisma.validator<Prisma.MarketplaceProductLinkSelect>()({
  id: true,
  connectionId: true,
  provider: true,
  externalId: true,
  status: true,
  syncStatus: true,
  price: true,
  stock: true,
  publishedAt: true,
  metadata: true,
  updatedAt: true,
})

type LinkRow = Prisma.MarketplaceProductLinkGetPayload<{ select: typeof LINK_SELECT }>

export function serializeProductLink(row: LinkRow): MarketplaceProductLinkDTO {
  return {
    id: row.id,
    connectionId: row.connectionId,
    provider: row.provider,
    externalId: row.externalId ?? null,
    status: row.status,
    syncStatus: row.syncStatus,
    price: row.price,
    stock: row.stock,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    metadata: row.metadata ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mergeLinkMetadata(
  existing: unknown,
  produtoMetadata: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  if (produtoMetadata !== undefined && produtoMetadata !== null) {
    base.produto = produtoMetadata
  }
  return base as Prisma.InputJsonValue
}

export async function appendMarketplaceSyncLog(storeId: string, connectionId: string, message: string) {
  await prisma.marketplaceSyncLog.create({
    data: { storeId, connectionId, message },
  })
}

export async function listMarketplaceCatalog(
  storeId: string,
  opts?: { connectionId?: string | null }
): Promise<MarketplaceCatalogProductDTO[]> {
  const connectionId = opts?.connectionId?.trim() || null

  const products = await prisma.produto.findMany({
    where: { storeId, active: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      stock: true,
      price: true,
      metadata: true,
      marketplaceProductLinks: {
        where: connectionId ? { connectionId } : { storeId },
        select: LINK_SELECT,
      },
    },
  })

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    stock: p.stock,
    price: p.price,
    metadata: p.metadata ?? null,
    links: p.marketplaceProductLinks.map(serializeProductLink),
  }))
}

export async function exportMarketplaceProducts(input: {
  storeId: string
  connectionId: string
  productIds: string[]
  simulatePublishError?: boolean
}): Promise<{ productId: string; link: MarketplaceProductLinkDTO }[]> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { id: input.connectionId, storeId: input.storeId },
  })
  if (!conn) {
    throw new Error("Conexão não encontrada para esta unidade.")
  }

  const ids = [...new Set(input.productIds.map((x) => x.trim()).filter(Boolean))]
  if (ids.length === 0) {
    throw new Error("Informe ao menos um produtoId.")
  }

  const produtos = await prisma.produto.findMany({
    where: { storeId: input.storeId, id: { in: ids } },
    select: { id: true, name: true, stock: true, price: true, metadata: true },
  })
  if (produtos.length !== ids.length) {
    throw new Error("Um ou mais produtos não pertencem a esta unidade.")
  }

  const simulateErr = Boolean(input.simulatePublishError)
  const out: { productId: string; link: MarketplaceProductLinkDTO }[] = []

  for (const p of produtos) {
    const externalId = simulateErr ? null : `SIM-${randomBytes(6).toString("hex")}`
    const existing = await prisma.marketplaceProductLink.findUnique({
      where: {
        marketplace_product_link_connection_produto: {
          connectionId: input.connectionId,
          produtoId: p.id,
        },
      },
      select: LINK_SELECT,
    })

    const metaMerged = mergeLinkMetadata(existing?.metadata ?? null, p.metadata)

    const row = await prisma.marketplaceProductLink.upsert({
      where: {
        marketplace_product_link_connection_produto: {
          connectionId: input.connectionId,
          produtoId: p.id,
        },
      },
      create: {
        storeId: input.storeId,
        produtoId: p.id,
        connectionId: input.connectionId,
        provider: conn.provider,
        externalId,
        price: p.price,
        stock: p.stock,
        status: simulateErr ? "ERROR" : "PUBLISHED",
        syncStatus: simulateErr ? "SYNC_ERROR" : "SYNCED",
        publishedAt: simulateErr ? null : new Date(),
        metadata: metaMerged as Prisma.InputJsonValue,
      },
      update: {
        provider: conn.provider,
        externalId: simulateErr ? null : externalId,
        price: p.price,
        stock: p.stock,
        status: simulateErr ? "ERROR" : "PUBLISHED",
        syncStatus: simulateErr ? "SYNC_ERROR" : "SYNCED",
        publishedAt: simulateErr ? null : new Date(),
        metadata: metaMerged as Prisma.InputJsonValue,
      },
      select: LINK_SELECT,
    })

    const msg = simulateErr
      ? `[mock] Erro na exportação simulada: ${p.name} (${p.id})`
      : `[mock] Exportação simulada: ${p.name} (${p.id}) → ${externalId}`
    await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg)

    out.push({ productId: p.id, link: serializeProductLink(row) })
  }

  return out
}

export async function patchMarketplaceProductLink(input: {
  storeId: string
  produtoId: string
  connectionId: string
  action: "sync" | "update_stock"
  simulateError?: boolean
}): Promise<MarketplaceProductLinkDTO> {
  const link = await prisma.marketplaceProductLink.findFirst({
    where: {
      produtoId: input.produtoId,
      connectionId: input.connectionId,
      storeId: input.storeId,
    },
    select: LINK_SELECT,
  })
  if (!link) {
    throw new Error("Vínculo não encontrado. Exporte o produto para este canal primeiro.")
  }

  const produto = await prisma.produto.findFirst({
    where: { id: input.produtoId, storeId: input.storeId },
    select: { name: true, stock: true, price: true },
  })
  if (!produto) {
    throw new Error("Produto não encontrado.")
  }

  const simulateErr = Boolean(input.simulateError)

  if (input.action === "sync") {
    if (link.status !== "PUBLISHED") {
      throw new Error("Só é possível sincronizar após publicação simulada (exportação).")
    }
    const nextSync = simulateErr ? "SYNC_ERROR" : "SYNCED"
    const nextStatus = simulateErr ? "ERROR" : "PUBLISHED"
    const updated = await prisma.marketplaceProductLink.update({
      where: { id: link.id },
      data: {
        syncStatus: nextSync,
        status: nextStatus,
        price: produto.price,
        stock: produto.stock,
      },
      select: LINK_SELECT,
    })
    const msg = simulateErr
      ? `[mock] Erro na sincronização: ${produto.name} (${input.produtoId})`
      : `[mock] Sincronização simulada: ${produto.name} (${input.produtoId})`
    await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg)
    return serializeProductLink(updated)
  }

  // update_stock
  const nextSync = simulateErr ? "SYNC_ERROR" : "SYNCED"
  const nextStatus = simulateErr ? "ERROR" : link.status
  const updated = await prisma.marketplaceProductLink.update({
    where: { id: link.id },
    data: {
      stock: produto.stock,
      syncStatus: nextSync,
      status: nextStatus,
    },
    select: LINK_SELECT,
  })
  const msg = simulateErr
    ? `[mock] Erro ao atualizar estoque (simulado): ${produto.name}`
    : `[mock] Estoque atualizado (simulado): ${produto.name} → ${produto.stock} un.`
  await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg)
  return serializeProductLink(updated)
}
