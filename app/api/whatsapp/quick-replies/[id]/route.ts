import { NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória: header x-assistec-loja-id ou query storeId.")

    const { id } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("JSON inválido")
    }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const data: Prisma.WhatsAppQuickReplyUpdateInput = {}
    if (typeof o.shortcut === "string") data.shortcut = o.shortcut.trim()
    if (typeof o.title === "string") data.title = o.title.trim()
    if (typeof o.body === "string") data.body = o.body
    if (typeof o.category === "string") data.category = o.category.trim()
    if (typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder)) {
      data.sortOrder = Math.floor(o.sortOrder)
    }
    if (typeof o.ativo === "boolean") data.ativo = o.ativo

    if (Object.keys(data).length === 0) {
      const quickReply = await prisma.whatsAppQuickReply.findFirst({ where: { id, storeId } })
      if (!quickReply) return json({ error: "Resposta rápida não encontrada" }, { status: 404 })
      return json({ ok: true, quickReply })
    }

    const row = await prisma.whatsAppQuickReply.updateMany({
      where: { id, storeId },
      data,
    })
    if (row.count === 0) return json({ error: "Resposta rápida não encontrada" }, { status: 404 })

    const quickReply = await prisma.whatsAppQuickReply.findFirst({ where: { id, storeId } })
    return json({ ok: true, quickReply })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unique constraint/i.test(msg)) {
      return json({ error: "Atalho já em uso nesta loja." }, { status: 409 })
    }
    return json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória: header x-assistec-loja-id ou query storeId.")

    const { id } = await ctx.params
    const row = await prisma.whatsAppQuickReply.deleteMany({ where: { id, storeId } })
    if (row.count === 0) return json({ error: "Resposta rápida não encontrada" }, { status: 404 })
    return json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
