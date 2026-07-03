"use client";

// ============================================================================
// Operações V3 — Timeline operacional (item 3): 8 etapas do fluxo da OS.
// Dados derivados do estado real (status + eventos). Etapas sem evento real
// não mostram data/responsável — nada é inventado.
// ============================================================================

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { construirTimelineOperacionalV3, type TimelineToneV3 } from "@/lib/operacoes-v3/workspace-model";
import { formatDataHora } from "../lib/format";

const DOT_TONE: Record<TimelineToneV3, string> = {
  success: "bg-[var(--ops-v3-success)] text-white",
  primary: "bg-[var(--ops-v3-primary)] text-white",
  info: "bg-[var(--ops-v3-info)] text-white",
  warning: "bg-[var(--ops-v3-warning)] text-white",
  neutral: "bg-[var(--ops-v3-subtle)] text-white",
};

export function OSTimelineV3({ os }: { os: OrdemServico }) {
  const steps = construirTimelineOperacionalV3(os);

  return (
    <section className="rounded-[12px] border border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)] p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-[var(--ops-v3-body)]">Linha do tempo operacional</h3>
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={s.key} className="flex min-w-[112px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : steps[i - 1].atingido ? "bg-[var(--ops-v3-primary-bd)]" : "bg-[var(--ops-v3-line)]")} aria-hidden />
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                  s.atingido ? cn("border-transparent", DOT_TONE[s.tone]) : "border-[var(--ops-v3-input)] bg-[var(--ops-v3-surface)] text-[var(--ops-v3-subtle)]",
                )}
              >
                {s.atingido ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : s.atingido ? "bg-[var(--ops-v3-primary-bd)]" : "bg-[var(--ops-v3-line)]")} aria-hidden />
            </div>
            <p className={cn("mt-1.5 text-[11px] font-medium", s.atingido ? "text-[var(--ops-v3-body)]" : "text-[var(--ops-v3-subtle)]")}>{s.label}</p>
            {s.em ? (
              <p className="text-[10px] leading-tight text-[var(--ops-v3-muted)]">{formatDataHora(s.em)}</p>
            ) : (
              <p className="text-[10px] leading-tight text-[var(--ops-v3-faint)]">pendente</p>
            )}
            {s.responsavel ? <p className="truncate text-[10px] leading-tight text-[var(--ops-v3-subtle)]">{s.responsavel}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
