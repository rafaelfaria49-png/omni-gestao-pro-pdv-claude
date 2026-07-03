"use client";

// ============================================================================
// Operações V3 — Fase 3B · Badges de PRIORIDADE e SLA (puros, leitura)
// ============================================================================

import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  PRIORIDADE_META_V3,
  SLA_SITUACAO_META_V3,
  lerPrioridadeV3,
  lerSlaV3,
  type PrioridadeV3,
  type SlaSituacaoV3,
} from "@/lib/operacoes-v3/producao-model";

const TONE_CLS: Record<string, string> = {
  neutral: "border-[var(--ops-v3-input)] bg-[var(--ops-v3-muted-bg)] text-[var(--ops-v3-muted)]",
  info: "border-[var(--ops-v3-info-bd)] bg-[var(--ops-v3-info-bg)] text-[var(--ops-v3-info-fg)]",
  warning: "border-[var(--ops-v3-warning-bd)] bg-[var(--ops-v3-warning-bg)] text-[var(--ops-v3-warning-fg)]",
  danger: "border-[var(--ops-v3-danger-bd)] bg-[var(--ops-v3-danger-bg)] text-[var(--ops-v3-danger-fg)]",
  success: "border-[var(--ops-v3-success-bd)] bg-[var(--ops-v3-success-bg)] text-[var(--ops-v3-success-fg)]",
};

/** Chip de prioridade. Por padrão oculta "normal" (ruído); `force` mostra sempre. */
export function PrioridadeBadgeV3({ os, force, className }: { os: OrdemServico; force?: boolean; className?: string }) {
  const p: PrioridadeV3 = lerPrioridadeV3(os);
  if (p === "normal" && !force) return null;
  const meta = PRIORIDADE_META_V3[p];
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TONE_CLS[meta.tone], className)}>
      {meta.label}
    </span>
  );
}

export function SlaBadgeV3({ os, className }: { os: OrdemServico; className?: string }) {
  const situacao: SlaSituacaoV3 = lerSlaV3(os).situacao;
  if (situacao === "sem_prazo") return null;
  const meta = SLA_SITUACAO_META_V3[situacao];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", TONE_CLS[meta.tone], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </span>
  );
}
