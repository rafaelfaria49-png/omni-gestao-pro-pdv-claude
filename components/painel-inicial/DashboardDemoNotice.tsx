"use client";

/**
 * Aviso no painel inicial: KPIs e widgets ainda não consomem dados ao vivo da loja.
 */
export function DashboardDemoNotice() {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <span className="font-medium text-foreground">Pré-visualização do painel.</span>{" "}
      Indicadores, gráficos e listas abaixo são <span className="text-foreground/90">ilustrativos</span> até a
      integração com os dados reais da sua operação.
    </div>
  );
}
