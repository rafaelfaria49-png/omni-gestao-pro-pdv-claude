import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import {
  addMessage,
  createOrUpdateContact,
  findOrCreateOpenConversation,
  logWebhookPayload,
  webhookDefaultStoreId,
} from "@/lib/whatsapp/whatsapp-service"

const MAX_AUDIT = 4000

type MetaMsg = {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: { caption?: string; mime_type?: string; sha256?: string; id?: string }
  video?: { caption?: string }
  audio?: { mime_type?: string }
  document?: { caption?: string; filename?: string }
  sticker?: { mime_type?: string }
  interactive?: { type?: string; button_reply?: { title?: string; id?: string }; list_reply?: { title?: string; id?: string } }
  button?: { text?: string; payload?: string }
}

function metaBodyFromMessage(m: MetaMsg): { body: string; messageType: string } {
  const t = (m.type ?? "unknown").trim() || "unknown"
  if (t === "text" && m.text?.body) {
    return { body: String(m.text.body), messageType: "text" }
  }
  if (t === "image") {
    const cap = m.image?.caption?.trim()
    return { body: cap || "[Imagem]", messageType: "image" }
  }
  if (t === "video") {
    const cap = m.video?.caption?.trim()
    return { body: cap || "[Vídeo]", messageType: "video" }
  }
  if (t === "audio") {
    return { body: "[Áudio]", messageType: "audio" }
  }
  if (t === "document") {
    const cap = m.document?.caption?.trim()
    const fn = m.document?.filename?.trim()
    return { body: cap || (fn ? `[Documento: ${fn}]` : "[Documento]"), messageType: "document" }
  }
  if (t === "sticker") {
    return { body: "[Figurinha]", messageType: "sticker" }
  }
  if (t === "interactive") {
    const ir = m.interactive?.button_reply ?? m.interactive?.list_reply
    const title = ir?.title?.trim() || ir?.id?.trim()
    return { body: title || "[Interativo]", messageType: "interactive" }
  }
  if (t === "button" && m.button?.text) {
    return { body: String(m.button.text), messageType: "button" }
  }
  return { body: `[${t}]`, messageType: t }
}

function maskId(id: string): string {
  if (!id || id.length < 4) return "***"
  if (id.length <= 7) return `${id.slice(0, 2)}***`
  return `${id.slice(0, 4)}***${id.slice(-3)}`
}

/**
 * Processa payload JSON do webhook Cloud API (após validação opcional de assinatura).
 * Idempotente por `externalMessageId` (wamid).
 */
