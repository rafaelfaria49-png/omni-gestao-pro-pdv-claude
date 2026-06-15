/**
 * WhatsApp IA — F3 · sugestão de catálogo/estoque para uma conversa (ASSISTIDO, leitura).
 *
 * POST /api/whatsapp/conversations/[id]/product-suggestion
 * Body: { text: string, entities?: WhatsAppIntentEntities, limit?: number }
 *
 * Multi-loja: `storeId` vem do guard de LEITURA (header → query → cookie, SEM fallback loja-1).
 * Somente leitura do catálogo — não envia mensagem, não altera nada. O resolver garante que
 * só produtos da loja resolvida são consultados.
 */

import { NextResponse } from "next/server"
import { guardWhatsAppApiRead } from "@/lib/whatsapp/whatsapp-api-guard"
import { resolveWhatsAppProducts } from "@/lib/whatsapp/whatsapp-product-resolver"
import type { WhatsAppIntentEntities } from "@/lib/whatsapp/whatsapp-intent-classifier"

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
    let entities: WhatsAppIntentEntities = {}
    let limit = 5
    try {
      const body = (await req.json()) as {
        text?: unknown
        entities?: unknown
        limit?: unknown
      }
      if (typeof body.text === "string") text = body.text
      if (body.entities && typeof body.entities === "object") {
        entities = body.entities as WhatsAppIntentEntities
      }
      if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
        limit = Math.min(10, Math.max(1, Math.trunc(body.limit)))
      }
    } catch {
      /* corpo opcional */
    }

    const resolution = await resolveWhatsAppProducts({ storeId, text, entities, limit })
    return NextResponse.json({ ok: true, resolution })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
