import type { EventoTimeline, OSStatus, Orcamento, OrdemServico } from "@/types/os";
import { normalizeOperacaoStatus, getOperacaoStatusMeta } from "@/components/operacoes/lovable/utils/os-status";

/** Transições explícitas permitidas no Kanban / updateOSStatus (exceto regras especiais abaixo). */
const ALLOWED_GRAPH: Record<OSStatus, OSStatus[]> = {
  aberta: ["aberta", "diagnostico", "cancelada"],
  diagnostico: ["diagnostico", "aguardando_aprovacao", "aprovado", "cancelada"],
  aguardando_aprovacao: ["aguardando_aprovacao", "aprovado", "diagnostico", "cancelada"],
  aprovado: ["aprovado", "em_execucao", "cancelada"],
  em_execucao: ["em_execucao", "aguardando_peca", "pronta", "cancelada"],
  aguardando_peca: ["aguardando_peca", "em_execucao", "pronta", "cancelada"],
  pronta: ["pronta", "entregue", "em_execucao", "cancelada"],
  entregue: ["entregue"],
  cancelada: ["cancelada"],
};

function statusLabel(s: OSStatus): string {
  return getOperacaoStatusMeta(s).label;
}

export function isOrcamentoEnviadoOuMelhor(o?: Orcamento | null): boolean {
  if (!o) return false;
  return o.status === "enviado" || o.status === "aprovado" || o.status === "recusado" || o.status === "expirado";
}

export type OperacaoTransitionOptions = {
  /** Libera ir para “Em execução” a partir de “Aguardando aprovação” sem orçamento aprovado (uso interno confirmado). */
  allowIniciarServicoSemAprovacao?: boolean;
};

/**
 * Valida transição de status operacional (payload) antes de persistir.
 * Usado por updateOSStatus e pelo Kanban (via Server Action).
 */
export function assertOperacaoStatusTransition(
  from: OSStatus | unknown,
  to: OSStatus | unknown,
  opts?: OperacaoTransitionOptions,
): void {
  const a = normalizeOperacaoStatus(from);
  const b = normalizeOperacaoStatus(to);
  if (a === b) return;

  if (a === "entregue" && b !== "entregue") {
    throw new Error("Esta OS já foi entregue e não pode ser alterada por este fluxo.");
  }
  if (a === "cancelada" && b !== "cancelada") {
    throw new Error("OS cancelada não pode ser reativada automaticamente.");
  }
  if (b === "cancelada") {
    if (a === "entregue") throw new Error("Não é possível cancelar uma OS já entregue.");
    return;
  }
  if (b === "entregue" && a !== "pronta" && a !== "entregue") {
    throw new Error("Só é possível marcar como entregue após a OS estar pronta para retirada.");
  }
  if (b === "em_execucao") {
    const okOrigem =
      ["aprovado", "em_execucao", "aguardando_peca", "pronta"].includes(a) ||
      (opts?.allowIniciarServicoSemAprovacao === true && a === "aguardando_aprovacao");
    if (!okOrigem) {
      throw new Error("Inicie o serviço apenas após aprovação do orçamento (status “Aprovado”).");
    }
    if (opts?.allowIniciarServicoSemAprovacao === true && a === "aguardando_aprovacao" && b === "em_execucao") {
      return;
    }
  }

  const allowed = ALLOWED_GRAPH[a];
  if (!allowed?.includes(b)) {
    throw new Error(`Não é permitido alterar de “${statusLabel(a)}” para “${statusLabel(b)}”.`);
  }
}

export function readTimelinePayload(os: { timeline?: unknown } | null | undefined): EventoTimeline[] {
  const t = os?.timeline;
  if (!Array.isArray(t)) return [];
  return t.filter((x) => x && typeof x === "object" && typeof (x as EventoTimeline).id === "string") as EventoTimeline[];
}

export function assertOrcamentoAprovavel(orc?: Orcamento | null): void {
  if (!orc) throw new Error("Crie um orçamento antes de aprovar.");
  if (orc.status === "aprovado") throw new Error("Este orçamento já está aprovado.");
  if (orc.status === "recusado") throw new Error("Orçamento recusado — ajuste e envie novamente antes de aprovar.");
  if (orc.status !== "enviado" && orc.status !== "rascunho") {
    throw new Error("Envie o orçamento ao cliente ou finalize o rascunho antes de aprovar.");
  }
}

export function assertOrcamentoRecusavel(orc?: Orcamento | null): void {
  if (!orc) throw new Error("Não há orçamento para reprovar.");
  if (orc.status === "aprovado") throw new Error("Orçamento já aprovado não pode ser reprovado.");
  if (orc.status === "recusado") throw new Error("Este orçamento já está recusado.");
}

export function assertPodeEnviarOrcamento(os: Pick<OrdemServico, "orcamento" | "status">): void {
  const st = normalizeOperacaoStatus(os.status);
  if (st === "entregue" || st === "cancelada") throw new Error("Não é possível enviar orçamento neste estado da OS.");
  if (!os.orcamento) throw new Error("Crie um orçamento antes de enviar.");
}

export function assertPodeIniciarDiagnostico(os: Pick<OrdemServico, "status">): void {
  const st = normalizeOperacaoStatus(os.status);
  if (st !== "aberta") throw new Error("O diagnóstico só pode ser iniciado com a OS em aberto.");
}

export function assertPodeMarcarPronta(os: Pick<OrdemServico, "status">): void {
  const st = normalizeOperacaoStatus(os.status);
  if (st !== "em_execucao" && st !== "aguardando_peca") {
    throw new Error("Marque como pronta apenas a partir de “Em execução” ou “Aguardando peça”.");
  }
}

export function assertPodeAguardarPeca(os: Pick<OrdemServico, "status">): void {
  const st = normalizeOperacaoStatus(os.status);
  if (st !== "em_execucao") throw new Error("“Aguardar peça” só se aplica com a OS em execução.");
}
