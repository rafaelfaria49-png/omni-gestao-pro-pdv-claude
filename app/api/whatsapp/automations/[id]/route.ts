import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"
import { enrichWhatsAppAutomationRow } from "@/lib/whatsapp/automation-delivery"
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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardWhatsAppApiWrite(req)
    if (!guard.ok) return guard.response
    const storeId = guard.storeId

    const { id } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest("JSON inválido")
    }
    if (!body || typeof body !== "object") return badRequest("Body inválido")
    const o = body as Record<string, unknown>

    const data: Prisma.WhatsAppAutomationUpdateInput = {}

    if (typeof o.name === "string") data.name = o.name.trim()
    if (typeof o.triggerType === "string") data.triggerType = o.triggerType.trim()
    if (typeof o.enabled === "boolean") data.enabled = o.enabled
    if (typeof o.priority === "number" && Number.isFinite(o.priority)) data.priority = Math.floor(o.priority)
    if (o.conditions !== undefined && typeof o.conditions === "object" && o.conditions !== null) {
      data.conditions = o.conditions as Prisma.InputJsonValue
    }
    if (o.actions !== undefined && typeof o.actions === "object" && o.actions !== null) {
      data.actions = o.actions as Prisma.InputJsonValue
    }

    if (Object.keys(data).length === 0) {
      const automation = await prisma.whatsAppAutomation.findFirst({ where: { id, storeId } })
      if (!automation) return json({ error: "Automação não encontrada" }, { status: 404 })
      return json({ ok: true, automation: enrichWhatsAppAutomationRow(automation) })
    }

    const row = await prisma.whatsAppAutomation.updateMany({
      where: { id, storeId },
      data,
    })
    if (row.count === 0) return json({ error: "Automação não encontrada" }, { status: 404 })

    const automation = await prisma.whatsAppAutomation.findFirst({ where: { id, storeId } })
    return json({ ok: true, automation: automation ? enrichWhatsAppAutomationRow(automation) : null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, { status: 400 })
  }
}
