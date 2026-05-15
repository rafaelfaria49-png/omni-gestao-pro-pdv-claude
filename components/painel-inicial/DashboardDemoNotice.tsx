"use client";

/**
 * Aviso no painel inicial — painel principal consome API elite com dados reais.
 */
export function DashboardDemoNotice() {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <span className="font-medium text-foreground">Painel ao vivo.</span> Com a unidade selecionada, os
      indicadores, gráficos, atividades, estoque e insights operacionais abaixo usam dados reais da sua operação
      via API.
    </div>
  );
}
