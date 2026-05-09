"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";

const data = [
  { name: "Eletrônicos", value: 38, color: "var(--primary)" },
  { name: "Serviços", value: 26, color: "var(--success)" },
  { name: "Acessórios", value: 18, color: "var(--warning)" },
  { name: "Peças", value: 12, color: "var(--destructive)" },
  { name: "Outros", value: 6, color: "var(--muted-foreground)" },
];

export function CategoryChart() {
  return (
    <div className="rounded-lg border border-border bg-card h-full flex flex-col">
      <div className="px-5 py-3.5 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display font-semibold text-[14px] tracking-tight">
            Vendas por Categoria
          </h3>
          <DemoBadge>Exemplo</DemoBadge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Distribuição ilustrativa (não reflete vendas reais)
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2 p-4 items-center">
        <div className="h-36 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                formatter={(v: number) => [`${v}%`, "Participação"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Total</div>
              <div className="text-[15px] font-display font-semibold tabular-nums text-muted-foreground">
                —
              </div>
            </div>
          </div>
        </div>

        <ul className="space-y-1.5">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-[11.5px]">
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ background: d.color }}
              />
              <span className="flex-1 truncate text-foreground/90">{d.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {d.value}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
