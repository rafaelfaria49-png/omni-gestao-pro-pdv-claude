import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"
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
    const guard = await guardWhatsAppApiRead(req)
    if (!guard.ok) return guard.response
    const storeId = guard.storeId
    await ensureHubSeed(storeId)

    const rows = await prisma.whatsAppQuickReply.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: "asc" }, { shortcut: "asc" }],
    })
    return json({ ok: true, quickReplies: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const guard = await guardWhatsAppApiWrite(req)
    if (!guard.ok) return guard.response
    const storeId = guard.storeId

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("JSON inválido")
    }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const shortcut = typeof o.shortcut === "string" ? o.shortcut.trim() : ""
    const title = typeof o.title === "string" ? o.title.trim() : ""
    const bodyText = typeof o.body === "string" ? o.body : ""
    if (!shortcut) return badRequest("shortcut obrigatório.")
    if (!title) return badRequest("title obrigatório.")
    if (!bodyText.trim()) return badRequest("body obrigatório.")

    const category = typeof o.category === "string" ? o.category.trim() : ""
    const sortOrder =
      typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? Math.floor(o.sortOrder) : 0

    const row = await prisma.whatsAppQuickReply.create({
      data: {
        storeId,
        shortcut,
        title,
        body: bodyText,
        category,
        sortOrder,
      },
    })
    return json({ ok: true, quickReply: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unique constraint/i.test(msg)) {
      return json({ error: "Já existe resposta rápida com esse atalho nesta loja." }, { status: 409 })
    }
    return json({ error: msg }, { status: 400 })
  }
}
