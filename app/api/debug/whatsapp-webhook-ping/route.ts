/**
 * Simulador de payload Meta WhatsApp — rota de diagnóstico.
 *
 * Gera um payload idêntico ao que a Meta enviaria e o injeta diretamente
 * no pipeline real (verifica assinatura opcional, salva contato/conversa/mensagem).
 *
 * GET /api/debug/whatsapp-webhook-ping?secret=<ASSISTEC_MASTER_PASSWORD>
 *   → Retorna diagnóstico de configuração sem enviar ao banco
 *
 * POST /api/debug/whatsapp-webhook-ping?secret=<ASSISTEC_MASTER_PASSWORD>
 *   Body: { "from": "5514998568812", "text": "Mensagem de teste" }  (opcionais)
 *   → Injeta payload fake e reporta o que aconteceu
 */

import { NextResponse } from "next/server"
import { createHmac } from "crypto"
import { processMetaWhatsAppWebhookPayload } from "@/lib/whatsapp-meta-cloud-webhook"
import { prisma } from "@/lib/prisma"
import { resolveSoleActiveStoreId } from "@/lib/whatsapp/whatsapp-service"

export const runtime  = "nodejs"
export const dynamic  = "force-dynamic"
export const revalidate = 0

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const provided = (url.searchParams.get("secret") ?? "").trim()
  if (!provided) return false
  const master = (process.env.ASSISTEC_MASTER_PASSWORD ?? "").trim()
  const debug  = (process.env.ASSISTEC_DEBUG_SECRET ?? "").trim()
  return !!(master && provided === master) || !!(debug && provided === debug)
}

function buildMetaPayload(from: string, text: string, phoneNumberId: string): unknown {
  const wamid = `wamid.PING${Date.now()}`
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_PING_TEST",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "TEST",
            phone_number_id: phoneNumberId,
          },
          contacts: [{
            profile: { name: "Ping Test Contact" },
            wa_id: from,
          }],
          messages: [{
            from,
            id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: text },
            type: "text",
          }],
        },
        field: "messages",
      }],
    }],
  }
}

function buildHmacSignature(payload: unknown, appSecret: string): string {
  const raw = JSON.stringify(payload)
  return `sha256=${createHmac("sha256", appSecret).update(raw, "utf8").digest("hex")}`
}

// ── GET: diagnóstico sem escrita ──────────────────────────────────────────────

export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
  const appSecret     = (process.env.WHATSAPP_APP_SECRET ?? "").trim()
  const verifyToken   = (
    process.env.WHATSAPP_VERIFY_TOKEN ??
    process.env.META_WHATSAPP_VERIFY_TOKEN ??
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? ""
  ).trim()
  const storeId = (await resolveSoleActiveStoreId()) || ""

  // Probe DB: conta conversas existentes
  let convCount = 0
  let dbOk = true
  let dbError: string | null = null
  try {
    const c = await prisma.whatsAppConversation.findFirst({ where: { storeId }, select: { id: true } })
    convCount = c ? 1 : 0
    dbOk = true
  } catch (e) {
    dbOk = false
    dbError = e instanceof Error ? e.message.slice(0, 200) : String(e)
  }

  // Probe: verificar se há logs de assinatura inválida recentes
  let recentBadSigCount = 0
  try {
    const recent = await prisma.logsAuditoria.findFirst({
      where: { action: "whatsapp_meta_webhook_bad_signature" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, detail: true },
    })
    recentBadSigCount = recent ? 1 : 0
  } catch { /* ignore */ }

  const samplePayload = buildMetaPayload("5511999990000", "ping", phoneNumberId || "PHONE_ID")
  const sampleSig = appSecret ? buildHmacSignature(samplePayload, appSecret) : "(sem APP_SECRET)"

  return NextResponse.json({
    ok: true,
    config: {
      hasPhoneNumberId:  !!phoneNumberId,
      phoneNumberId:     phoneNumberId ? `${phoneNumberId.slice(0, 4)}***${phoneNumberId.slice(-3)}` : null,
      hasAppSecret:      !!appSecret,
      hasVerifyToken:    !!verifyToken,
      storeId,
    },
    db: {
      ok: dbOk,
      hasConversations: convCount > 0,
      error: dbError,
    },
    warnings: {
      recentBadSignatureLog: recentBadSigCount > 0
        ? "Há logs de assinatura inválida! Verificar WHATSAPP_APP_SECRET vs App Secret no Meta."
        : null,
    },
    webhookUrls: {
      primary:   "https://omni-gestao-pro.vercel.app/api/webhooks/whatsapp",
      secondary: "https://omni-gestao-pro.vercel.app/api/whatsapp/webhook",
    },
    sampleSignature: sampleSig.slice(0, 30) + "...",
    nextStep: "POST /api/debug/whatsapp-webhook-ping?secret=... com body { from, text }",
  })
}

// ── POST: injetar payload fake no pipeline real ───────────────────────────────

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const o = (body ?? {}) as Record<string, unknown>
  const from = String(o.from ?? "5511999990000").replace(/\D/g, "").trim() || "5511999990000"
  const text = String(o.text ?? "Ping OmniGestão — teste webhook pipeline").trim()

  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "TEST_PHONE_ID").trim()
  const storeId = (await resolveSoleActiveStoreId()) || ""

  const payload = buildMetaPayload(from, text, phoneNumberId)

  console.log("[whatsapp-webhook-ping:POST] injetando payload fake", JSON.stringify({
    from: `${from.slice(0, 4)}****${from.slice(-4)}`,
    text: text.slice(0, 60),
    storeId,
  }))

  const startMs = Date.now()
  let success = false
  let errorMsg: string | null = null
  let convIdAfter: string | null = null
  let msgIdAfter: string | null = null

  try {
    await processMetaWhatsAppWebhookPayload(payload)
    success = true

    // Verificar o que foi criado no banco
    const { PrismaClient } = await import("@/generated/prisma")
    const fromDigits = from.replace(/\D/g, "")

    const contact = await prisma.whatsAppContact.findFirst({
      where: { storeId, phoneDigits: fromDigits },
      select: { id: true },
    })
    if (contact) {
      const conv = await prisma.whatsAppConversation.findFirst({
        where: { storeId, contactId: contact.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      convIdAfter = conv?.id ?? null
      if (conv) {
        const msg = await prisma.whatsAppMessage.findFirst({
          where: { conversationId: conv.id, body: text },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
        msgIdAfter = msg?.id ?? null
      }
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message.slice(0, 400) : String(e)
    console.error("[whatsapp-webhook-ping:POST] error:", errorMsg)
  }

  const elapsed = Date.now() - startMs

  return NextResponse.json({
    ok: success,
    ping: {
      from: `${from.slice(0, 4)}****${from.slice(-4)}`,
      text: text.slice(0, 80),
      storeId,
      elapsed_ms: elapsed,
    },
    pipeline: {
      processMetaWebhookPayload: success ? "OK" : "ERROR",
      errorMsg,
    },
    persisted: {
      conversationId: convIdAfter,
      messageId:      msgIdAfter,
      savedToDb:      !!(convIdAfter && msgIdAfter),
    },
    nextStep: success
      ? "Pipeline funcionando! Verificar se a Meta está realmente chamando o webhook URL."
      : "Pipeline com erro — verificar logs Vercel para detalhe.",
  })
}
