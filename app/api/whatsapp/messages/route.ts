import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  addMessage,
  generateAiSuggestion,
  runAutomationSimulation,
} from "@/lib/whatsapp/whatsapp-service"
import type { Prisma } from "@/generated/prisma"

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
    const url = new URL(req.url)
    const conversationId = (url.searchParams.get("conversationId") ?? "").trim()
    if (!conversationId) return badRequest("conversationId obrigatório na query.")

    console.info("[whatsapp/messages:GET] storeId=%s conversationId=%s", storeId, conversationId)

    const take = Math.min(200, Math.max(10, Number(url.searchParams.get("take") ?? "80") || 80))

    const rows = await prisma.whatsAppMessage.findMany({
      where: { storeId, conversationId },
      orderBy: { createdAt: "asc" },
      take,
    })
    console.info("[whatsapp/messages:GET] storeId=%s conversationId=%s rows=%d", storeId, conversationId, rows.length)
    return json({ ok: true, messages: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
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

    const mode = typeof o.mode === "string" ? o.mode : "append"

    if (mode === "simulate_automation") {
      const text = typeof o.incomingText === "string" ? o.incomingText : ""
      const automationId =
        typeof o.automationId === "string" && o.automationId.trim() ? o.automationId.trim() : undefined
      const sim = await runAutomationSimulation(storeId, automationId, text || "(vazio)")
      return json({ ok: true, simulation: sim })
    }

    const conversationId = typeof o.conversationId === "string" ? o.conversationId.trim() : ""
    if (!conversationId) return badRequest("conversationId obrigatório.")

    if (mode === "ai_suggestion") {
      const force = o.force === true
      const result = await generateAiSuggestion(storeId, conversationId, { force })
      return json({
        ok: true,
        suggestion: result.suggestion,
        source: result.source,
        cached: result.cached,
        reason: result.reason,
      })
    }

    const direction = o.direction === "outbound" ? "outbound" : "inbound"
    const msgBody = typeof o.body === "string" ? o.body : ""
    const messageType = typeof o.messageType === "string" ? o.messageType : undefined
    const externalMessageId = typeof o.externalMessageId === "string" ? o.externalMessageId : undefined
    let payload: Prisma.InputJsonValue | undefined
    if (o.payload !== undefined && o.payload !== null && typeof o.payload === "object") {
      payload = o.payload as Prisma.InputJsonValue
    }

    const msg = await addMessage(storeId, conversationId, {
      direction,
      body: msgBody,
      messageType,
      externalMessageId,
      payload,
    })
    return json({ ok: true, message: msg })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
