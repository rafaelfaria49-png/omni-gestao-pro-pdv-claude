import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardIaMestreApiRead } from "@/lib/ia-mestre/api-guard"
import { mapDbMessagesToClient } from "@/lib/ia-mestre/persist-turn"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: RouteCtx) {
  const guard = await guardIaMestreApiRead(req)
  if (!guard.ok) return guard.response

  const { id } = await ctx.params
  const conversationId = String(id || "").trim()
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 })
  }

  try {
    const conversation = await prisma.iaConversation.findFirst({
      where: { id: conversationId, storeId: guard.storeId },
      select: {
        id: true,
        title: true,
        model: true,
        brandVoiceEnabled: true,
        updatedAt: true,
        createdAt: true,
      },
    })
    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Conversa não encontrada" }, { status: 404 })
    }

    const messageRows = await prisma.iaMessage.findMany({
      where: { storeId: guard.storeId, conversationId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, content: true, meta: true, createdAt: true },
    })

    return NextResponse.json({
      ok: true,
      storeId: guard.storeId,
      conversation: {
        ...conversation,
        updatedAt: conversation.updatedAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
      },
      messages: mapDbMessagesToClient(messageRows),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar conversa"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
