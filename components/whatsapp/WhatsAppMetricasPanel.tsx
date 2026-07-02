"use client"

import { Gauge, LineChart, Timer } from "lucide-react"
import { ComingSoonScreen } from "./whatsapp-preview-ui"

export function WhatsAppMetricasPanel() {
  return (
    <ComingSoonScreen
      icon={LineChart}
      title="Métricas"
      badge="preview"
      description="Relatórios avançados de atendimento, desempenho da IA e conversão em venda ou OS."
      features={[
        {
          icon: LineChart,
          title: "Conversão",
          description: "Conversas que viraram venda ou OS.",
          tag: "gráfico",
        },
        {
          icon: Gauge,
          title: "Desempenho da IA",
          description: "Score médio e taxa de resolução.",
          tag: "gráfico",
        },
        {
          icon: Timer,
          title: "Tempo de resposta",
          description: "Primeira resposta e resolução.",
          tag: "média",
        },
      ]}
      footnote="Protótipo visual · sem efeito real. Esta seção é uma prévia e será construída na fase de desenvolvimento. Veja o Painel (Visão Geral) para métricas reais já calculadas a partir das conversas."
    />
  )
}
