"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";

type Item = {
  sku: string;
  name: string;
  current: number;
  min: number;
  unit: string;
};

const items: Item[] = [
  { sku: "PRD-0231", name: "Cabo HDMI 2.1 — 2m", current: 3, min: 20, unit: "un" },
  { sku: "PRD-0188", name: "Filtro de óleo Bosch", current: 7, min: 15, unit: "un" },
  { sku: "PRD-0412", name: "Tinta toner HP 105A", current: 1, min: 8, unit: "un" },
  { sku: "PRD-0077", name: "Pasta térmica Arctic MX-4", current: 5, min: 12, unit: "un" },
];

export function CriticalStock() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-semibold text-[14px] tracking-tight">
                Atenção Necessária
              </h3>
              <DemoBadge>Exemplo</DemoBadge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {items.length} linhas fictícias — estoque real em Estoque / Cadastros
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded border border-warning/25">
          ESTOQUE
        </span>
      </div>

      <div className="divide-y divide-border flex-1">
        {items.map((it) => {
          const pct = Math.min(100, (it.current / it.min) * 100);
          const critical = pct < 25;
          return (
            <div key={it.sku} className="px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13px] truncate">{it.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {it.sku}
                  </span>
                  <span
                    className={[
                      "text-[10.5px] font-semibold tabular-nums",
                      critical ? "text-destructive" : "text-warning",
                    ].join(" ")}
                  >
                    {it.current}/{it.min} {it.unit}
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={[
                      "h-full rounded-full transition-all",
                      critical ? "bg-destructive" : "bg-warning",
                    ].join(" ")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <button className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-background hover:bg-muted text-[11px] font-medium transition-colors">
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Pedir
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
