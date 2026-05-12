import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

/** DELETE — remove etiqueta de uma conversa */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; etiquetaId: string }> }
) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return json({ error: "Unidade obrigatória." }, { status: 400 })

    const { id: conversationId, etiquetaId } = await ctx.params

    const count = await prisma.whatsAppConversacaoEtiqueta.deleteMany({
      where: { conversationId, etiquetaId },
    })
    if (count.count === 0) return json({ error: "Etiqueta não encontrada nesta conversa." }, { status: 404 })
    return json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
