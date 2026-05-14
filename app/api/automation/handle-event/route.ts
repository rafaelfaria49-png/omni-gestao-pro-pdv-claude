/**
 * POST /api/automation/handle-event
 *
 * Ponte server-side para eventos disparados pelo PDV no browser.
 * O Prisma Client roda apenas em Node.js; por isso `initAutomationEngineClient`
 * faz fetch para este endpoint em vez de chamar `handleEvent` diretamente.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleEvent } from "@/lib/automation/automation-engine"
import type { SystemEvent, EventPayload } from "@/lib/events/event-bus"

const VALID_EVENTS = new Set<SystemEvent>([
  "venda_criada",
  "venda_finalizada",
  "os_criada",
  "os_status_alterado",
  "os_finalizada",
  "cliente_criado",
  "conta_receber_vencida",
])

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { event?: unknown; payload?: unknown }

    const event = body.event as SystemEvent | undefined
    const payload = body.payload as EventPayload | undefined

    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: "evento inválido" }, { status: 400 })
    }

    if (!payload || typeof payload !== "object" || typeof payload.storeId !== "string") {
      return NextResponse.json({ ok: false, error: "payload inválido" }, { status: 400 })
    }

    await handleEvent(event, payload)
    return NextResponse.json({ ok: true, event })
  } catch (e) {
    console.error("[api/automation/handle-event]", e)
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 })
  }
}
