import { NextResponse } from "next/server"
import { requireMarketingHubApi } from "@/lib/marketing/hub-api-gate"
import { createMarketingPost, listMarketingPostsForStore } from "@/lib/marketing/services/marketing-posts-service"
import { prismaEnsureConnected } from "@/lib/prisma"
import { isMarketingHubCanal, isMarketingHubStatus } from "@/lib/marketing/hub-post-constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireMarketingHubApi(req, "read")
  if (!gate.ok) return gate.response
  await prismaEnsureConnected()
  try {
    const posts = await listMarketingPostsForStore(gate.storeId)
    return NextResponse.json({ posts })
  } catch {
    return NextResponse.json({ posts: [], error: "db_error" }, { status: 500 })
  }
}

type PostBody = {
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

export async function POST(req: Request) {
  const gate = await requireMarketingHubApi(req, "write")
  if (!gate.ok) return gate.response
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const canal = typeof body.canal === "string" ? body.canal.trim() : ""
  if (!canal || !isMarketingHubCanal(canal)) {
    return NextResponse.json({ error: "canal obrigatório (instagram|facebook|whatsapp|google|geral)" }, { status: 400 })
  }
  const titulo = typeof body.titulo === "string" ? body.titulo.trim() : ""
  if (!titulo) return NextResponse.json({ error: "titulo obrigatório" }, { status: 400 })

  const statusRaw = typeof body.status === "string" ? body.status.trim() : "rascunho"
  const status = isMarketingHubStatus(statusRaw) ? statusRaw : "rascunho"

  const parseDate = (v: string | null | undefined): Date | null => {
    if (v === null) return null
    if (typeof v !== "string" || !v.trim()) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }

  await prismaEnsureConnected()
  try {
    const post = await createMarketingPost(gate.storeId, {
      titulo,
      canal,
      status,
      conteudo: typeof body.conteudo === "string" ? body.conteudo : "",
      legenda: typeof body.legenda === "string" ? body.legenda : "",
      hashtags: typeof body.hashtags === "string" ? body.hashtags : "",
      cta: typeof body.cta === "string" ? body.cta : "",
      imagemUrl: typeof body.imagemUrl === "string" ? body.imagemUrl : "",
      scheduledAt: parseDate(body.scheduledAt),
      publishedAt: parseDate(body.publishedAt),
      metadata: body.metadata === undefined ? undefined : (body.metadata as object),
    })
    return NextResponse.json({ ok: true, post }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "db_error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
