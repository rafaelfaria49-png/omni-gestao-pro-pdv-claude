import { randomBytes } from "node:crypto"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import type {
  MarketplaceAnnouncementRowDTO,
  MarketplaceCatalogProductDTO,
  MarketplaceProductLinkDTO,
  MarketplaceSyncLogEntryDTO,
} from "@/lib/marketplace/product-api-types"

const LINK_SELECT = Prisma.validator<Prisma.MarketplaceProductLinkSelect>()({
  id: true,
  produtoId: true,
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

export async function appendMarketplaceSyncLog(
  storeId: string,
  connectionId: string,
  message: string,
  opts?: { produtoId?: string | null; productLinkId?: string | null }
) {
  await prisma.marketplaceSyncLog.create({
    data: {
      storeId,
      connectionId,
      message,
      produtoId: opts?.produtoId?.trim() || undefined,
      productLinkId: opts?.productLinkId?.trim() || undefined,
    },
  })
}

export async function listMarketplaceCatalog(
  storeId: string,
  opts?: { connectionId?: string | null }
): Promise<MarketplaceCatalogProductDTO[]> {
  const connectionId = opts?.connectionId?.trim() || null

  if (connectionId) {
    const conn = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, storeId },
      select: { id: true },
    })
    if (!conn) {
      throw new Error("Conexão inválida ou não pertence a esta unidade.")
    }
  }

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
    await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg, {
      produtoId: p.id,
      productLinkId: row.id,
    })

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
    await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg, {
      produtoId: input.produtoId,
      productLinkId: link.id,
    })
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
  await appendMarketplaceSyncLog(input.storeId, input.connectionId, msg, {
    produtoId: input.produtoId,
    productLinkId: link.id,
  })
  return serializeProductLink(updated)
}

const LINK_STATUS_FILTER = ["NOT_PUBLISHED", "PUBLISHED", "ERROR"] as const
const SYNC_STATUS_FILTER = ["IDLE", "PENDING", "SYNCED", "SYNC_ERROR"] as const

export async function listMarketplaceAnnouncements(
  storeId: string,
  filters: {
    connectionId?: string | null
    status?: string | null
    syncStatus?: string | null
    q?: string | null
  }
): Promise<MarketplaceAnnouncementRowDTO[]> {
  const connectionId = filters.connectionId?.trim() || null
  if (connectionId) {
    const c = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, storeId },
      select: { id: true },
    })
    if (!c) {
      throw new Error("Conexão inválida ou não pertence a esta unidade.")
    }
  }

  const st = filters.status?.trim()
  const status =
    st && (LINK_STATUS_FILTER as readonly string[]).includes(st)
      ? (st as (typeof LINK_STATUS_FILTER)[number])
      : undefined

  const sy = filters.syncStatus?.trim()
  const syncStatus =
    sy && (SYNC_STATUS_FILTER as readonly string[]).includes(sy)
      ? (sy as (typeof SYNC_STATUS_FILTER)[number])
      : undefined

  const where: Prisma.MarketplaceProductLinkWhereInput = {
    storeId,
    ...(connectionId ? { connectionId } : {}),
    ...(status ? { status } : {}),
    ...(syncStatus ? { syncStatus } : {}),
    ...(filters.q?.trim()
      ? {
          produto: {
            name: { contains: filters.q.trim(), mode: Prisma.QueryMode.insensitive },
          },
        }
      : {}),
  }

  const rows = await prisma.marketplaceProductLink.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      produtoId: true,
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
      produto: { select: { id: true, name: true, sku: true } },
      connection: { select: { id: true, accountName: true, provider: true } },
    },
  })

  return rows.map((r) => ({
    link: serializeProductLink(r as unknown as LinkRow),
    produtoId: r.produtoId,
    produtoName: r.produto.name,
    produtoSku: r.produto.sku,
    connectionId: r.connection.id,
    connectionAccountName: r.connection.accountName,
    provider: r.connection.provider,
  }))
}

