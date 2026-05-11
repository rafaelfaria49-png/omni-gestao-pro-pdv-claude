/**
 * Camada pública de envio de mensagens WhatsApp.
 *
 * Expõe funções simples para uso em Server Actions, API routes e automações,
 * sem expor a complexidade interna do whatsapp-service.
 */

import {
  sendCloudApiTextAndRecord,
  sendCloudApiMediaAndRecord,
  sendCloudApiTemplateAndRecord,
} from "@/lib/whatsapp/whatsapp-service"
import type { TemplateComponent } from "@/lib/whatsapp"

export type SendTextOptions = {
  storeId: string
  conversationId: string
  text: string
}

export type SendMediaOptions = {
  storeId: string
  conversationId: string
  mediaType: "image" | "document" | "audio" | "video"
  link: string
  caption?: string
  filename?: string
}

export type SendTemplateOptions = {
  storeId: string
  conversationId: string
  templateName: string
  languageCode?: string
  components?: TemplateComponent[]
}

/**
 * Envia uma mensagem de texto via WhatsApp Cloud API e salva no banco.
 *
 * @returns `{ messageId, wamid }` — wamid é o ID retornado pela Meta (vazio se falhar).
 */
export async function sendWhatsAppTextMessage(options: SendTextOptions) {
  return sendCloudApiTextAndRecord(options.storeId, options.conversationId, options.text)
}

/**
 * Envia uma mensagem de mídia (imagem, documento, áudio, vídeo) e salva no banco.
 */
export async function sendWhatsAppMediaMessage(options: SendMediaOptions) {
  return sendCloudApiMediaAndRecord(options.storeId, options.conversationId, {
    mediaType: options.mediaType,
    link: options.link,
    caption: options.caption,
    filename: options.filename,
  })
}

/**
 * Envia uma mensagem de template HSM e salva no banco.
 */
export async function sendWhatsAppTemplateMessage(options: SendTemplateOptions) {
  return sendCloudApiTemplateAndRecord(options.storeId, options.conversationId, {
    templateName: options.templateName,
    languageCode: options.languageCode ?? "pt_BR",
    components: options.components,
  })
}
