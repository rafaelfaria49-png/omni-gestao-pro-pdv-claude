import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"
import { enrichWhatsAppAutomationRow, WHATSAPP_SYSTEM_EVENT_DELIVERY } from "@/lib/whatsapp/automation-delivery"
import { ensureHubSeed } from "@/lib/whatsapp/whatsapp-service"
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
    const guard = await guardWhatsAppApiRead(req)
    if (!guard.ok) return guard.response
    const storeId = guard.storeId
    await ensureHubSeed(storeId)

    const rows = await prisma.whatsAppAutomation.findMany({
      where: { storeId },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    })
    return json({
      ok: true,
      automations: rows.map(enrichWhatsAppAutomationRow),
      systemEventDeliveryNote: WHATSAPP_SYSTEM_EVENT_DELIVERY.description,
    })
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

    const name = typeof o.name === "string" ? o.name.trim() : ""
    if (!name) return badRequest("name obrigatório.")

    const triggerType = typeof o.triggerType === "string" ? o.triggerType.trim() || "keyword" : "keyword"
    const enabled = typeof o.enabled === "boolean" ? o.enabled : true
    const priority =
      typeof o.priority === "number" && Number.isFinite(o.priority) ? Math.floor(o.priority) : 0

    let conditions: Prisma.InputJsonValue | undefined
    let actions: Prisma.InputJsonValue | undefined
    if (o.conditions !== undefined && typeof o.conditions === "object" && o.conditions !== null) {
      conditions = o.conditions as Prisma.InputJsonValue
    }
    if (o.actions !== undefined && typeof o.actions === "object" && o.actions !== null) {
      actions = o.actions as Prisma.InputJsonValue
    }

    const row = await prisma.whatsAppAutomation.create({
      data: {
        storeId,
        name,
        triggerType,
        enabled,
        priority,
        conditions,
        actions,
      },
    })
    return json({ ok: true, automation: enrichWhatsAppAutomationRow(row) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
