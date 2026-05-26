import { NextResponse } from "next/server"
import { analyzeWhatsAppConversation } from "@/lib/whatsapp/ai-conversation-analysis"
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return badRequest("Unidade obrigatória: header x-assistec-loja-id ou query storeId.")
    }

    const { id: conversationId } = await ctx.params
    if (!conversationId?.trim()) return badRequest("ID da conversa inválido")

    let force = false
    try {
      const body = (await req.json()) as { force?: unknown }
      force = body?.force === true
    } catch {
      /* body opcional */
    }

    const result = await analyzeWhatsAppConversation(storeId, conversationId.trim(), { force })
    return json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("não encontrada")) {
      return json({ error: msg }, { status: 404 })
    }
    return json({ error: msg }, { status: 500 })
  }
}
