"use client";

import { AIBadge } from "../AIBadge";
import { BarChart3, FileText, Layers, TrendingUp, TrendingDown, Award, Rocket, Hourglass, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const reports = [
  { title: "Vendas por canal", sub: "30 dias", icon: BarChart3 },
  { title: "DRE simplificado", sub: "Mensal", icon: FileText },
  { title: "Margem por SKU", sub: "Tempo real", icon: Layers },
  { title: "Curva ABC", sub: "90 dias", icon: BarChart3 },
];

const insights = [
  { title: "Produto com queda de vendas", text: "Cadeira Gamer Pro Vermelha · -34% em 14 dias", icon: TrendingDown, tone: "text-destructive bg-destructive/10" },
  { title: "Canal com maior margem", text: "Nuvemshop · 32% líquida média", icon: Award, tone: "text-success bg-success/10" },
  { title: "Marketplace em maior crescimento", text: "Shopee · +47% no trimestre", icon: Rocket, tone: "text-info bg-info/10" },
  { title: "Produto parado há +45 dias", text: "Suporte Monitor Duplo · 0 vendas", icon: Hourglass, tone: "text-warning bg-warning/10" },
];

export function RelatoriosTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl font-bold">Relatórios inteligentes</h2>
          <AIBadge />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Insights consolidados de toda a operação multicanal.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.title}
              onClick={showPendingToast}
              title="Integração pendente"
              className="surface-card surface-card-hover p-5 text-left cursor-not-allowed"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 font-display text-base font-semibold">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.sub}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary">
                Visualizar relatório <TrendingUp className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insights.map((i) => {
          const Icon = i.icon;
          return (
            <div key={i.title} className="surface-card surface-card-hover p-5">
              <div className="flex items-start gap-4">
                <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", i.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-base font-semibold">{i.title}</p>
                    <AIBadge />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="surface-card p-6 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-0 pointer-events-none" style={{ background: "radial-gradient(60% 100% at 0% 50%, hsl(var(--primary)/0.18), transparent 60%)" }} />
        <div className="relative">
          <AIBadge label="IA · Ação recomendada" />
          <h3 className="mt-2 font-display text-lg font-semibold">Gerar relatório executivo com IA</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">A IA consolida vendas, margens e estoque em um PDF pronto para apresentar à diretoria.</p>
        </div>
        <button
          onClick={showPendingToast}
          title="Integração pendente"
          className="relative inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm cursor-not-allowed opacity-80"
        >
          <Sparkles className="h-4 w-4" /> Gerar relatório com IA
        </button>
      </div>
    </div>
  );
}
