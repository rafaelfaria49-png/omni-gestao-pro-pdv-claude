import type { EventPayload, SystemEvent } from "@/lib/events/event-bus"

/** Chaves persistidas em `OmniAgentAutomation.triggerKey`. */
export const OMNI_AGENT_AUTOMATION_TRIGGERS = [
  "venda_finalizada",
  "os_entregue",
  "conta_receber_vencida",
] as const

export type OmniAgentAutomationTriggerKey = (typeof OMNI_AGENT_AUTOMATION_TRIGGERS)[number]

export function isOmniAgentAutomationTriggerKey(v: string): v is OmniAgentAutomationTriggerKey {
  return (OMNI_AGENT_AUTOMATION_TRIGGERS as readonly string[]).includes(v)
}

export const OMNI_AGENT_TRIGGER_LABELS: Record<OmniAgentAutomationTriggerKey, string> = {
  venda_finalizada: "Venda finalizada",
  os_entregue: "OS entregue (evento os_finalizada)",
  conta_receber_vencida: "Conta a receber vencida",
}

/**
 * Mapeia evento de domínio → chaves de automação Omni Agent que podem disparar.
 * Mantido separado do WhatsAppAutomation (outro modelo).
 */
export function omniAutomationTriggerKeysForEvent(event: SystemEvent, _payload: EventPayload): OmniAgentAutomationTriggerKey[] {
  switch (event) {
    case "venda_finalizada":
      return ["venda_finalizada"]
    case "os_finalizada":
      return ["os_entregue"]
    case "conta_receber_vencida":
      return ["conta_receber_vencida"]
    default:
      return []
  }
}
