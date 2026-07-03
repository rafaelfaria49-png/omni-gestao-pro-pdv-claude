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

/**
 * Classes de badge por tom. Usam a paleta V3 centralizada em
 * `operacoes-v3-skin.module.css` (`var(--ops-v3-*)`) — exceção escopada e
 * documentada (mesmo precedente do `tokens.ts` da Operações V4 Preview), não
 * os tokens semânticos globais do OmniGestão. Nenhuma cor solta neste arquivo:
 * qualquer ajuste de tom é feito num único lugar (o CSS module).
 */
export const TONE_BADGE_CLASS: Record<Tone, string> = {
  neutral: "border-[var(--ops-v3-input)] bg-[var(--ops-v3-muted-bg)] text-[var(--ops-v3-muted)]",
  info: "border-[var(--ops-v3-info-bd)] bg-[var(--ops-v3-info-bg)] text-[var(--ops-v3-info-fg)]",
  warning: "border-[var(--ops-v3-warning-bd)] bg-[var(--ops-v3-warning-bg)] text-[var(--ops-v3-warning-fg)]",
  success: "border-[var(--ops-v3-success-bd)] bg-[var(--ops-v3-success-bg)] text-[var(--ops-v3-success-fg)]",
  danger: "border-[var(--ops-v3-danger-bd)] bg-[var(--ops-v3-danger-bg)] text-[var(--ops-v3-danger-fg)]",
  primary: "border-[var(--ops-v3-primary-bd)] bg-[var(--ops-v3-primary-bg)] text-[var(--ops-v3-primary)]",
};

/** Classe de "ponto" (dot) por tom — usada em listas e na timeline. */
export const TONE_DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-[var(--ops-v3-subtle)]",
  info: "bg-[var(--ops-v3-info)]",
  warning: "bg-[var(--ops-v3-warning)]",
  success: "bg-[var(--ops-v3-success)]",
  danger: "bg-[var(--ops-v3-danger)]",
  primary: "bg-[var(--ops-v3-primary)]",
};
