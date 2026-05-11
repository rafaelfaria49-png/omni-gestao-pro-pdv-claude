/**
 * GET /api/debug/whatsapp-latest?secret=<ASSISTEC_MASTER_PASSWORD>
 *
 * Retorna snapshot de diagnóstico de produção para o pipeline WhatsApp.
 * Nunca expõe tokens, segredos ou dados pessoais completos.
 *
 * Campos retornados:
 *   - webhookStoreId         — storeId que o webhook usa (WHATSAPP_WEBHOOK_STORE_ID ou loja-1)
 *   - configuredPhoneNumberId — WHATSAPP_PHONE_NUMBER_ID mascarado (ou null)
 *   - últimas 10 conversas (storeId, status, lastMessageAt, unreadCount, contato mascarado)
 *   - últimas 20 mensagens globais (direction, body truncado, storeId, createdAt)
 *   - últimos 5 skips/erros de webhook na logsAuditoria
 *   - último evento de automação webhook_ingress
 *   - contagem inbound/outbound das últimas 20 mensagens
 */

import { NextResponse } from "next/server"
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

function maskPhone(digits: string): string {
  if (!digits || digits.length < 6) return "****"
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`
}

function maskId(id: string): string {
  if (!id || id.length < 4) return "***"
  if (id.length <= 7) return `${id.slice(0, 2)}***`
  return `${id.slice(0, 4)}***${id.slice(-3)}`
}

export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized — inclua ?secret= na URL" }, { status: 401 })
  }

  const webhookStoreId = webhookDefaultStoreId()
  const rawPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
  const configuredPhoneNumberId = rawPhoneNumberId ? maskId(rawPhoneNumberId) : null

  let conversations: unknown[] = []
  let messages: unknown[] = []
  let recentSkips: unknown[] = []
  let lastWebhookIngress: unknown = null
  let dbError: string | null = null

  try {
    // ── Últimas 10 conversas (qualquer loja — diagnóstico) ────────────────────
    const rawConvs = await prisma.whatsAppConversation.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 10,
      include: { contact: { select: { phoneDigits: true, displayName: true } } },
    })

    conversations = rawConvs.map((c) => ({
      id:              c.id,
      storeId:         c.storeId,
      status:          c.status,
      unreadCount:     c.unreadCount,
      lastMessageAt:   c.lastMessageAt,
      lastMessagePreview: (c.lastMessagePreview ?? "").slice(0, 80) || null,
      createdAt:       c.createdAt,
      contactPhone:    maskPhone(c.contact.phoneDigits),
      contactName:     c.contact.displayName?.slice(0, 30) ?? null,
    }))

    // ── Últimas 20 mensagens globais (qualquer loja) ───────────────────────────
    const rawMsgs = await prisma.whatsAppMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id:                true,
        storeId:           true,
        conversationId:    true,
        direction:         true,
        messageType:       true,
        body:              true,
        externalMessageId: true,
        createdAt:         true,
      },
    })

    messages = rawMsgs.map((m) => ({
      ...m,
      body: (m.body ?? "").slice(0, 100),
    }))

    // ── Últimos 5 eventos de skip/erro no webhook (logsAuditoria) ─────────────
    const skipActions = [
      "whatsapp_meta_webhook_skip_phone_number_id",
      "whatsapp_meta_inbound_persist_fail",
      "whatsapp_meta_webhook_bad_signature",
      "whatsapp_meta_webhook_log_fail",
    ]
    const rawSkips = await prisma.logsAuditoria.findMany({
      where: { action: { in: skipActions } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { action: true, detail: true, userLabel: true, createdAt: true },
    })
    recentSkips = rawSkips

    // ── Último evento webhook_ingress (confirma que payload chegou ao pipeline) ─
    const lastIngress = await prisma.whatsAppAutomationLog.findFirst({
      where: { action: "webhook_ingress" },
      orderBy: { createdAt: "desc" },
      select: { storeId: true, createdAt: true, message: true },
    })
    lastWebhookIngress = lastIngress ?? null
  } catch (e) {
    dbError = e instanceof Error ? e.message.slice(0, 300) : String(e)
  }

  // ── Estatísticas das últimas 20 mensagens ─────────────────────────────────
  const msgs = messages as Array<{ direction: string; createdAt: unknown }>
  const inboundCount  = msgs.filter((m) => m.direction === "inbound").length
  const outboundCount = msgs.filter((m) => m.direction === "outbound").length
  const latestMsgAt   = msgs[0]?.createdAt ?? null

  const convs = conversations as Array<{ lastMessageAt: unknown }>
  const latestConvAt = convs[0]?.lastMessageAt ?? null

  return NextResponse.json({
    ok:                     dbError === null,
    webhookStoreId,
    configuredPhoneNumberId,
    dbError,
    summary: {
      conversationsReturned:  conversations.length,
      messagesReturned:       messages.length,
      inboundCount,
      outboundCount,
      latestConversationAt:   latestConvAt,
      latestMessageAt:        latestMsgAt,
      recentSkipsCount:       recentSkips.length,
    },
    lastWebhookIngress,
    recentSkips,
    conversations,
    messages,
  })
}
