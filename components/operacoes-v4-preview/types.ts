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

/** Estado tri-estado do checklist e do estado físico. */
export type V4TriEstado = "ok" | "ruim" | "nt";
export type V4FisEstado = "ok" | "avariado" | "ausente";

export type V4OrcKind = "cobrado" | "brinde" | "desconto";

export interface V4OrcItem {
  id: number;
  cat: "servico" | "peca" | "acessorio" | "produto";
  nome: string;
  kind: V4OrcKind;
  valor: number;
  custo: number;
  qtd: number;
}

export type V4SecTipo = "pin" | "senha" | "padrao";

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
  estados: V4TriEstado[];
  tech: boolean[];
  estadoFis: V4FisEstado[];
  faceId: boolean;
  bio: boolean;
  acessorios: boolean[];
  acessoriosDev: boolean[];
  entregaCheck: boolean[];
  histFilter: string;
  novaOS: boolean;
  novaTab: "buscar" | "novo";
  novaEquip: string;
  novaOrigem: string;
  secTipo: V4SecTipo;
  pattern: number[];
  recibo: boolean;
  orcItens: V4OrcItem[];
  /** false = tela limpa (empty state); true = OS demo selecionada */
  osSelected: boolean;
}

/** Tom de cor de um status/badge. */
export interface V4Tone {
  bg: string;
  fg: string;
  dot: string;
}
