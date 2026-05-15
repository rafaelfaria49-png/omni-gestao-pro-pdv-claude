"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";
import type { DashboardEliteEstoqueItem } from "@/hooks/use-dashboard-elite";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

type DemoItem = {
  id: string;
  name: string;
  stock: number;
};

const DEMO_ITEMS: DemoItem[] = [
  { id: "PRD-0231", name: "Cabo HDMI 2.1 — 2m", stock: 0 },
  { id: "PRD-0188", name: "Filtro de óleo Bosch", stock: 2 },
  { id: "PRD-0412", name: "Tinta toner HP 105A", stock: 1 },
];

function stockSeverity(stock: number): {
  labelClass: string;
  barClass: string;
  barWidth: number;
} {
  if (stock <= 0) {
    return {
      labelClass: "text-destructive",
      barClass: "bg-destructive",
      barWidth: 0,
    };
  }
  if (stock <= 3) {
    return {
      labelClass: "text-warning",
      barClass: "bg-warning",
      barWidth: Math.min(100, stock * 25),
    };
  }
  return {
    labelClass: "text-muted-foreground",
    barClass: "bg-muted-foreground/50",
    barWidth: Math.min(100, stock * 15),
  };
}

function shortProductId(id: string): string {
  const s = id.trim();
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 10)}…` : s;
}

type CriticalStockProps = {
  estoqueCritico?: DashboardEliteEstoqueItem[];
  loading?: boolean;
  useLiveData?: boolean;
  showDemoPreview?: boolean;
  hasStore?: boolean;
  error?: string | null;
  isConnected?: boolean;
};

export function CriticalStock({
  estoqueCritico,
  loading = false,
  useLiveData = false,
  showDemoPreview = false,
  hasStore = true,
  error = null,
  isConnected = false,
}: CriticalStockProps) {
  const showDemo = showDemoPreview && !useLiveData && !loading;
  const liveItems = useLiveData ? (estoqueCritico ?? []) : [];
  const isEmptyLive = useLiveData && !loading && hasStore && !error && liveItems.length === 0;
  const failedLive = useLiveData && !loading && hasStore && Boolean(error);
  const rows = showDemo ? DEMO_ITEMS : liveItems;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
      <div className="px-5 py-3.5 flex items-start justify-between gap-3 border-b border-border">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-semibold text-[14px] tracking-tight">Atenção Necessária</h3>
              {showDemo ? <DemoBadge>Exemplo</DemoBadge> : null}
              {isConnected && !loading ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Ao vivo</span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {showDemo
                ? "Pré-visualização — dados fictícios"
                : useLiveData
                  ? "Top 5 com menor saldo na unidade (sem estoque mínimo). KPI superior: só itens zerados."
                  : "Aguardando dados da unidade"}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded border border-warning/25 shrink-0">
          ESTOQUE
        </span>
      </div>

      {loading && useLiveData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-muted-foreground" role="status">
          <Spinner className="size-5 text-primary" />
          <p className="text-sm">Carregando estoque…</p>
        </div>
      ) : !hasStore && useLiveData ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          Selecione uma unidade para ver os produtos com menor saldo.
        </div>
      ) : failedLive ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="alert">
          <p className="font-medium text-foreground">Estoque indisponível</p>
          <p className="mt-1 text-xs">Use &quot;Atualizar&quot; no topo do painel para tentar novamente.</p>
        </div>
      ) : isEmptyLive ? (
        <div className="flex-1 px-5 py-10 text-center text-sm text-muted-foreground" role="status">
          <p className="font-medium text-foreground">Nenhum produto listado</p>
          <p className="mt-1 text-xs">
            Não há itens cadastrados ou todos estão com saldo acima do recorte exibido aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border flex-1">
          {rows.map((it) => {
            const sev = stockSeverity(it.stock);
            return (
              <div key={it.id} className="px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] truncate">{it.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {shortProductId(it.id)}
                    </span>
                    <span className={`text-[10.5px] font-semibold tabular-nums ${sev.labelClass}`}>
                      {it.stock <= 0 ? "Zerado" : `${it.stock} un`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={["h-full rounded-full transition-all", sev.barClass].join(" ")}
                      style={{ width: `${sev.barWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-5 py-3 border-t border-border mt-auto">
        <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
          <Link href="/dashboard/estoque" className="inline-flex items-center justify-center gap-1">
            Ver estoque
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
