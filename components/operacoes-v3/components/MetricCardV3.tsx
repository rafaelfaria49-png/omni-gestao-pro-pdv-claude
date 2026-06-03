"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const TONE_ACCENT: Record<MetricTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
};

export interface MetricCardV3Props {
  label: string;
  value?: ReactNode;
  /** "a-conectar" não exibe número — mostra pílula honesta. */
  estado?: "ok" | "a-conectar";
  hint?: string;
  icon?: ReactNode;
  tone?: MetricTone;
  className?: string;
}

export function MetricCardV3({
  label,
  value,
  estado = "ok",
  hint,
  icon,
  tone = "neutral",
  className,
}: MetricCardV3Props) {
  const aConectar = estado === "a-conectar";
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="shrink-0 text-muted-foreground/70">{icon}</span> : null}
      </div>
      {aConectar ? (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
            a conectar
          </span>
        </div>
      ) : (
        <p className={cn("mt-2 truncate text-2xl font-semibold tabular-nums", TONE_ACCENT[tone])}>
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
