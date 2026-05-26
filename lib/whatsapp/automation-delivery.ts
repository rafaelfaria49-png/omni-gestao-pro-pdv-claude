/** Automações system_event gravam histórico interno — não disparam Meta Cloud API. */
export const WHATSAPP_SYSTEM_EVENT_DELIVERY = {
  mode: "internal_record_only" as const,
  sendsMeta: false,
  label: "Registro interno (sem envio Meta)",
  description:
    "Mensagem registrada no histórico WhatsApp da loja para auditoria. Não é entregue ao cliente via Meta.",
} as const

export const WHATSAPP_KEYWORD_AUTOMATION_DELIVERY = {
  mode: "simulation_only" as const,
  sendsMeta: false,
  label: "Simulação (sem envio Meta)",
  description:
    "Avalia palavras-chave e registra log. Resposta automática inbound ainda não envia via Meta.",
} as const

export function whatsAppAutomationDeliveryMeta(triggerType: string): {
  deliveryMode: string
  sendsMeta: boolean
  deliveryLabel: string
  deliveryDescription: string
} {
  if (triggerType === "system_event") {
    return {
      deliveryMode: WHATSAPP_SYSTEM_EVENT_DELIVERY.mode,
      sendsMeta: WHATSAPP_SYSTEM_EVENT_DELIVERY.sendsMeta,
      deliveryLabel: WHATSAPP_SYSTEM_EVENT_DELIVERY.label,
      deliveryDescription: WHATSAPP_SYSTEM_EVENT_DELIVERY.description,
    }
  }
  if (triggerType === "keyword") {
    return {
      deliveryMode: WHATSAPP_KEYWORD_AUTOMATION_DELIVERY.mode,
      sendsMeta: WHATSAPP_KEYWORD_AUTOMATION_DELIVERY.sendsMeta,
      deliveryLabel: WHATSAPP_KEYWORD_AUTOMATION_DELIVERY.label,
      deliveryDescription: WHATSAPP_KEYWORD_AUTOMATION_DELIVERY.description,
    }
  }
  return {
    deliveryMode: "unknown",
    sendsMeta: false,
    deliveryLabel: "Sem envio Meta garantido",
    deliveryDescription: "Comportamento de entrega não definido para este tipo de gatilho.",
  }
}

export function enrichWhatsAppAutomationRow<T extends { triggerType: string }>(
  row: T
): T & ReturnType<typeof whatsAppAutomationDeliveryMeta> {
  return { ...row, ...whatsAppAutomationDeliveryMeta(row.triggerType) }
}
