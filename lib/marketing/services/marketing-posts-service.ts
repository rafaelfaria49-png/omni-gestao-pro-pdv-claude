import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { isMarketingHubCanal, isMarketingHubStatus } from "@/lib/marketing/hub-post-constants"
import type { MarketingPostDTO } from "@/lib/marketing/hub-post-mapper"

export function serializeMarketingPostRow(row: {
  id: string
  titulo: string
  canal: string
  status: string
  conteudo: string
  legenda: string
  hashtags: string
  cta: string
  imagemUrl: string
  scheduledAt: Date | null
  publishedAt: Date | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}): MarketingPostDTO {
  return {
    id: row.id,
    titulo: row.titulo,
    canal: row.canal,
    status: row.status,
    conteudo: row.conteudo,
    legenda: row.legenda,
    hashtags: row.hashtags,
    cta: row.cta,
    imagemUrl: row.imagemUrl,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const SELECT_DEFAULT = {
  id: true,
  titulo: true,
  canal: true,
  status: true,
  conteudo: true,
  legenda: true,
  hashtags: true,
  cta: true,
  imagemUrl: true,
  scheduledAt: true,
  publishedAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function listMarketingPostsForStore(storeId: string): Promise<MarketingPostDTO[]> {
  const rows = await prisma.marketingPost.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: SELECT_DEFAULT,
  })
  return rows.map(serializeMarketingPostRow)
}

export type CreateMarketingPostInput = {
  titulo: string
  canal: string
  status?: string
  conteudo?: string
  legenda?: string
  hashtags?: string
  cta?: string
  imagemUrl?: string
  scheduledAt?: Date | null
  publishedAt?: Date | null
  metadata?: Prisma.InputJsonValue | null
}

export async function createMarketingPost(storeId: string, input: CreateMarketingPostInput): Promise<MarketingPostDTO> {
  const canal = input.canal.trim()
  if (!isMarketingHubCanal(canal)) throw new Error("canal inválido")
  const statusRaw = (input.status ?? "rascunho").trim()
  const status = isMarketingHubStatus(statusRaw) ? statusRaw : "rascunho"

  const row = await prisma.marketingPost.create({
    data: {
      storeId,
      titulo: input.titulo.trim().slice(0, 240) || "Post",
      canal,
      status,
      conteudo: (input.conteudo ?? "").slice(0, 24_000),
      legenda: (input.legenda ?? "").slice(0, 8_000),
      hashtags: (input.hashtags ?? "").slice(0, 2_000),
      cta: (input.cta ?? "").slice(0, 240),
      imagemUrl: (input.imagemUrl ?? "").slice(0, 12_000),
      scheduledAt: input.scheduledAt === undefined ? null : input.scheduledAt,
      publishedAt: input.publishedAt === undefined ? null : input.publishedAt,
      metadata:
        input.metadata === undefined
          ? undefined
          : input.metadata === null
            ? Prisma.DbNull
            : input.metadata,
    },
    select: SELECT_DEFAULT,
  })
  return serializeMarketingPostRow(row)
}

export type PatchMarketingPostInput = {
  titulo?: string
  canal?: string
  status?: string
  conteudo?: string
  legenda?: string
  hashtags?: string
  cta?: string
  imagemUrl?: string
  scheduledAt?: Date | null
  publishedAt?: Date | null
  metadata?: Prisma.InputJsonValue | null
}

export async function patchMarketingPost(
  storeId: string,
  id: string,
  patch: PatchMarketingPostInput
): Promise<MarketingPostDTO | null> {
  const existing = await prisma.marketingPost.findFirst({ where: { id, storeId }, select: { id: true } })
  if (!existing) return null

  const data: Prisma.MarketingPostUpdateInput = {}
  if (patch.titulo !== undefined) data.titulo = patch.titulo.trim().slice(0, 240)
  if (patch.canal !== undefined) {
    const c = patch.canal.trim()
    if (!isMarketingHubCanal(c)) throw new Error("canal inválido")
    data.canal = c
  }
  if (patch.status !== undefined) {
    const s = patch.status.trim()
    if (!isMarketingHubStatus(s)) throw new Error("status inválido")
    data.status = s
  }
  if (patch.conteudo !== undefined) data.conteudo = patch.conteudo.slice(0, 24_000)
  if (patch.legenda !== undefined) data.legenda = patch.legenda.slice(0, 8_000)
  if (patch.hashtags !== undefined) data.hashtags = patch.hashtags.slice(0, 2_000)
  if (patch.cta !== undefined) data.cta = patch.cta.slice(0, 240)
  if (patch.imagemUrl !== undefined) data.imagemUrl = patch.imagemUrl.slice(0, 12_000)
  if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt
  if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt
  if (patch.metadata !== undefined) data.metadata = patch.metadata === null ? Prisma.DbNull : patch.metadata

  const row = await prisma.marketingPost.update({
    where: { id },
    data,
    select: SELECT_DEFAULT,
  })
  return serializeMarketingPostRow(row)
}

export async function deleteMarketingPost(storeId: string, id: string): Promise<boolean> {
  const r = await prisma.marketingPost.deleteMany({ where: { id, storeId } })
  return r.count === 1
}
