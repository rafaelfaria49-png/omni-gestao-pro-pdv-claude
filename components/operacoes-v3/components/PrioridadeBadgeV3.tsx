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
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  success: "border-success/30 bg-success/10 text-success",
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
