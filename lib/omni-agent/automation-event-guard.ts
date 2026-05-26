import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { requireOpsSubscription } from "@/lib/ops-api-gate"
import type { EventPayload, SystemEvent } from "@/lib/events/event-bus"

export type AutomationHandleEventBody = {
  event?: unknown
  payload?: unknown
}

function deny(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

/** Bloqueia chamadas cross-site óbvias (fetch do próprio dashboard/PDV). */
function assertTrustedCaller(req: NextRequest): NextResponse | null {
  const secFetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase()
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site") {
    return deny("Origem não permitida para automação interna.", 403)
  }

  const origin = req.headers.get("origin")?.trim()
  if (origin) {
    const host = req.headers.get("host")?.trim()
    if (!host) return deny("Origem inválida.", 403)
    try {
      if (new URL(origin).host !== host) {
        return deny("Origem não permitida para automação interna.", 403)
      }
    } catch {
      return deny("Origem inválida.", 403)
    }
  }

  return null
}

/**
 * Valida POST `/api/automation/handle-event`: sessão ou assinatura ops, loja explícita no header,
 * `payload.storeId` igual ao header (anti cross-tenant).
 */
export async function guardAutomationHandleEventPost(
  req: NextRequest,
  body: AutomationHandleEventBody,
  validEvents: ReadonlySet<SystemEvent>,
): Promise<
  | { ok: true; event: SystemEvent; payload: EventPayload; storeId: string }
  | { ok: false; response: NextResponse }
> {
  const originBlock = assertTrustedCaller(req)
  if (originBlock) return { ok: false, response: originBlock }

  const event = body.event as SystemEvent | undefined
  const payload = body.payload as EventPayload | undefined

  if (!event || !validEvents.has(event)) {
    return { ok: false, response: deny("evento inválido", 400) }
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, response: deny("payload inválido", 400) }
  }

  const payloadStoreId = typeof payload.storeId === "string" ? payload.storeId.trim() : ""
  if (!payloadStoreId) {
    return { ok: false, response: deny("payload.storeId obrigatório", 400) }
  }

  const headerStoreId = storeIdFromAssistecRequestForWrite(req)
  if (!headerStoreId) {
    return {
      ok: false,
      response: deny(
        `Unidade obrigatória: envie o header ${ASSISTEC_LOJA_HEADER} igual a payload.storeId.`,
        400,
      ),
    }
  }

  if (headerStoreId !== payloadStoreId) {
    return {
      ok: false,
      response: deny("storeId do header não corresponde ao payload (cross-tenant bloqueado).", 403),
    }
  }

  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(
      headerStoreId,
      (p) => p.hubs.vendas || p.workspace.omniAgent,
      "Sem permissão para disparar automações nesta unidade.",
    )
    if (!g.ok) return { ok: false, response: deny(g.error, g.status) }
    return { ok: true, event, payload: { ...payload, storeId: headerStoreId }, storeId: headerStoreId }
  }

  const sub = await requireOpsSubscription()
  if (!sub.ok) return { ok: false, response: sub.res }

  return { ok: true, event, payload: { ...payload, storeId: headerStoreId }, storeId: headerStoreId }
}
