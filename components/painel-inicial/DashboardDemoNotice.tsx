"use client";

import { Activity } from "lucide-react";

/**
 * Aviso no painel inicial — painel principal consome API elite com dados reais.
 */
export function DashboardDemoNotice() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      </span>
      <span>
        <strong className="text-foreground font-semibold">Painel ao vivo:</strong> Os indicadores, gráficos, atividades, estoque e insights abaixo utilizam dados reais integrados da sua unidade.
      </span>
    </div>
  );
}
