import type { EventoTimeline, Orcamento } from "@/types/os";
import { nowIso } from "@/lib/operacoes/services/os-helpers";

export type OrcamentoHistoricoItem = {
  orcamento: Orcamento;
  revisadoEm: string;
  motivo: "aprovado_editado_sem_valor" | "aprovado_revisado";
  totalAnterior: number;
  totalNovo: number;
};

export type OrcamentoRevisaoAtual = {
  revisadoEm: string;
  totalAnterior: number;
  totalNovo: number;
  revisadoAposAprovacao: boolean;
};

export type ApprovedBudgetMutation = {
  kind: "none" | "approved_edit_same_total" | "approved_edit_total_changed";
  totalAnterior: number;
  totalNovo: number;
};

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function detectApprovedBudgetMutation(params: {
  currentOrcamento?: Orcamento;
  nextOrcamento?: Orcamento;
}): ApprovedBudgetMutation {
  const cur = params.currentOrcamento;
  const next = params.nextOrcamento;
  if (!cur || !next) return { kind: "none", totalAnterior: 0, totalNovo: 0 };
  if (cur.status !== "aprovado") return { kind: "none", totalAnterior: safeNum(cur.total), totalNovo: safeNum(next.total) };

  const totalAnterior = safeNum(cur.total);
  const totalNovo = safeNum(next.total);
  if (Math.abs(totalAnterior - totalNovo) <= 0.0001) {
    return { kind: "approved_edit_same_total", totalAnterior, totalNovo };
  }
  return { kind: "approved_edit_total_changed", totalAnterior, totalNovo };
}

export function buildOrcamentoRevision(params: {
  previous: Orcamento;
  next: Orcamento;
  revisadoEm?: string;
  kind: "aprovado_editado_sem_valor" | "aprovado_revisado";
}): OrcamentoHistoricoItem {
  const revisadoEm = params.revisadoEm ?? nowIso();
  return {
    orcamento: params.previous,
    revisadoEm,
    motivo: params.kind,
    totalAnterior: safeNum(params.previous.total),
    totalNovo: safeNum(params.next.total),
  };
}

export function shouldInvalidateFaturamento(mutation: ApprovedBudgetMutation): boolean {
  // Nesta fase não invalidamos/cancelamos automaticamente para evitar cancelamentos indevidos.
  // A política é marcar revisão e manter idempotência.
  return mutation.kind === "none" ? false : false;
}

export function getOrcamentoPolicySummary(mutation: ApprovedBudgetMutation): string {
  if (mutation.kind === "approved_edit_same_total") return "Orçamento aprovado editado sem alteração de valor.";
  if (mutation.kind === "approved_edit_total_changed") return "Orçamento aprovado revisado com alteração de valor.";
  return "Sem política aplicada.";
}

/**
 * Aplica política segura quando um orçamento já aprovado é alterado.
 * Retorna `next` enriquecido com:
 * - histórico (`orcamentoHistorico[]`)
 * - revisão atual (`orcamentoRevisaoAtual`)
 * - marcadores de revisão de faturamento (`faturamentoRevisadoEm`, `faturamentoValorAnterior`, `faturamentoValorAtual`)
 * - eventos de timeline adicionais (sistema)
 */
export function applyApprovedBudgetPolicy<T extends { orcamento?: Orcamento; timeline?: EventoTimeline[] }>(params: {
  current: T;
  next: T;
  makeTimelineEvent: (tipo: EventoTimeline["tipo"], conteudo: string, metadata?: Record<string, unknown>) => EventoTimeline;
}): T {
  const mutation = detectApprovedBudgetMutation({
    currentOrcamento: params.current.orcamento,
    nextOrcamento: params.next.orcamento,
  });
  if (mutation.kind === "none") return params.next;
  if (!params.next.orcamento || !params.current.orcamento) return params.next;

  const ts = nowIso();
  const timeline = Array.isArray(params.next.timeline) ? [...params.next.timeline] : [];

  if (mutation.kind === "approved_edit_same_total") {
    timeline.push(
      params.makeTimelineEvent(
        "orcamento_aprovado_editado_sem_valor",
        "Orçamento aprovado foi editado (sem alteração de valor).",
        { total: mutation.totalNovo }
      )
    );
    return { ...(params.next as T), timeline } as T;
  }

  // mutation.kind === "approved_edit_total_changed"
  const previous = params.current.orcamento;
  const nextOrc = params.next.orcamento;

  const historico = (params.next as unknown as { orcamentoHistorico?: unknown }).orcamentoHistorico;
  const arr = Array.isArray(historico) ? (historico as OrcamentoHistoricoItem[]) : [];
  const item = buildOrcamentoRevision({ previous, next: nextOrc, revisadoEm: ts, kind: "aprovado_revisado" });
  const orcamentoHistorico = [...arr, item];

  const orcamentoRevisaoAtual: OrcamentoRevisaoAtual = {
    revisadoEm: ts,
    totalAnterior: mutation.totalAnterior,
    totalNovo: mutation.totalNovo,
    revisadoAposAprovacao: true,
  };

  timeline.push(
    params.makeTimelineEvent(
      "orcamento_aprovado_revisado",
      "Orçamento aprovado foi revisado (alteração de valor).",
      { totalAnterior: mutation.totalAnterior, totalNovo: mutation.totalNovo }
    )
  );
  timeline.push(
    params.makeTimelineEvent(
      "faturamento_os_revisado",
      "Faturamento da OS revisado após alteração de orçamento aprovado.",
      { totalAnterior: mutation.totalAnterior, totalNovo: mutation.totalNovo }
    )
  );

  // Atualiza o faturamento efetivo para manter Conta a Receber alinhada ao total mais recente.
  // Mantém idempotência (mesma localKey) e adiciona marcadores de revisão no payload.
  const nextOut: T = {
    ...(params.next as T),
    timeline,
    orcamentoHistorico: orcamentoHistorico as unknown,
    orcamentoRevisaoAtual: orcamentoRevisaoAtual as unknown,
    faturamentoRevisadoEm: ts as unknown,
    faturamentoValorAnterior: mutation.totalAnterior as unknown,
    faturamentoValorAtual: mutation.totalNovo as unknown,
    faturamentoTotal: mutation.totalNovo as unknown,
  };

  return nextOut;
}

