"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardEliteCategoriaSlice } from "@/hooks/use-dashboard-elite";
import { Spinner } from "@/components/ui/spinner";

const SLICE_COLORS = [
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
  "var(--muted-foreground)",
] as const;

const fmtBrl = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);

type ChartSlice = {
  name: string;
  value: number;
  percent: number;
  color: string;
};

type CategoryChartProps = {
  vendasPorCategoria?: DashboardEliteCategoriaSlice[];
  loading?: boolean;
  useLiveData?: boolean;
  hasStore?: boolean;
  error?: string | null;
};

export function CategoryChart({
  vendasPorCategoria,
  loading = false,
  useLiveData = false,
  hasStore = true,
  error = null,
}: CategoryChartProps) {
  const chartSlices = useMemo((): ChartSlice[] | null => {
    if (!useLiveData || !vendasPorCategoria?.length) return null;
    const sum = vendasPorCategoria.reduce((acc, row) => acc + row.total, 0);
    if (sum <= 0) return null;
    return vendasPorCategoria.map((row, idx) => ({
      name: row.name,
      value: row.total,
      percent: +((row.total / sum) * 100).toFixed(1),
      color: SLICE_COLORS[idx % SLICE_COLORS.length],
    }));
  }, [useLiveData, vendasPorCategoria]);

  const total7d = useMemo(() => {
    if (!chartSlices) return null;
    return chartSlices.reduce((acc, s) => acc + s.value, 0);
  }, [chartSlices]);

  const isEmptyLive = useLiveData && !loading && hasStore && !error && !chartSlices?.length;
  const failedLive = useLiveData && !loading && hasStore && Boolean(error);

  return (
    <div className="rounded-lg border border-border bg-card h-full flex flex-col">
      <div className="px-5 py-3.5 border-b border-border">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display font-semibold text-[14px] tracking-tight">Vendas por categoria</h3>
          {useLiveData && !loading && chartSlices?.length ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Ao vivo</span>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {useLiveData
            ? "Participação em faturamento (7D) por categoria do produto nos itens de venda"
            : "Aguardando dados da unidade"}
        </p>
      </div>

      {loading && useLiveData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-muted-foreground" role="status">
          <Spinner className="size-5 text-primary" />
          <p className="text-sm">Carregando categorias…</p>
        </div>
      ) : !hasStore && useLiveData ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          Selecione uma unidade para ver o mix por categoria.
        </div>
      ) : failedLive ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="alert">
          <p className="font-medium text-foreground">Categorias indisponíveis</p>
          <p className="mt-1 text-xs">Atualize o painel para tentar novamente.</p>
        </div>
      ) : isEmptyLive ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          <p className="font-medium text-foreground">Sem vendas categorizadas</p>
          <p className="mt-1 text-xs">
            Não há itens de venda nos últimos 7 dias com valor, ou as categorias dos produtos ainda não estão
            preenchidas.
          </p>
        </div>
      ) : chartSlices ? (
        <div className="flex-1 grid grid-cols-2 gap-2 p-4 items-center min-h-[180px]">
          <div className="h-36 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartSlices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={62}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {chartSlices.map((d) => (
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
                  formatter={(v: number, _name: string, item: { payload?: ChartSlice }) => {
                    const pct = item.payload?.percent ?? 0;
                    return [`${fmtBrl(v)} (${pct}%)`, "Faturamento"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground">7 dias</div>
                <div className="text-[13px] font-display font-semibold tabular-nums text-foreground">
                  {total7d != null ? fmtBrl(total7d) : "—"}
                </div>
              </div>
            </div>
          </div>

          <ul className="space-y-1.5 min-w-0">
            {chartSlices.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-[11.5px] min-w-0">
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: d.color }} />
                <span className="flex-1 truncate text-foreground/90">{d.name}</span>
                <span className="font-mono tabular-nums text-muted-foreground shrink-0">{d.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          Aguardando dados da unidade.
        </div>
      )}
    </div>
  );
}
