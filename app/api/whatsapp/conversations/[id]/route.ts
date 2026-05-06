import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { assignConversation, markConversationAsHuman } from "@/lib/whatsapp/whatsapp-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória: header x-assistec-loja-id ou query storeId.")

    const { id } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("JSON inválido")
    }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    if (typeof o.humanMode === "boolean") {
      await markConversationAsHuman(storeId, id, o.humanMode)
    }
    if ("assignedToUserId" in o) {
      const raw = o.assignedToUserId
      const uid =
        raw === null ? null : typeof raw === "string" ? raw.trim() || null : null
      await assignConversation(storeId, id, uid)
    }
    if (typeof o.unreadCount === "number" && Number.isFinite(o.unreadCount)) {
      await prisma.whatsAppConversation.updateMany({
        where: { id, storeId },
        data: { unreadCount: Math.max(0, Math.floor(o.unreadCount)) },
      })
    }

    const row = await prisma.whatsAppConversation.findFirst({
      where: { id, storeId },
      include: { contact: true },
    })
    if (!row) return json({ error: "Conversa não encontrada" }, { status: 404 })
    return json({ ok: true, conversation: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
