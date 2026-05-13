import { NextResponse } from "next/server"
import { requireMarketingHubApi } from "@/lib/marketing/hub-api-gate"
import {
  deleteMarketingPost,
  patchMarketingPost,
  type PatchMarketingPostInput,
} from "@/lib/marketing/services/marketing-posts-service"
import { prismaEnsureConnected } from "@/lib/prisma"
import { isMarketingHubCanal, isMarketingHubStatus } from "@/lib/marketing/hub-post-constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type PatchBody = {
  titulo?: string
  canal?: string
  status?: string
  conteudo?: string
  legenda?: string
  hashtags?: string
  cta?: string
  imagemUrl?: string
  scheduledAt?: string | null
  publishedAt?: string | null
  metadata?: unknown
}

function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== "string" || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketingHubApi(req, "write")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const patch: PatchMarketingPostInput = {}
  if (body.titulo !== undefined) patch.titulo = body.titulo
  if (body.canal !== undefined) {
    const c = String(body.canal).trim()
    if (!isMarketingHubCanal(c)) return NextResponse.json({ error: "canal inválido" }, { status: 400 })
    patch.canal = c
  }
  if (body.status !== undefined) {
    const s = String(body.status).trim()
    if (!isMarketingHubStatus(s)) return NextResponse.json({ error: "status inválido" }, { status: 400 })
    patch.status = s
  }
  if (body.conteudo !== undefined) patch.conteudo = String(body.conteudo)
  if (body.legenda !== undefined) patch.legenda = String(body.legenda)
  if (body.hashtags !== undefined) patch.hashtags = String(body.hashtags)
  if (body.cta !== undefined) patch.cta = String(body.cta)
  if (body.imagemUrl !== undefined) patch.imagemUrl = String(body.imagemUrl)
  if (body.scheduledAt !== undefined) patch.scheduledAt = parseDate(body.scheduledAt)
  if (body.publishedAt !== undefined) patch.publishedAt = parseDate(body.publishedAt)
  if (body.metadata !== undefined) patch.metadata = body.metadata === null ? null : (body.metadata as object)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  await prismaEnsureConnected()
  try {
    const post = await patchMarketingPost(gate.storeId, id, patch)
    if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true, post })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "db_error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketingHubApi(_req, "write")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prismaEnsureConnected()
  const ok = await deleteMarketingPost(gate.storeId, id)
  if (!ok) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
