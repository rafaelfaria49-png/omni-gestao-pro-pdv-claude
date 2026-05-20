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
import { useState } from "react";

const data = [
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

export function RevenueChart() {
  const [range, setRange] = useState<(typeof ranges)[number]>("7D");
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between p-5 pb-3">
        <div>
          <h3 className="font-display font-semibold text-[14px] tracking-tight">
            Faturamento
          </h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-display font-semibold tabular-nums tracking-tight">
              {fmt(total)}
            </span>
            <span className="text-[11px] text-success font-medium">+12.4%</span>
            <span className="text-[11px] text-muted-foreground">vs. semana anterior</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/50">
          {ranges.map((p) => (
            <button
              key={p}
              onClick={() => setRange(p)}
              className={[
                "px-2.5 h-6 text-[11px] font-medium rounded transition-colors",
                range === p
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="h-60 px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
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
      </div>
    </div>
  );
}