export async function listMarketplaceSyncLogs(opts: {
  storeId: string
  connectionId?: string | null
  produtoId?: string | null
  productLinkId?: string | null
  take?: number
}): Promise<MarketplaceSyncLogEntryDTO[]> {
  const take = Math.min(Math.max(opts.take ?? 40, 1), 100)

  if (opts.connectionId?.trim()) {
    const c = await prisma.marketplaceConnection.findFirst({
      where: { id: opts.connectionId.trim(), storeId: opts.storeId },
      select: { id: true },
    })
    if (!c) {
      throw new Error("Conexão inválida ou não pertence a esta unidade.")
    }
  }
  if (opts.produtoId?.trim()) {
    const p = await prisma.produto.findFirst({
      where: { id: opts.produtoId.trim(), storeId: opts.storeId },
      select: { id: true },
    })
    if (!p) {
      throw new Error("Produto não encontrado nesta unidade.")
    }
  }
  if (opts.productLinkId?.trim()) {
    const l = await prisma.marketplaceProductLink.findFirst({
      where: { id: opts.productLinkId.trim(), storeId: opts.storeId },
      select: { id: true },
    })
    if (!l) {
      throw new Error("Vínculo não encontrado nesta unidade.")
    }
  }

  const logs = await prisma.marketplaceSyncLog.findMany({
    where: {
      storeId: opts.storeId,
      ...(opts.connectionId?.trim() ? { connectionId: opts.connectionId.trim() } : {}),
      ...(opts.produtoId?.trim() ? { produtoId: opts.produtoId.trim() } : {}),
      ...(opts.productLinkId?.trim() ? { productLinkId: opts.productLinkId.trim() } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      message: true,
      createdAt: true,
      connectionId: true,
      produtoId: true,
      productLinkId: true,
    },
  })

  return logs.map((l) => ({
    id: l.id,
    message: l.message,
    createdAt: l.createdAt.toISOString(),
    connectionId: l.connectionId,
    produtoId: l.produtoId,
    productLinkId: l.productLinkId,
  }))
}

export async function patchMarketplaceLinkById(input: {
  storeId: string
  linkId: string
  action: "sync" | "update_stock" | "republicate"
  simulateError?: boolean
}): Promise<MarketplaceProductLinkDTO> {
  const link = await prisma.marketplaceProductLink.findFirst({
    where: { id: input.linkId, storeId: input.storeId },
    select: LINK_SELECT,
  })
  if (!link) {
    throw new Error("Vínculo não encontrado.")
  }

  const produto = await prisma.produto.findFirst({
    where: { id: link.produtoId, storeId: input.storeId },
    select: { id: true, name: true, stock: true, price: true },
  })
  if (!produto) {
    throw new Error("Produto não encontrado.")
  }

  const simulateErr = Boolean(input.simulateError)

  if (input.action === "republicate") {
    const updated = await prisma.marketplaceProductLink.update({
      where: { id: link.id },
      data: {
        status: "NOT_PUBLISHED",
        syncStatus: "PENDING",
        publishedAt: null,
        externalId: null,
      },
      select: LINK_SELECT,
    })
    await appendMarketplaceSyncLog(input.storeId, link.connectionId, `[mock] Marcado para republicar: ${produto.name}`, {
      produtoId: produto.id,
      productLinkId: link.id,
    })
    return serializeProductLink(updated)
  }

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
      ? `[mock] Erro na sincronização: ${produto.name} (${produto.id})`
      : `[mock] Sincronização simulada: ${produto.name} (${produto.id})`
    await appendMarketplaceSyncLog(input.storeId, link.connectionId, msg, {
      produtoId: produto.id,
      productLinkId: link.id,
    })
    return serializeProductLink(updated)
  }

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
  await appendMarketplaceSyncLog(input.storeId, link.connectionId, msg, {
    produtoId: produto.id,
    productLinkId: link.id,
  })
  return serializeProductLink(updated)
}
