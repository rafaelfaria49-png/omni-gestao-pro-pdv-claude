"use client"

import { AlertTriangle, ScrollText, Webhook, Workflow } from "lucide-react"
import { ComingSoonScreen } from "./whatsapp-preview-ui"

export function WhatsAppLogsPanel() {
  return (
    <ComingSoonScreen
      icon={ScrollText}
      title="Logs"
      badge="preview"
      description="Registro técnico de eventos, webhooks e execuções de automação para auditoria e depuração."
      features={[
        {
          icon: Webhook,
          title: "Eventos de webhook",
          description: "Recebimentos e confirmações da Meta.",
          tag: "stream",
        },
        {
          icon: Workflow,
          title: "Execuções",
          description: "Cada automação disparada e seu resultado.",
          tag: "timeline",
        },
        {
          icon: AlertTriangle,
          title: "Erros recentes",
          description: "Falhas para investigar e reprocessar.",
          tag: "3 erros (exemplo)",
        },
      ]}
      footnote="Protótipo visual · sem efeito real. Esta seção é uma prévia e será construída na fase de desenvolvimento."
    />
  )
}
