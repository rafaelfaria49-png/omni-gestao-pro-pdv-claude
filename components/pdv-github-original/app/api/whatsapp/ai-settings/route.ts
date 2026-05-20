import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { ensureHubSeed } from "@/lib/whatsapp/whatsapp-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function GET(req: Request) {
  try {
    const storeId = storeIdFromAssistecRequestForRead(req)
    await ensureHubSeed(storeId)

    let row = await prisma.whatsAppAiSetting.findUnique({ where: { storeId } })
    if (!row) {
      row = await prisma.whatsAppAiSetting.create({
        data: {
          storeId,
          tone: "consultivo",
          systemPrompt:
            "Você é o assistente da loja no WhatsApp: cordial, objetivo e focado em conversão sem pressão.",
          suggestionsEnabled: true,
          maxContextMessages: 12,
        },
      })
    }
    return json({ ok: true, aiSettings: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória: header x-assistec-loja-id ou query storeId.")

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("JSON inválido")
    }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    await prisma.whatsAppAiSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        tone: typeof o.tone === "string" ? o.tone.trim() || "consultivo" : "consultivo",
        systemPrompt:
          typeof o.systemPrompt === "string"
            ? o.systemPrompt
            : "Você é o assistente da loja no WhatsApp.",
        suggestionsEnabled: typeof o.suggestionsEnabled === "boolean" ? o.suggestionsEnabled : true,
        maxContextMessages:
          typeof o.maxContextMessages === "number" && Number.isFinite(o.maxContextMessages)
            ? Math.min(50, Math.max(4, Math.floor(o.maxContextMessages)))
            : 12,
        metadata:
          o.metadata !== undefined && typeof o.metadata === "object" && o.metadata !== null
            ? (o.metadata as object)
            : undefined,
      },
      update: {
        ...(typeof o.tone === "string" ? { tone: o.tone.trim() } : {}),
        ...(typeof o.systemPrompt === "string" ? { systemPrompt: o.systemPrompt } : {}),
        ...(typeof o.suggestionsEnabled === "boolean" ? { suggestionsEnabled: o.suggestionsEnabled } : {}),
        ...(typeof o.maxContextMessages === "number" && Number.isFinite(o.maxContextMessages)
          ? { maxContextMessages: Math.min(50, Math.max(4, Math.floor(o.maxContextMessages))) }
          : {}),
        ...(o.metadata !== undefined && typeof o.metadata === "object" && o.metadata !== null
          ? { metadata: o.metadata as object }
          : {}),
      },
    })

    const aiSettings = await prisma.whatsAppAiSetting.findUnique({ where: { storeId } })
    return json({ ok: true, aiSettings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
