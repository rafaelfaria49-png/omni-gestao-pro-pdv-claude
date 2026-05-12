import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

/** GET — lista etiquetas de uma conversa */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const rows = await prisma.whatsAppConversacaoEtiqueta.findMany({
      where: { conversationId: id },
      include: { etiqueta: true },
    })
    return json({ ok: true, etiquetas: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 500 })
  }
}

/** POST — adiciona etiqueta a uma conversa */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória.")

    const { id: conversationId } = await ctx.params
    let body: unknown
    try { body = await req.json() } catch { return badRequest("JSON inválido") }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const etiquetaId = typeof o.etiquetaId === "string" ? o.etiquetaId.trim() : ""
    if (!etiquetaId) return badRequest("etiquetaId obrigatório.")

    // Verify conversation belongs to store
    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, storeId },
      select: { id: true },
    })
    if (!conv) return json({ error: "Conversa não encontrada." }, { status: 404 })

    // Verify etiqueta belongs to store
    const etiqueta = await prisma.whatsAppEtiqueta.findFirst({
      where: { id: etiquetaId, storeId },
      select: { id: true },
    })
    if (!etiqueta) return json({ error: "Etiqueta não encontrada." }, { status: 404 })

    const row = await prisma.whatsAppConversacaoEtiqueta.upsert({
      where: { conversationId_etiquetaId: { conversationId, etiquetaId } },
      create: { conversationId, etiquetaId },
      update: {},
      include: { etiqueta: true },
    })
    return json({ ok: true, conversacaoEtiqueta: row }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
