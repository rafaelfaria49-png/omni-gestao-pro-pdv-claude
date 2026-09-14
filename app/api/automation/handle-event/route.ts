/**
 * POST /api/automation/handle-event
 *
 * Ponte server-side para eventos disparados pelo PDV no browser.
 * Exige sessão (ou assinatura ops legada), header de loja e correspondência com payload.storeId.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleEvent } from "@/lib/automation/automation-engine"
import type { SystemEvent } from "@/lib/events/event-bus"
import {
  guardAutomationHandleEventPost,
  type AutomationHandleEventBody,
} from "@/lib/omni-agent/automation-event-guard"
import { WHATSAPP_SYSTEM_EVENT_DELIVERY } from "@/lib/whatsapp/automation-delivery"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
    let body: AutomationHandleEventBody
    try {
      body = (await req.json()) as AutomationHandleEventBody
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
    }

    const guarded = await guardAutomationHandleEventPost(req, body, VALID_EVENTS)
    if (!guarded.ok) return guarded.response

    // CORREÇÃO-01: `venda_finalizada` de browser NÃO dispara automação por esta
    // rota. O dispatch definitivo é server-side no ponto create-vs-replay de
    // `venda-persist` (V1/V2) — ancorado nas uniques duráveis, não em POST por
    // aba. Sem este no-op, duas abas/retry/reload (inclusive bundle PWA stale)
    // gerariam N automações reais para a MESMA confirmação. O event-bus local
    // continua valendo como notificação de UI (refresh de listas).
    // Resposta honesta: ok (request válido/autenticado), sem dispatch.
    if (guarded.event === "venda_finalizada") {
      return NextResponse.json({
        ok: true,
        event: guarded.event,
        dispatched: false,
        reason:
          "venda_finalizada é despachada server-side em venda-persist (create-vs-replay); POST de browser ignorado para impedir duplicação entre abas/retry/reload.",
      })
    }

    await handleEvent(guarded.event, guarded.payload)
    return NextResponse.json({
      ok: true,
      event: guarded.event,
      whatsappDelivery: WHATSAPP_SYSTEM_EVENT_DELIVERY.mode,
      sendsMeta: WHATSAPP_SYSTEM_EVENT_DELIVERY.sendsMeta,
      note: WHATSAPP_SYSTEM_EVENT_DELIVERY.description,
    })
  } catch (e) {
    console.error("[api/automation/handle-event]", e)
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 })
  }
}
