"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";
import type { DashboardEliteFaturamentoDia } from "@/hooks/use-dashboard-elite";
import { cn } from "@/lib/utils";

const DEMO_DATA = [
  { day: "Seg", value: 18420 },
  { day: "Ter", value: 22150 },
  { day: "Qua", value: 19880 },
  { day: "Qui", value: 27340 },
  { day: "Sex", value: 31200 },
  { day: "Sáb", value: 28760 },
  { day: "Dom", value: 24590 },
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);

const ranges = ["7D", "30D", "90D"] as const;

function formatDayLabel(iso: string): string {
  const parts = iso.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
    }
  }
  return iso;
}

type RevenueChartProps = {
  faturamento7d?: DashboardEliteFaturamentoDia[];
  faturamentoHoje?: number;
  loading?: boolean;
  useLiveData?: boolean;
};

export function RevenueChart({
  faturamento7d,
  faturamentoHoje,
  loading = false,
  useLiveData = false,
}: RevenueChartProps) {
  const [range, setRange] = useState<(typeof ranges)[number]>("7D");

  const liveSeries = useMemo(() => {
    if (!useLiveData || !faturamento7d?.length) return null;
    return faturamento7d.map((row) => ({
      day: formatDayLabel(row.day),
      value: row.total,
    }));
  }, [faturamento7d, useLiveData]);

  const chartData = range === "7D" && liveSeries ? liveSeries : DEMO_DATA;
  const isDemoChart = !(range === "7D" && liveSeries);

  const total7d = useMemo(() => {
    if (!liveSeries) return null;
    return liveSeries.reduce((acc, row) => acc + row.value, 0);
  }, [liveSeries]);

  const headerTotal =
    useLiveData && typeof faturamentoHoje === "number"
      ? fmt(faturamentoHoje)
      : isDemoChart
        ? "—"
        : total7d != null
          ? fmt(total7d)
          : "—";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between p-[clamp(10px,1.5vh,16px)] pb-[clamp(6px,0.8vh,10px)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-semibold text-[14px] tracking-tight">Faturamento</h3>
            {isDemoChart ? <DemoBadge>Exemplo</DemoBadge> : null}
            {useLiveData && !isDemoChart ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">7 dias · ao vivo</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-display font-semibold tabular-nums tracking-tight",
                useLiveData && !loading ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {loading ? "…" : headerTotal}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {useLiveData && !isDemoChart
                ? "Hoje (KPI) · curva dos últimos 7 dias"
                : isDemoChart
                  ? "Curva abaixo é apenas visual"
                  : "Últimos 7 dias"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
          {ranges.map((p) => {
            const disabled = p !== "7D";
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                title={disabled ? "Período em breve" : undefined}
                onClick={() => {
                  if (!disabled) setRange(p);
                }}
                className={cn(
                  "h-6 rounded px-2.5 text-[11px] font-medium transition-colors",
                  range === p && !disabled
                    ? "bg-card text-foreground shadow-card"
                    : "text-muted-foreground",
                  disabled && "cursor-not-allowed opacity-50",
                  !disabled && range !== p && "hover:text-foreground",
                )}
              >
                {p}
                {disabled ? <span className="sr-only"> (em breve)</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[clamp(150px,24vh,250px)] px-2 pb-2">
        {loading && useLiveData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando faturamento…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={4}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                  boxShadow: "var(--shadow-elevated)",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                labelStyle={{
                  color: "var(--muted-foreground)",
                  fontSize: 11,
                  marginBottom: 2,
                }}
                formatter={(v: number) => [fmt(v), "Faturamento"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={1.75}
                fill="url(#revFill)"
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: "var(--card)",
                  fill: "var(--primary)",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
