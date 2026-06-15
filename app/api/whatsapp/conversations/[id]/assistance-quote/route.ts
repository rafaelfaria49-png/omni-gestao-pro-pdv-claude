/**
 * WhatsApp IA — F4 · orçamento sugerido de assistência para uma conversa (ASSISTIDO, leitura).
 *
 * POST /api/whatsapp/conversations/[id]/assistance-quote
 * Body: { text: string }
 *
 * Multi-loja: `storeId` vem do guard de LEITURA (header → query → cookie, SEM fallback loja-1).
 * Somente leitura de Serviços/Produtos — não envia, não cria OS, não toca estoque/financeiro.
 */

import { NextResponse } from "next/server"
import { guardWhatsAppApiRead } from "@/lib/whatsapp/whatsapp-api-guard"
import { resolveAssistanceQuote } from "@/lib/whatsapp/whatsapp-assistance-quote"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardWhatsAppApiRead(req)
    if (!guard.ok) return guard.response
    const storeId = guard.storeId

    const { id: conversationId } = await ctx.params
    if (!conversationId?.trim()) {
      return NextResponse.json({ ok: false, error: "ID da conversa inválido" }, { status: 400 })
    }

    let text = ""
    try {
      const body = (await req.json()) as { text?: unknown }
      if (typeof body.text === "string") text = body.text
    } catch {
      /* corpo opcional */
    }

    const quote = await resolveAssistanceQuote({ storeId, text })
    return NextResponse.json({ ok: true, quote })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
