"use client"

import { BarChart2, CalendarClock, Megaphone, Users } from "lucide-react"
import { ComingSoonScreen } from "./whatsapp-preview-ui"

export function WhatsAppCampanhasPanel() {
  return (
    <ComingSoonScreen
      icon={Megaphone}
      title="Campanhas"
      description="Envio de campanhas em massa apenas para contatos com opt-in, usando templates aprovados."
      features={[
        {
          icon: Users,
          title: "Públicos com opt-in",
          description: "Segmentos que aceitaram receber mensagens.",
          tag: "segmentos",
        },
        {
          icon: CalendarClock,
          title: "Agendamento",
          description: "Data, hora e template de cada disparo.",
          tag: "calendário",
        },
        {
          icon: BarChart2,
          title: "Métricas de envio",
          description: "Entregas, leituras e respostas.",
          tag: "relatório",
        },
      ]}
      footnote="Protótipo visual · sem efeito real. Esta seção é uma prévia e será construída na fase de desenvolvimento."
    />
  )
}
