"use server"

import { auth } from "@/auth"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  sendCloudApiMediaAndRecord,
  sendCloudApiTemplateAndRecord,
  sendCloudApiTextAndRecord,
} from "@/lib/whatsapp/whatsapp-service"
import type { TemplateComponent } from "@/lib/whatsapp"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"

type SendTextInput = {
  storeId: string
  conversationId: string
  text: string
}

/** Server Action: envia texto via Cloud API e grava outbound (requer sessão). */
export async function sendWhatsAppTextAction(input: SendTextInput) {
  const session = await auth()
  if (!session?.user) return { ok: false as const, error: "Não autenticado" }

  const storeId = (input.storeId ?? "").trim()
  if (!storeId) return { ok: false as const, error: "storeId obrigatório" }
  if (!canAccessStore(session, storeId)) return { ok: false as const, error: "Sem acesso à loja" }

  try {
    const r = await sendCloudApiTextAndRecord(storeId, input.conversationId, input.text)
    return { ok: true as const, messageId: r.message.id, wamid: r.wamid }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false as const, error: msg }
  }
}

/**
 * Variante para chamadas que já validam loja no mesmo padrão das rotas API
 * (útil se no futuro actions receberem headers via FormData).
 */
export async function sendWhatsAppTextFromRequestContext(
  reqLike: { headers: Headers },
  conversationId: string,
  text: string
) {
  const session = await auth()
  if (!session?.user) return { ok: false as const, error: "Não autenticado" }

  const storeId = storeIdFromAssistecRequestForWrite(reqLike as unknown as Request)
  if (!storeId) return { ok: false as const, error: "Unidade obrigatória" }

  try {
    const r = await sendCloudApiTextAndRecord(storeId, conversationId, text)
    return { ok: true as const, messageId: r.message.id, wamid: r.wamid }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false as const, error: msg }
  }
}

export async function sendWhatsAppTemplateAction(input: {
  storeId: string
  conversationId: string
  templateName: string
  templateLanguage?: string
  templateComponents?: TemplateComponent[]
}) {
  const session = await auth()
  if (!session?.user) return { ok: false as const, error: "Não autenticado" }
  const storeId = (input.storeId ?? "").trim()
  if (!storeId) return { ok: false as const, error: "storeId obrigatório" }
  if (!canAccessStore(session, storeId)) return { ok: false as const, error: "Sem acesso à loja" }
  try {
    const r = await sendCloudApiTemplateAndRecord(storeId, input.conversationId, {
      templateName: input.templateName,
      languageCode: input.templateLanguage ?? "pt_BR",
      components: input.templateComponents,
    })
    return { ok: true as const, messageId: r.message.id, wamid: r.wamid }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false as const, error: msg }
  }
}

export async function sendWhatsAppMediaAction(input: {
  storeId: string
  conversationId: string
  mediaType: "image" | "document" | "audio" | "video"
  mediaLink: string
  caption?: string
  filename?: string
}) {
  const session = await auth()
  if (!session?.user) return { ok: false as const, error: "Não autenticado" }
  const storeId = (input.storeId ?? "").trim()
  if (!storeId) return { ok: false as const, error: "storeId obrigatório" }
  if (!canAccessStore(session, storeId)) return { ok: false as const, error: "Sem acesso à loja" }
  try {
    const r = await sendCloudApiMediaAndRecord(storeId, input.conversationId, {
      mediaType: input.mediaType,
      link: input.mediaLink,
      caption: input.caption,
      filename: input.filename,
    })
    return { ok: true as const, messageId: r.message.id, wamid: r.wamid }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false as const, error: msg }
  }
}
