// ============================================================================
// Operações V3 — Fluxo de status → label, tom e AÇÃO PRIMÁRIA contextual
// ----------------------------------------------------------------------------
// Alimenta o StatusBadgeV3 e a OSCommandBarV3 (barra de comando).
// A ação primária é, nesta sprint, um PLACEHOLDER HONESTO (toast); nenhum
// write-path é chamado. Os status reais vêm do enum OSStatus (@/types/os).
// "Recebida" do blueprint é conceitual e não existe no enum real — por isso
// "Pronta" já oferece "Receber pagamento" e "Entregue" abre garantia/retorno.
// ============================================================================

import type { OSStatus } from "@/types/os";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "primary";

export interface StatusFlowEntry {
  label: string;
  tone: Tone;
  /** Ação primária contextual (placeholder honesto nesta sprint). */
  primaryAction: string;
}

export const STATUS_FLOW: Record<OSStatus, StatusFlowEntry> = {
  aberta: { label: "Aberta", tone: "info", primaryAction: "Iniciar diagnóstico" },
  diagnostico: { label: "Diagnóstico", tone: "info", primaryAction: "Enviar orçamento" },
  aguardando_aprovacao: { label: "Aguardando aprovação", tone: "warning", primaryAction: "Registrar aprovação" },
  aprovado: { label: "Aprovada", tone: "primary", primaryAction: "Iniciar serviço" },
  aguardando_peca: { label: "Aguardando peça", tone: "warning", primaryAction: "Marcar peça chegou" },
  em_execucao: { label: "Em execução", tone: "primary", primaryAction: "Marcar pronta" },
  pronta: { label: "Pronta", tone: "success", primaryAction: "Receber pagamento" },
  entregue: { label: "Entregue", tone: "neutral", primaryAction: "Abrir garantia / retorno" },
  cancelada: { label: "Cancelada", tone: "danger", primaryAction: "Reabrir (se política)" },
};

export function statusFlow(status: OSStatus | string | undefined | null): StatusFlowEntry {
  if (status && Object.prototype.hasOwnProperty.call(STATUS_FLOW, status)) {
    return STATUS_FLOW[status as OSStatus];
  }
  return { label: status ? String(status) : "—", tone: "neutral", primaryAction: "Ver detalhes" };
}

/** Classes de badge por tom — apenas tokens semânticos (sem cor hardcoded). */
export const TONE_BADGE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  success: "bg-success/10 text-success border-success/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  primary: "bg-primary/10 text-primary border-primary/25",
};

/** Classe de "ponto" (dot) por tom — usada em listas e na timeline. */
export const TONE_DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-destructive",
  primary: "bg-primary",
};
