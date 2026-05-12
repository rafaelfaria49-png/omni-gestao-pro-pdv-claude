/**
 * POST /api/debug/whatsapp-send-fake-meta?secret=<ASSISTEC_MASTER_PASSWORD>
 *
 * Injeta um payload Meta Cloud API realista diretamente no mesmo parser
 * que o webhook de produção usa — sem duplicar lógica.
 *
 * Útil para confirmar que o pipeline de persistência está funcional
 * independentemente da chegada real da Meta.
 *
 * Body (todos opcionais):
 *   { "from": "5514998568812", "text": "Olá, teste real" }
 *
 * Retorna:
 *   - ok
 *   - storeId usado
 *   - elapsed_ms
 *   - conversationId e messageId criados/encontrados no banco
 *   - errorMsg caso o pipeline falhe
 */

import { NextResponse } from "next/server"
import { processMetaWhatsAppWebhookPayload } from "@/lib/whatsapp-meta-cloud-webhook"
import { prisma } from "@/lib/prisma"
import { webhookDefaultStoreId } from "@/lib/whatsapp/whatsapp-service"

export const runtime  = "nodejs"
export const dynamic  = "force-dynamic"
export const revalidate = 0

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const provided = (url.searchParams.get("secret") ?? "").trim()
  if (!provided) return false
  const master = (process.env.ASSISTEC_MASTER_PASSWORD ?? "").trim()
  const debug  = (process.env.ASSISTEC_DEBUG_SECRET    ?? "").trim()
  return !!(master && provided === master) || !!(debug && provided === debug)
}

/**
 * Constrói um payload Meta Cloud API idêntico ao que a Meta envia
 * para um evento de mensagem de texto recebida (inbound).
 */
function buildRealisticMetaPayload(from: string, text: string, phoneNumberId: string): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: `WABA_FAKE_${Date.now()}`,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "TEST",
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: "Fake Meta Contact" },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id: `wamid.FAKE${Date.now()}${Math.floor(Math.random() * 9999)}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: text },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  }
}

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized — inclua ?secret= na URL" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const o         = (body ?? {}) as Record<string, unknown>
  const from      = String(o.from ?? "5511999990000").replace(/\D/g, "").trim() || "5511999990000"
  const text      = String(o.text ?? "Teste fake Meta — pipeline OmniGestão").trim()
  const storeId   = webhookDefaultStoreId()

  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "TEST_PHONE_ID").trim()
  const payload       = buildRealisticMetaPayload(from, text, phoneNumberId)

  console.info("[whatsapp-send-fake-meta:POST] injetando payload", JSON.stringify({
    from:     `${from.slice(0, 4)}****${from.slice(-4)}`,
    text:     text.slice(0, 60),
    storeId,
    phoneNumberId: phoneNumberId.length > 6
      ? `${phoneNumberId.slice(0, 4)}***${phoneNumberId.slice(-3)}`
      : "***",
  }))

  const startMs   = Date.now()
  let success     = false
  let errorMsg: string | null = null
  let convId: string | null = null
  let msgId: string | null = null

  try {
    // ← Chama EXATAMENTE o mesmo parser do webhook de produção
    await processMetaWhatsAppWebhookPayload(payload)
    success = true
  } catch (e) {
    errorMsg = e instanceof Error ? e.message.slice(0, 400) : String(e)
    console.error("[whatsapp-send-fake-meta:POST] pipeline error:", errorMsg)
  }

  // ── Verificar o que foi persistido no banco ───────────────────────────────
  if (success) {
    try {
      const fromDigits = from.replace(/\D/g, "")
      const contact = await prisma.whatsAppContact.findFirst({
        where: { storeId, phoneDigits: fromDigits },
        select: { id: true },
      })
      if (contact) {
        const conv = await prisma.whatsAppConversation.findFirst({
          where: { storeId, contactId: contact.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, lastMessageAt: true, unreadCount: true },
        })
        convId = conv?.id ?? null
        if (conv) {
          const msg = await prisma.whatsAppMessage.findFirst({
            where: { conversationId: conv.id, storeId, direction: "inbound" },
            orderBy: { createdAt: "desc" },
            select: { id: true, body: true, direction: true, createdAt: true },
          })
          msgId = msg?.id ?? null
        }
      }
    } catch (e) {
      console.warn("[whatsapp-send-fake-meta:POST] db-verify error:", e instanceof Error ? e.message : String(e))
    }
  }

  const elapsed = Date.now() - startMs

  return NextResponse.json({
    ok: success,
    storeId,
    from: `${from.slice(0, 4)}****${from.slice(-4)}`,
    text: text.slice(0, 80),
    elapsed_ms: elapsed,
    pipeline: {
      processMetaWebhookPayload: success ? "OK" : "ERROR",
      errorMsg,
    },
    persisted: {
      conversationId: convId,
      messageId:      msgId,
      savedToDb:      !!(convId && msgId),
    },
    nextSteps: success
      ? [
          "Pipeline OK. Verificar se a Meta está realmente enviando POST para o webhook.",
          "Usar GET /api/debug/whatsapp-latest para ver conversas/mensagens no banco.",
          "Verificar logs Vercel para [whatsapp-webhook:POST:HIT] quando mensagem real chegar.",
        ]
      : [
          "Pipeline com erro — verificar errorMsg acima.",
          "Verificar logs Vercel para stack trace completo.",
        ],
  })
}
