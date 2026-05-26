import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"

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
    const rows = await prisma.whatsAppEtiqueta.findMany({
      where: { storeId },
      orderBy: { nome: "asc" },
    })
    return json({ ok: true, etiquetas: rows })
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
    try { body = await req.json() } catch { return badRequest("JSON inválido") }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const nome = typeof o.nome === "string" ? o.nome.trim() : ""
    if (!nome) return badRequest("nome obrigatório.")

    const cor = typeof o.cor === "string" && o.cor.trim() ? o.cor.trim() : "#10b981"

    const row = await prisma.whatsAppEtiqueta.create({
      data: { storeId, nome, cor },
    })
    return json({ ok: true, etiqueta: row }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unique constraint/i.test(msg)) {
      return json({ error: "Já existe etiqueta com esse nome nesta loja." }, { status: 409 })
    }
    return json({ error: msg }, { status: 400 })
  }
}
