"use client";

/**
 * Aviso no painel inicial: separa blocos com dados reais (API elite) dos ainda demonstrativos.
 */
export function DashboardDemoNotice() {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <span className="font-medium text-foreground">Painel em evolução.</span>{" "}
      Com a unidade selecionada,{" "}
      <span className="text-foreground/90">KPIs, faturamento dos últimos 7 dias, atividades recentes e estoque crítico</span>{" "}
      usam dados reais da sua operação via API. O{" "}
      <span className="text-foreground/90">gráfico por categorias</span> e os{" "}
      <span className="text-foreground/90">insights IA</span> abaixo permanecem{" "}
      <span className="font-medium text-foreground">demonstrativos</span> até a próxima fase.
    </div>
  );
}