export async function processMetaWhatsAppWebhookPayload(raw: unknown): Promise<void> {
  const storeId = webhookDefaultStoreId()

  try {
    await logWebhookPayload(storeId, raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.logsAuditoria.create({
      data: {
        action: "whatsapp_meta_webhook_log_fail",
        userLabel: `store:${storeId}`,
        detail: msg.slice(0, MAX_AUDIT),
        source: "webhook",
      },
    })
  }

  if (!raw || typeof raw !== "object") return

  const expectedPn = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
  const entries = (raw as { entry?: unknown[] }).entry
  if (!Array.isArray(entries)) return

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue
    const changes = (entry as { changes?: unknown[] }).changes
    if (!Array.isArray(changes)) continue

    for (const ch of changes) {
      if (!ch || typeof ch !== "object") continue
      const value = (ch as { value?: Record<string, unknown> }).value
      if (!value || typeof value !== "object") continue

      const phoneNumberId = String((value as { metadata?: { phone_number_id?: string } }).metadata?.phone_number_id ?? "").trim()

      if (expectedPn && phoneNumberId && expectedPn !== phoneNumberId) {
        console.warn("[whatsapp-webhook:REAL_SAVE_SKIP]", JSON.stringify({
          reason: "phone_number_id_mismatch",
          expectedMasked: maskId(expectedPn),
          receivedMasked: maskId(phoneNumberId),
          storeId,
          hint: "Verificar WHATSAPP_PHONE_NUMBER_ID na Vercel vs phone_number_id recebido do payload Meta",
        }))
        await prisma.logsAuditoria.create({
          data: {
            action: "whatsapp_meta_webhook_skip_phone_number_id",
            userLabel: `store:${storeId}`,
            detail: `phone_number_id mismatch: esperado=${maskId(expectedPn)} recebido=${maskId(phoneNumberId)}`,
            source: "webhook",
          },
        })
        continue
      }

      if (expectedPn && !phoneNumberId) {
        console.info("[whatsapp-webhook:REAL_SAVE_SKIP]", JSON.stringify({
          reason: "phone_number_id_absent_in_payload",
          expectedMasked: maskId(expectedPn),
          storeId,
          hint: "Payload Meta não trouxe metadata.phone_number_id — processando assim mesmo (fallback seguro)",
        }))
      }

      const contacts = Array.isArray((value as { contacts?: unknown[] }).contacts)
        ? ((value as { contacts: unknown[] }).contacts as Array<{ wa_id?: string; profile?: { name?: string } }>)
        : []

      const messages = Array.isArray((value as { messages?: unknown[] }).messages)
        ? ((value as { messages: unknown[] }).messages as MetaMsg[])
        : []

      for (const msg of messages) {
        const from = String(msg.from ?? "").trim()
        if (!from) {
          console.warn("[whatsapp-webhook:REAL_SAVE_SKIP]", JSON.stringify({
            reason: "empty_from",
            wamid: msg.id ?? null,
            storeId,
          }))
          continue
        }

        const fromMasked = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : "****"
        const wamid = String(msg.id ?? "").trim()

        if (wamid) {
          const dup = await prisma.whatsAppMessage.findFirst({
            where: { storeId, externalMessageId: wamid },
            select: { id: true },
          })
          if (dup) {
            console.info("[whatsapp-webhook:REAL_SAVE_SKIP]", JSON.stringify({
              reason: "duplicate_wamid",
              wamid: wamid.slice(0, 30),
              fromMasked,
              storeId,
            }))
            continue
          }
        }

        const profileName =
          contacts.find((c) => String(c.wa_id ?? "").replace(/\D/g, "") === from.replace(/\D/g, ""))?.profile?.name?.trim() ||
          ""

        const { body, messageType } = metaBodyFromMessage(msg)
        const safeBody = body.trim() || "[Mensagem]"

        const contact = await createOrUpdateContact(storeId, {
          phoneDigits: from,
          displayName: profileName || undefined,
          waExternalId: from,
        })

        const conv = await findOrCreateOpenConversation(storeId, contact.id, from)

        const payload: Prisma.InputJsonValue = {
          meta: { rawType: msg.type, timestamp: msg.timestamp },
        } as Prisma.InputJsonValue

        console.info("[whatsapp-webhook:REAL_SAVE_ATTEMPT]", JSON.stringify({
          fromMasked,
          wamid: wamid ? wamid.slice(0, 30) : null,
          msgType: messageType,
          safeBodyLen: safeBody.length,
          storeId,
          convId: conv.id,
          contactId: contact.id,
        }))

        try {
          const saved = await addMessage(storeId, conv.id, {
            direction: "inbound",
            body: safeBody,
            messageType,
            externalMessageId: wamid,
            payload,
          })
          console.info("[whatsapp-webhook:REAL_SAVE_SUCCESS]", JSON.stringify({
            msgId: saved.id,
            fromMasked,
            wamid: wamid ? wamid.slice(0, 30) : null,
            storeId,
            convId: conv.id,
          }))
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          console.error("[whatsapp-webhook:REAL_SAVE_SKIP]", JSON.stringify({
            reason: "addMessage_failed",
            error: m.slice(0, 200),
            fromMasked,
            storeId,
            convId: conv.id,
          }))
          await prisma.logsAuditoria.create({
            data: {
              action: "whatsapp_meta_inbound_persist_fail",
              userLabel: `wa:${from}`,
              detail: m.slice(0, MAX_AUDIT),
              source: "webhook",
            },
          })
        }
      }
    }
  }
}
