"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Props = {
  label: string;
  value: string;
  trend: number;
  icon: LucideIcon;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
  spark?: number[];
  /** Quando true, não exibe variação percentual fictícia (painel ilustrativo). */
  hideTrend?: boolean;
  /** Exibe estado de carregamento sem alterar o layout do card. */
  loading?: boolean;
  /** Com hideTrend: substitui o selo "Ilustrativo" (ex.: "Ao vivo"). */
  statusLabel?: string;
  /** Oculta o mini spark decorativo (dados reais sem série histórica no card). */
  hideSpark?: boolean;
};

const accentBg: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-muted text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const accentStroke: Record<NonNullable<Props["accent"]>, string> = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

export function KpiCard({
  label,
  value,
  trend,
  icon: Icon,
  hint,
  accent = "primary",
  spark = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14],
  hideTrend = false,
  loading = false,
  statusLabel,
  hideSpark = false,
}: Props) {
  const positive = !hideTrend && trend >= 0;
  const data = spark.map((v, i) => ({ i, v }));
  const stroke = accentStroke[accent];
  const gradId = `spark-${accent}-${label.replace(/\s/g, "")}`;

  return (
    <div
      className={[
        "rounded-xl border border-border bg-card p-[clamp(10px,1.5vh,16px)] transition-colors hover:border-foreground/20 hover:shadow-soft",
        loading ? "animate-pulse" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-5 w-5 rounded-md grid place-items-center ${accentBg[accent]}`}>
            <Icon className="h-3 w-3" strokeWidth={2} />
          </div>
          <span className="text-[11.5px] font-medium text-muted-foreground truncate">
            {label}
          </span>
        </div>
        {loading ? (
          <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">…</span>
        ) : hideTrend ? (
          statusLabel === "Ao vivo" ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
              <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse"></span>
              {statusLabel}
            </span>
          ) : (
            <span className="text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">
              {statusLabel ?? "Ilustrativo"}
            </span>
          )
        ) : (
          <span
            className={[
              "inline-flex items-center gap-0.5 text-[10.5px] font-bold tabular-nums",
              positive ? "text-success" : "text-destructive",
            ].join(" ")}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
            ) : (
              <ArrowDownRight className="h-3 w-3" strokeWidth={2.5} />
            )}
            {positive ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="mt-[clamp(6px,1vh,12px)] flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-display font-bold tracking-tight text-foreground tabular-nums leading-none">
            {value}
          </div>
          {hint && (
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{hint}</div>
          )}
        </div>
        {!hideSpark ? (
          <div className="h-8 w-20 shrink-0 -mb-0.5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={stroke}
                  strokeWidth={1.5}
                  fill={`url(#${gradId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
