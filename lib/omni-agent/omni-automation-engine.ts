import { prisma } from "@/lib/prisma"
import type { EventPayload, SystemEvent } from "@/lib/events/event-bus"
import { interpretOmniAgentCommand } from "@/lib/omni-agent/interpret"
import {
  omniAutomationTriggerKeysForEvent,
  type OmniAgentAutomationTriggerKey,
} from "@/lib/omni-agent/omni-automation-triggers"

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function resolveCommandTemplate(text: string, payload: EventPayload): string {
  const data = safeObj(payload.data)
  const base: Record<string, unknown> = {
    entityId: payload.entityId ?? "",
    ...data,
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const val = base[key]
    if (val === undefined || val === null) return ""
    if (typeof val === "number" && (key === "total" || key === "totalFinal" || key === "valor" || key === "valorTotal")) {
      return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    }
    if (typeof val === "object") return JSON.stringify(val).slice(0, 400)
    return String(val)
  })
}

const DEFAULT_AUTOMATIONS: {
  triggerKey: OmniAgentAutomationTriggerKey
  name: string
  commandTemplate: string
}[] = [
  {
    triggerKey: "venda_finalizada",
    name: "Triagem — venda finalizada",
    commandTemplate:
      "[Automação Omni] Venda finalizada (venda id {{entityId}}). Revisar conciliação e próximos passos operacionais.",
  },
  {
    triggerKey: "os_entregue",
    name: "Triagem — OS entregue",
    commandTemplate:
      "[Automação Omni] OS entregue (id {{entityId}}, status {{status}}). Acompanhar satisfação e contas a receber se aplicável.",
  },
  {
    triggerKey: "conta_receber_vencida",
    name: "Alerta — conta a receber vencida",
    commandTemplate:
      "[Automação Omni] Conta a receber vencida (título id {{entityId}}). Rever cobrança e contato com o cliente.",
  },
]

/**
 * Garante regras padrão (desativadas) para a loja — idempotente.
 */
export async function ensureDefaultOmniAgentAutomations(storeId: string): Promise<void> {
  const sid = storeId.trim()
  if (!sid) return

  const n = await prisma.omniAgentAutomation.count({ where: { storeId: sid } })
  if (n > 0) return

  await prisma.omniAgentAutomation.createMany({
    data: DEFAULT_AUTOMATIONS.map((d) => ({
      storeId: sid,
      name: d.name,
      triggerKey: d.triggerKey,
      enabled: false,
      commandTemplate: d.commandTemplate,
      priority: 0,
    })),
  })
}

async function logOmniAutomation(params: {
  storeId: string
  level: "info" | "warn" | "error"
  action: string
  message: string
  metadata?: Record<string, unknown>
}) {
  try {
    await prisma.logsAuditoria.create({
      data: {
        action: params.action,
        userLabel: "Omni Agent — automações",
        detail: params.message.slice(0, 4000),
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
        source: "omni_agent_automation",
      },
    })
  } catch {
    /* ignore */
  }
}

/**
 * Dispara automações Omni Agent: cria `OmniAgentCommand` em **PENDENTE** (Inbox), sem execução automática.
 */
export async function handleOmniAgentSystemEvents(event: SystemEvent, payload: EventPayload): Promise<void> {
  const storeId = (payload.storeId || "").trim()
  if (!storeId) return

  await ensureDefaultOmniAgentAutomations(storeId)

  const keys = omniAutomationTriggerKeysForEvent(event, payload)
  if (keys.length === 0) return

  const autos = await prisma.omniAgentAutomation.findMany({
    where: {
      storeId,
      enabled: true,
      triggerKey: { in: keys },
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  })

  for (const a of autos) {
    const texto = resolveCommandTemplate(a.commandTemplate, payload).trim()
    if (!texto) {
      await logOmniAutomation({
        storeId,
        level: "warn",
        action: "OMNI_AUTOMATION_EMPTY_TEMPLATE",
        message: `Automação "${a.name}" (${a.id}) gerou texto vazio.`,
        metadata: { event, automationId: a.id } as Record<string, unknown>,
      })
      continue
    }

    const interp = interpretOmniAgentCommand(texto)
    const interpretacao = {
      ...interp,
      source: "omni_agent_automation",
      sourceAutomationId: a.id,
      sourceEvent: event,
      sourceEntityId: payload.entityId ?? null,
    }

    try {
      const cmd = await prisma.omniAgentCommand.create({
        data: {
          storeId,
          canal: "texto_interno",
          comandoOriginal: texto,
          interpretacao: interpretacao as object,
          status: "PENDENTE",
        },
      })

      await prisma.omniAgentAutomationRun.create({
        data: {
          automationId: a.id,
          storeId,
          eventKey: event,
          entityId: payload.entityId ?? null,
          comandoGerado: texto,
          commandId: cmd.id,
        },
      })

      await logOmniAutomation({
        storeId,
        level: "info",
        action: "OMNI_AUTOMATION_INBOX",
        message: `Automação "${a.name}" criou comando ${cmd.id} (PENDENTE).`,
        metadata: { event, automationId: a.id, commandId: cmd.id } as Record<string, unknown>,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await logOmniAutomation({
        storeId,
        level: "error",
        action: "OMNI_AUTOMATION_ERROR",
        message: `Falha na automação "${a.name}": ${msg}`,
        metadata: { event, automationId: a.id } as Record<string, unknown>,
      })
    }
  }
}
