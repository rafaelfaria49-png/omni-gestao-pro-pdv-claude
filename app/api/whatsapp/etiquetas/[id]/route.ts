import { NextResponse } from "next/server"
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
    if (!storeId) return badRequest("Unidade obrigatória.")

    const { id } = await ctx.params
    let body: unknown
    try { body = await req.json() } catch { return badRequest("JSON inválido") }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const data: { nome?: string; cor?: string; ativo?: boolean } = {}
    if (typeof o.nome === "string" && o.nome.trim()) data.nome = o.nome.trim()
    if (typeof o.cor === "string" && o.cor.trim()) data.cor = o.cor.trim()
    if (typeof o.ativo === "boolean") data.ativo = o.ativo

    if (Object.keys(data).length === 0) {
      const row = await prisma.whatsAppEtiqueta.findFirst({ where: { id, storeId } })
      if (!row) return json({ error: "Etiqueta não encontrada." }, { status: 404 })
      return json({ ok: true, etiqueta: row })
    }

    const count = await prisma.whatsAppEtiqueta.updateMany({ where: { id, storeId }, data })
    if (count.count === 0) return json({ error: "Etiqueta não encontrada." }, { status: 404 })

    const row = await prisma.whatsAppEtiqueta.findFirst({ where: { id, storeId } })
    return json({ ok: true, etiqueta: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unique constraint/i.test(msg)) {
      return json({ error: "Já existe etiqueta com esse nome." }, { status: 409 })
    }
    return json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) return badRequest("Unidade obrigatória.")

    const { id } = await ctx.params
    const count = await prisma.whatsAppEtiqueta.deleteMany({ where: { id, storeId } })
    if (count.count === 0) return json({ error: "Etiqueta não encontrada." }, { status: 404 })
    return json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
