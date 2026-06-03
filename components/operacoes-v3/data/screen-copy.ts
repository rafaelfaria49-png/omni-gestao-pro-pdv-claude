// ============================================================================
// Operações V3 — Textos das telas (títulos, subtítulos) e copy de placeholder
// ----------------------------------------------------------------------------
// Centraliza a copy para manter consistência e facilitar revisão de produto.
// ============================================================================

import type { ScreenId } from "./types";

export interface ScreenCopy {
  titulo: string;
  subtitulo: string;
}

export const SCREEN_COPY: Record<ScreenId, ScreenCopy> = {
  dashboard: { titulo: "Dashboard operacional", subtitulo: "O pulso do dia: fila, prazos e garantias num olhar." },
  fila: { titulo: "Fila de OS", subtitulo: "Todas as ordens em andamento — Kanban, lista e calendário." },
  atendimento: { titulo: "Atendimento rápido", subtitulo: "Check-in de entrada do equipamento em segundos." },
  bancada: { titulo: "Bancada por técnico", subtitulo: "Carga de trabalho da equipe, OS por OS." },
  sla: { titulo: "SLA & atrasos", subtitulo: "Quem está no prazo, quem está em risco e quem estourou." },
  workspace: { titulo: "OS Workspace", subtitulo: "A ordem de serviço inteira em uma visão única e contínua." },
  "pdv-servico": { titulo: "PDV de serviço", subtitulo: "Recebimento da OS no balcão, com formas e parciais." },
  orcamentos: { titulo: "Orçamentos", subtitulo: "Do rascunho à aprovação — o funil comercial da assistência." },
  garantias: { titulo: "Garantias", subtitulo: "Cobertura ativa, vencendo e expirada por OS." },
  retornos: { titulo: "Retornos & retrabalho", subtitulo: "Reincidência e retrabalho sob controle." },
  portal: { titulo: "Portal do cliente", subtitulo: "Acompanhamento público da OS pelo próprio cliente." },
  notificacoes: { titulo: "Notificações & automações", subtitulo: "Mensagens automáticas em cada etapa da OS." },
  servicos: { titulo: "Serviços", subtitulo: "Catálogo de serviços da assistência." },
  pecas: { titulo: "Peças & pedidos", subtitulo: "Reserva de estoque e pedido de peças por OS." },
  rastreio: { titulo: "Rastreio físico", subtitulo: "Onde, fisicamente, cada aparelho está agora." },
  tecnicos: { titulo: "Técnicos", subtitulo: "A equipe técnica e sua carga de trabalho." },
  historico: { titulo: "Histórico de clientes", subtitulo: "Tudo que já passou pela bancada, por cliente." },
  relatorios: { titulo: "Relatórios & BI", subtitulo: "Indicadores operacionais e financeiros da assistência." },
  configuracoes: { titulo: "Configurações do módulo", subtitulo: "Workflow, SLA, checklists e documentos da assistência." },
};

export interface PlaceholderCopy {
  /** Frase principal do empty-state. */
  resumo: string;
  /** O que esta tela fará quando estiver conectada. */
  planejado: string[];
}

export const PLACEHOLDER_COPY: Partial<Record<ScreenId, PlaceholderCopy>> = {
  atendimento: {
    resumo: "O check-in de entrada nasce aqui — porém ainda sem gravar OS nesta fase.",
    planejado: [
      "Captura do cliente, aparelho e defeito relatado",
      "Checklist visual de entrada (tela, touch, câmera…)",
      "Senha do aparelho (PIN, texto ou padrão)",
      "Geração da OS e etiqueta de entrada",
    ],
  },
  "pdv-servico": {
    resumo: "O recebimento da OS no balcão será feito aqui — sem mexer no financeiro real nesta fase.",
    planejado: [
      "Total, desconto, acréscimo e sinal/entrada",
      "Formas de pagamento (PIX, dinheiro, débito, crédito, carteira)",
      "Recebimentos parciais com saldo em aberto",
      "Baixa real em Contas a Receber (fase futura)",
    ],
  },
  retornos: {
    resumo: "Retorno e retrabalho são um conceito novo do fluxo — a estrutura está pronta para ser ligada.",
    planejado: [
      "Reabertura de OS por reincidência do defeito",
      "Vínculo com a OS original e a garantia",
      "Indicador de taxa de retrabalho por técnico",
      "Custo do retrabalho separado do faturamento",
    ],
  },
  portal: {
    resumo: "O cliente acompanhará a própria OS por um link público — ainda em construção.",
    planejado: [
      "Linha do tempo pública (sem dados internos)",
      "Aprovação de orçamento pelo cliente",
      "Anexos liberados (fotos antes/depois)",
      "Aviso de pronto para retirada",
    ],
  },
  notificacoes: {
    resumo: "As automações de mensagem por etapa serão configuradas aqui.",
    planejado: [
      "Disparos por mudança de status",
      "Templates de WhatsApp por evento",
      "Lembretes de orçamento parado",
      "Aviso de garantia vencendo",
    ],
  },
  pecas: {
    resumo: "Reserva e pedido de peças são conceitos novos — a tela já segura o lugar deles.",
    planejado: [
      "Reserva de peça por OS (comprometido)",
      "Pedido de compra quando falta estoque",
      "Status: solicitada, a caminho, recebida",
      "Vínculo da peça recebida à OS de origem",
    ],
  },
  rastreio: {
    resumo: "A localização física do aparelho na loja será controlada aqui.",
    planejado: [
      "Posições: balcão, bancada, prateleira, vitrine",
      "Etiqueta com QR de localização",
      "Histórico de movimentação interna",
      "Alerta de aparelho parado há muito tempo",
    ],
  },
  relatorios: {
    resumo: "Os relatórios chegam depois das métricas corretas — sem números provisórios aqui.",
    planejado: [
      "Receita realizada × estimada (com Financeiro)",
      "Tempo médio de reparo por tipo de aparelho",
      "Taxa de aprovação de orçamentos",
      "Produtividade real por técnico",
    ],
  },
  configuracoes: {
    resumo: "A estrutura de configuração está visível — mas nada é salvo nesta fase.",
    planejado: [],
  },
};
