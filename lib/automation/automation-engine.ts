import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import type { EventPayload, SystemEvent } from "@/lib/events/event-bus"
import { subscribeAllEvents } from "@/lib/events/event-bus"
import { handleOmniAgentSystemEvents } from "@/lib/omni-agent/omni-automation-engine"
import { sendWhatsAppMessage, ensureDefaultEventAutomations } from "@/lib/whatsapp/whatsapp-service"

type AutomationConditions = {
  event?: SystemEvent
  status?: string
}

type AutomationActions = {
  replyText?: string
  /** Telefone (só dígitos) para notificações de sistema sem destinatário no payload. */
  targetPhone?: string
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function stringifyShort(v: unknown, max = 600): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v)
    return s.length > max ? `${s.slice(0, max - 1)}…` : s
  } catch {
    return String(v)
  }
}

async function logAutomation(params: {
  storeId: string
  automationId: string | null
  level?: "info" | "warn" | "error"
  action: string
  message: string
  payload?: Prisma.InputJsonValue
}) {
  await prisma.whatsAppAutomationLog.create({
    data: {
      storeId: params.storeId,
      automationId: params.automationId,
      level: params.level ?? "info",
      action: params.action,
      message: params.message,
      payload: params.payload,
    },
  })
}

/**
 * Resolve variáveis de template {{chave}} com valores de payload.data.
 * Valores monetários (total, valor, totalFinal) são formatados como R$ X,XX.
 */
function resolveTemplate(text: string, payload: EventPayload): string {
  const data = safeObj(payload.data)
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = data[key]
    if (val === undefined || val === null) return ""
    if (
      typeof val === "number" &&
      (key === "total" || key === "totalFinal" || key === "valor" || key === "totalPago")
    ) {
      return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    }
    return String(val)
  })
}

function resolvePhoneDigitsFromPayload(payload: EventPayload): string {
  const data = safeObj(payload.data)
  const fromData = typeof data.phoneDigits === "string" ? data.phoneDigits : ""
  const normalized = fromData.replace(/\D/g, "")
  return normalized
}

function resolveContactIdFromPayload(payload: EventPayload): string {
  const data = safeObj(payload.data)
  return typeof data.contactId === "string" ? data.contactId.trim() : ""
}

export async function handleEvent(event: SystemEvent, payload: EventPayload): Promise<void> {
  const storeId = (payload.storeId || "").trim()
  if (!storeId) return

  // Garante que as automações padrão existam, sem depender de WhatsApp externo.
  await ensureDefaultEventAutomations(storeId)

  const autos = await prisma.whatsAppAutomation.findMany({
    where: {
      storeId,
      enabled: true,
      triggerType: "system_event",
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  })

  if (autos.length === 0) return

  for (const a of autos) {
    const cond = (a.conditions ?? {}) as AutomationConditions
    if (cond?.event && cond.event !== event) continue
    if (cond?.status) {
      const data = safeObj(payload.data)
      const next = typeof data.status === "string" ? data.status.trim() : ""
      if (!next || next !== cond.status) continue
    }

    const actions = (a.actions ?? {}) as AutomationActions
    const replyText = actions.replyText?.trim()
    if (!replyText) continue

    // Resolve template variables ({{total}}, {{customerName}}, etc.)
    const renderedText = resolveTemplate(replyText, payload)

    const contactId = resolveContactIdFromPayload(payload)
    const phoneDigits = resolvePhoneDigitsFromPayload(payload)
    const targetPhone = (actions.targetPhone ?? "").replace(/\D/g, "")

    // Para automações system_event, targetPhone configurado no HUB é o destino explícito
    // do gestor e tem prioridade máxima — o payload da venda pode conter o contato demo
    // (5511999990001) que não deve sobrescrever a configuração intencional.
    // Para automações keyword/inbound, a conversa origina-se do payload, então phoneDigits
    // do payload tem prioridade (comportamento anterior).
    const isSystemEvent = a.triggerType === "system_event"
    const effectiveContactId = isSystemEvent && targetPhone ? "" : contactId
    const effectivePhone = isSystemEvent
      ? targetPhone || phoneDigits   // HUB config primeiro, fallback para payload
      : phoneDigits || targetPhone   // conversa inbound primeiro, fallback para config

    if (!effectiveContactId && !effectivePhone) {
      // Automação disparou mas sem destinatário: log visível no hub (não é erro)
      await logAutomation({
        storeId,
        automationId: a.id,
        level: "info",
        action: "automation_fired_no_recipient",
        message: `Automação "${a.name}" disparou via ${event}. Mensagem gerada (sem destinatário): ${renderedText}`,
        payload: { event, entityId: payload.entityId ?? null, renderedText } as Prisma.InputJsonValue,
      })
      continue
    }

    try {
      const res = await sendWhatsAppMessage({
        storeId,
        contactId: effectiveContactId || undefined,
        phoneDigits: effectivePhone || undefined,
        message: renderedText,
        meta: { sourceEvent: event, entityId: payload.entityId ?? null, automationId: a.id },
      })
      await logAutomation({
        storeId,
        automationId: a.id,
        level: "info",
        action: "automation_sent_simulated",
        message: `Automação "${a.name}" gerou mensagem outbound (simulada). Destino: +${effectivePhone || effectiveContactId}`,
        payload: {
          event,
          entityId: payload.entityId ?? null,
          conversationId: res.conversationId,
          messageId: res.messageId,
          recipientPhone: effectivePhone || null,
          usedTargetPhone: isSystemEvent && !!targetPhone,
        } as Prisma.InputJsonValue,
      })
    } catch (e) {
      await logAutomation({
        storeId,
        automationId: a.id,
        level: "error",
        action: "automation_error",
        message: `Falha na automação \"${a.name}\": ${stringifyShort(e instanceof Error ? e.message : e)}`,
        payload: { event, entityId: payload.entityId ?? null } as Prisma.InputJsonValue,
      })
    }
  }

  await handleOmniAgentSystemEvents(event, payload)
}

let clientStarted = false

/**
 * Inicializa o motor no runtime do navegador (PDV, etc.).
 *
 * IMPORTANTE: `handleEvent` usa Prisma (Node.js-only) e NÃO pode rodar no browser.
 * Por isso enviamos um POST para a API route `/api/automation/handle-event` que executa
 * o processamento server-side. Isso garante que eventos de venda_finalizada e outros
 * disparados pelo PDV cheguem ao banco e gerem logs visíveis no WhatsApp HUB.
 */
export function initAutomationEngineClient(): void {
  if (clientStarted) return
  clientStarted = true
  subscribeAllEvents((event, payload) => {
    void fetch("/api/automation/handle-event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
    }).catch((e) => console.error("[automation-engine] fetch failed:", e))
  })
}

