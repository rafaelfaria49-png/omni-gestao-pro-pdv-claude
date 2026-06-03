// ============================================================================
// Operações V3 — Fase 1B · MÁQUINA ÚNICA DE STATUS (fonte de verdade)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma) — importável tanto pelo cliente
// (Kanban, Workspace, Action Bar, badges) quanto pelo servidor (status-action).
// TODA decisão de transição da V3 nasce aqui. Nenhuma outra camada decide.
//
// Por que uma máquina própria da V3 (e não reusar a do V2):
//   1. O grafo da V3 difere do V2 — a V3 exige APROVADA → AGUARDANDO_PECA, que o
//      grafo do V2 (`operacao-hub-flow.ts`) não permite.
//   2. A V3 inclui o status RECEBIDA (entre PRONTA e ENTREGUE), inexistente no
//      enum OSStatus do V2 e no enum Prisma.
//   3. Nesta fase a transição é status + timeline APENAS — sem efeitos de
//      estoque/financeiro/garantia (que o `updateOSStatus`/`updateOSPayload` do
//      V2 disparam). Ver `status-actions.ts`.
//
// Persistência (sem tocar schema): o status V3 autoritativo vive em
// `payload.operacaoStatusV3` (JSONB). `payload.status` recebe a PROJEÇÃO V2
// (recebida → "pronta") para manter o V2 legado e a coluna Prisma colapsada
// coerentes. Ver `projetarStatusV2` + `statusV3FromOS`.
// ============================================================================

import type { OSStatus } from "@/types/os";
import { normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";

/** Os 10 status oficiais do fluxo operacional da V3. */
export type OperacaoStatusV3 =
  | "aberta"
  | "diagnostico"
  | "aguardando_aprovacao"
  | "aprovado"
  | "aguardando_peca"
  | "em_execucao"
  | "pronta"
  | "recebida"
  | "entregue"
  | "cancelada";

export type ToneV3 = "neutral" | "info" | "warning" | "success" | "danger" | "primary";

export interface StatusMetaV3 {
  id: OperacaoStatusV3;
  label: string;
  tone: ToneV3;
  /** Ordem no pipeline (apenas para ordenação/exibição). */
  order: number;
  /** Estado final — não admite transição de saída (exceto para si mesmo). */
  final: boolean;
}

const META: Record<OperacaoStatusV3, StatusMetaV3> = {
  aberta: { id: "aberta", label: "Aberta", tone: "info", order: 10, final: false },
  diagnostico: { id: "diagnostico", label: "Diagnóstico", tone: "info", order: 20, final: false },
  aguardando_aprovacao: { id: "aguardando_aprovacao", label: "Aguardando aprovação", tone: "warning", order: 30, final: false },
  aprovado: { id: "aprovado", label: "Aprovada", tone: "primary", order: 40, final: false },
  aguardando_peca: { id: "aguardando_peca", label: "Aguardando peça", tone: "warning", order: 50, final: false },
  em_execucao: { id: "em_execucao", label: "Em execução", tone: "primary", order: 60, final: false },
  pronta: { id: "pronta", label: "Pronta", tone: "success", order: 70, final: false },
  recebida: { id: "recebida", label: "Recebida", tone: "success", order: 80, final: false },
  entregue: { id: "entregue", label: "Entregue", tone: "neutral", order: 90, final: true },
  cancelada: { id: "cancelada", label: "Cancelada", tone: "danger", order: 100, final: true },
};

/** Lista ordenada dos 10 status. */
export const STATUS_V3_LIST: OperacaoStatusV3[] = Object.values(META)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.id);

/** Colunas do Kanban (exclui apenas "cancelada", como o V2). */
export const KANBAN_PIPELINE_V3: OperacaoStatusV3[] = STATUS_V3_LIST.filter((s) => s !== "cancelada");

export function isOperacaoStatusV3(v: unknown): v is OperacaoStatusV3 {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(META, v);
}

/** Meta segura — fallback neutro para valores fora do domínio. */
export function statusMetaV3(status: unknown): StatusMetaV3 {
  if (isOperacaoStatusV3(status)) return META[status];
  return { id: "aberta", label: status ? String(status) : "—", tone: "neutral", order: 0, final: false };
}

// ----------------------------------------------------------------------------
// Grafo de transições — EXATAMENTE o blueprint da Fase 1B (avanço linear).
// "cancelada" não entra no grafo: é tratada como regra geral (qualquer status
// não-final pode ser cancelado).
// ----------------------------------------------------------------------------

const TRANSICOES_V3: Record<OperacaoStatusV3, OperacaoStatusV3[]> = {
  aberta: ["diagnostico"],
  diagnostico: ["aguardando_aprovacao"],
  aguardando_aprovacao: ["aprovado"],
  aprovado: ["aguardando_peca", "em_execucao"],
  aguardando_peca: ["em_execucao"],
  em_execucao: ["pronta"],
  pronta: ["recebida"],
  recebida: ["entregue"],
  entregue: [],
  cancelada: [],
};

export function isFinalV3(status: unknown): boolean {
  return statusMetaV3(status).final;
}

export interface VereditoTransicaoV3 {
  ok: boolean;
  /** Mensagem amigável quando a transição é bloqueada. */
  motivo?: string;
}

/**
 * Única função que decide se uma transição é válida. Servidor e cliente usam
 * exatamente esta regra (sem divergência possível).
 */
