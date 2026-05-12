import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  createConversation,
  createOrUpdateContact,
  ensureHubSeed,
} from "@/lib/whatsapp/whatsapp-service"

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
    console.info("[whatsapp/conversations:GET] storeId=%s", storeId)
    await ensureHubSeed(storeId)

    const url = new URL(req.url)
    const includeMessages = url.searchParams.get("includeMessages") === "1"
    const limitMsgs = Math.min(80, Math.max(5, Number(url.searchParams.get("messageLimit") ?? "40") || 40))

    const rows = await prisma.whatsAppConversation.findMany({
      where: { storeId },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        contact: true,
        etiquetas: {
          include: { etiqueta: true },
        },
        ...(includeMessages
          ? {
              messages: {
                orderBy: { createdAt: "asc" },
                take: limitMsgs,
              },
            }
          : {}),
      },
    })
    console.info("[whatsapp/conversations:GET] storeId=%s rows=%d", storeId, rows.length)
    return json({ ok: true, conversations: rows })
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

    const contactId = typeof o.contactId === "string" ? o.contactId.trim() : ""
    const phoneDigits = typeof o.phoneDigits === "string" ? o.phoneDigits : ""
    const displayName = typeof o.displayName === "string" ? o.displayName : undefined
    const externalThreadId = typeof o.externalThreadId === "string" ? o.externalThreadId : undefined

    let cid = contactId
    if (!cid && phoneDigits) {
      const c = await createOrUpdateContact(storeId, { phoneDigits, displayName })
      cid = c.id
    }

    if (!cid) return badRequest("Informe contactId ou phoneDigits.")

    const conv = await createConversation(storeId, cid, {
      externalThreadId,
    })
    return json({ ok: true, conversation: conv })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
