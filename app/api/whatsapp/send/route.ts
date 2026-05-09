import { NextResponse } from "next/server"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  sendCloudApiMediaAndRecord,
  sendCloudApiTemplateAndRecord,
  sendCloudApiTextAndRecord,
} from "@/lib/whatsapp/whatsapp-service"
import type { TemplateComponent } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(req: Request) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return json({ ok: false, error: "Unidade obrigatória: header x-assistec-loja-id ou query storeId." }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: "JSON inválido" }, { status: 400 })
    }
    if (!body || typeof body !== "object") return json({ ok: false, error: "Body inválido" }, { status: 400 })
    const o = body as Record<string, unknown>

    const conversationId = typeof o.conversationId === "string" ? o.conversationId.trim() : ""
    if (!conversationId) return json({ ok: false, error: "conversationId obrigatório" }, { status: 400 })

    const templateName = typeof o.templateName === "string" ? o.templateName.trim() : ""
    const languageCode = typeof o.templateLanguage === "string" ? o.templateLanguage.trim() : "pt_BR"
    const mediaType = o.mediaType as "image" | "document" | "audio" | "video" | undefined
    const mediaLink = typeof o.mediaLink === "string" ? o.mediaLink.trim() : ""
    const caption = typeof o.caption === "string" ? o.caption : undefined
    const filename = typeof o.filename === "string" ? o.filename : undefined

    let components: TemplateComponent[] | undefined
    if (Array.isArray(o.templateComponents)) {
      components = o.templateComponents as TemplateComponent[]
    }

    if (templateName) {
      const r = await sendCloudApiTemplateAndRecord(storeId, conversationId, {
        templateName,
        languageCode: languageCode || "pt_BR",
        components,
      })
      return json({ ok: true, messageId: r.message.id, wamid: r.wamid })
    }

    if (mediaType && ["image", "document", "audio", "video"].includes(mediaType) && mediaLink) {
      const r = await sendCloudApiMediaAndRecord(storeId, conversationId, {
        mediaType,
        link: mediaLink,
        caption,
        filename,
      })
      return json({ ok: true, messageId: r.message.id, wamid: r.wamid })
    }

    const text = typeof o.text === "string" ? o.text : ""
    const r = await sendCloudApiTextAndRecord(storeId, conversationId, text)
    return json({ ok: true, messageId: r.message.id, wamid: r.wamid })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: msg }, { status: 400 })
  }
}