export function podeTransicionarV3(from: unknown, to: unknown): VereditoTransicaoV3 {
  if (!isOperacaoStatusV3(to)) return { ok: false, motivo: "Status de destino inválido." };
  const origem = statusMetaV3(from);
  if (!isOperacaoStatusV3(from)) return { ok: false, motivo: "Status atual da OS inválido." };
  if (from === to) return { ok: false, motivo: "A OS já está neste status." };

  if (origem.final) {
    return {
      ok: false,
      motivo:
        from === "entregue"
          ? "Esta OS já foi entregue e não pode mudar de status."
          : "Esta OS está cancelada e não pode ser reativada.",
    };
  }

  // Qualquer status não-final pode ir para "cancelada".
  if (to === "cancelada") return { ok: true };

  if (TRANSICOES_V3[from].includes(to)) return { ok: true };

  return {
    ok: false,
    motivo: `Não é possível mover de "${origem.label}" para "${statusMetaV3(to).label}".`,
  };
}

/** Destinos válidos a partir de `from` (avanços + cancelar), para menus/Kanban. */
export function proximasTransicoesV3(from: unknown): OperacaoStatusV3[] {
  if (!isOperacaoStatusV3(from) || statusMetaV3(from).final) return [];
  return [...TRANSICOES_V3[from], "cancelada"];
}

// ----------------------------------------------------------------------------
// Ação primária recomendada (avanço "feliz" do fluxo) — alimenta a Action Bar.
// ----------------------------------------------------------------------------

const AVANCO_PRIMARIO: Partial<Record<OperacaoStatusV3, OperacaoStatusV3>> = {
  aberta: "diagnostico",
  diagnostico: "aguardando_aprovacao",
  aguardando_aprovacao: "aprovado",
  aprovado: "em_execucao",
  aguardando_peca: "em_execucao",
  em_execucao: "pronta",
  pronta: "recebida",
  recebida: "entregue",
};

/** Verbo de cada transição (rótulo do botão para CHEGAR ao status alvo). */
export const LABEL_TRANSICAO_V3: Record<OperacaoStatusV3, string> = {
  aberta: "Reabrir",
  diagnostico: "Iniciar diagnóstico",
  aguardando_aprovacao: "Enviar para aprovação",
  aprovado: "Marcar como aprovada",
  aguardando_peca: "Aguardar peça",
  em_execucao: "Iniciar execução",
  pronta: "Marcar como pronta",
  recebida: "Marcar como recebida",
  entregue: "Marcar como entregue",
  cancelada: "Cancelar OS",
};

export interface AcaoStatusV3 {
  to: OperacaoStatusV3;
  label: string;
}

/** Próxima ação recomendada (avanço principal) ou null se for estado final. */
export function acaoPrimariaV3(from: unknown): AcaoStatusV3 | null {
  if (!isOperacaoStatusV3(from)) return null;
  const to = AVANCO_PRIMARIO[from];
  if (!to) return null;
  return { to, label: LABEL_TRANSICAO_V3[to] };
}

// ----------------------------------------------------------------------------
// Derivação (leitura) e projeção (escrita) entre o status V3 e o status V2.
// ----------------------------------------------------------------------------

type OSStatusSource = {
  status?: unknown;
  operacaoStatus?: unknown;
  operacaoStatusV3?: unknown;
};

/**
 * Status V3 efetivo de uma OS lida. Preferência:
 *   1. `payload.operacaoStatusV3` (autoritativo da V3, pode ser "recebida").
 *   2. fallback para o status V2 (`operacaoStatus`/`status`), normalizado — que
 *      nunca produz "recebida" (legado).
 */
export function statusV3FromOS(os: OSStatusSource | null | undefined): OperacaoStatusV3 {
  const v3 = os?.operacaoStatusV3;
  if (isOperacaoStatusV3(v3)) return v3;
  return normalizeOperacaoStatus(os?.operacaoStatus ?? os?.status) as OperacaoStatusV3;
}

/**
 * Projeção do status V3 para o enum V2 (`OSStatus`) gravado em `payload.status`
 * e colapsado para a coluna Prisma. "recebida" não existe no V2 → vira "pronta"
 * (estado mais próximo, ainda não-final), preservando o V2 legado.
 */
export function projetarStatusV2(v3: OperacaoStatusV3): OSStatus {
  if (v3 === "recebida") return "pronta";
  return v3 as OSStatus;
}

// ----------------------------------------------------------------------------
// Acoplamento ciclo do ORÇAMENTO → status da OS (Fase 1C).
// Centralizado aqui (única fonte). O ciclo do orçamento pode AVANÇAR a OS até
// estes checkpoints; se a OS já estiver à frente, retorna null (sem regressão).
// ----------------------------------------------------------------------------

/** Status da OS após ENVIAR o orçamento, ou null se nada deve mudar. */
export function statusOSAposEnviarOrcamento(current: unknown): OperacaoStatusV3 | null {
  const s = statusV3FromOS({ status: current });
  return s === "aberta" || s === "diagnostico" ? "aguardando_aprovacao" : null;
}

/** Status da OS após APROVAR o orçamento, ou null se nada deve mudar. */
export function statusOSAposAprovarOrcamento(current: unknown): OperacaoStatusV3 | null {
  const s = statusV3FromOS({ status: current });
  return s === "aberta" || s === "diagnostico" || s === "aguardando_aprovacao" ? "aprovado" : null;
}
