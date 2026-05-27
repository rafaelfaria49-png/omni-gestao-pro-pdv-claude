"use client";

import { Activity } from "lucide-react";

/**
 * Aviso no painel inicial — painel principal consome API elite com dados reais.
 */
export function DashboardDemoNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border border-l-4 border-l-primary bg-card px-4 py-3 text-sm shadow-soft transition-smooth hover:shadow-card"
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <Activity className="h-3.5 w-3.5" />
      </div>
      <div className="leading-relaxed text-muted-foreground text-xs md:text-sm">
        <span className="font-semibold text-foreground">Painel ao vivo.</span> Com a unidade selecionada, os
        indicadores, gráficos, atividades, estoque e insights operacionais abaixo utilizam dados reais da sua
        operação de forma integrada e segura.
      </div>
    </div>
  );
}
