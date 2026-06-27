/**
 * Operações V4 Preview — tipos do estado local (visual, mock).
 *
 * Portados do `data-dc-script` do protótipo `design/operacoes-v4`. NÃO há
 * relação com os tipos reais da Operações V3 (`@/types/os`); este módulo é
 * totalmente isolado.
 */

export type V4Stage =
  | "entrada"
  | "diagnostico"
  | "orcamento"
  | "execucao"
  | "financeiro"
  | "entrega"
  | "posvenda"
  | "historico";

export type V4Status =
  | "aberta"
  | "diagnostico"
  | "aguardando_aprovacao"
  | "aprovado"
  | "aguardando_peca"
  | "em_execucao"
  | "pronta"
  | "entregue"
  | "cancelada";

export type V4Mode = "recepcao" | "bancada" | "auditoria";

export type V4View = "cockpit" | "auditoria";

export type V4Module = "workspace" | "dashboard" | "fila" | "bancada" | "sla" | "pdv";

export type V4Menu = "print" | "more" | null;

export interface V4State {
  view: V4View;
  module: V4Module;
  stage: V4Stage;
  status: V4Status;
  left: boolean;
  right: boolean;
  menu: V4Menu;
  toast: string;
  prioridade: "baixa" | "normal" | "alta" | "urgente";
  histFilter: string;
  novaOS: boolean;
  novaTab: "buscar" | "novo";
  novaEquip: string;
  novaOrigem: string;
  recibo: boolean;
  /** null = tela limpa (empty state); id = OS real selecionada. */
  selectedOsId: string | null;
}

/** Tom de cor de um status/badge. */
export interface V4Tone {
  bg: string;
  fg: string;
  dot: string;
}
