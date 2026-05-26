import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"
import { createOrUpdateContact } from "@/lib/whatsapp/whatsapp-service"

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
    const url = new URL(req.url)
    const qRaw = (url.searchParams.get("q") ?? "").trim()
    const qLower = qRaw.toLowerCase()
    const qDigits = qRaw.replace(/\D/g, "")

    const orFilter =
      qRaw.length > 0
        ? [
            ...(qDigits.length > 0 ? [{ phoneDigits: { contains: qDigits } }] : []),
            { displayName: { contains: qLower, mode: "insensitive" as const } },
          ]
        : []

    const rows = await prisma.whatsAppContact.findMany({
      where: {
        storeId,
        ...(orFilter.length > 0 ? { OR: orFilter } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })
    return json({ ok: true, contacts: rows })
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
    const phoneDigits = typeof o.phoneDigits === "string" ? o.phoneDigits : ""
    const displayName = typeof o.displayName === "string" ? o.displayName : undefined
    const waExternalId = typeof o.waExternalId === "string" ? o.waExternalId : undefined
    const profilePicUrl = typeof o.profilePicUrl === "string" ? o.profilePicUrl : undefined

    const row = await createOrUpdateContact(storeId, {
      phoneDigits,
      displayName,
      waExternalId,
      profilePicUrl,
    })
    return json({ ok: true, contact: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
