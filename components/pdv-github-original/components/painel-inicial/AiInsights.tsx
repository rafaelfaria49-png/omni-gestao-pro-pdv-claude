"use client";

import { Sparkles, TrendingDown, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";

type Insight = {
  icon: typeof TrendingUp;
  tone: "positive" | "negative" | "warning";
  title: string;
  desc: string;
};

const insights: Insight[] = [
  {
    icon: TrendingDown,
    tone: "negative",
    title: "Queda em Eletrônicos",
    desc: "Vendas caíram 18% esta semana vs. semana anterior.",
  },
  {
    icon: TrendingUp,
    tone: "positive",
    title: "Pico de OS às 14h",
    desc: "Aumente equipe técnica entre 13h-16h para reduzir fila.",
  },
  {
    icon: AlertCircle,
    tone: "warning",
    title: "3 clientes em atraso",
    desc: "R$ 12.480 vencidos há +30 dias. Sugiro disparo de cobrança.",
  },
];

const toneStyle = {
  positive: "bg-success/10 text-success ring-success/20",
  negative: "bg-destructive/10 text-destructive ring-destructive/20",
  warning: "bg-warning/15 text-warning ring-warning/25",
};

export function AiInsights() {
  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/15 ring-1 ring-primary/30 grid place-items-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
          </div>
          <div>
            <h3 className="font-display font-semibold text-[14px] tracking-tight">
              Insights da IA Mestre
            </h3>
            <p className="text-[10.5px] text-muted-foreground -mt-0.5">
              Análises automáticas · atualizado há 4 min
            </p>
          </div>
        </div>
        <button className="text-[11.5px] font-medium text-primary hover:underline inline-flex items-center gap-0.5">
          Ver tudo <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {insights.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.title}
              className="group text-left px-4 py-3 hover:bg-muted/40 transition-colors flex gap-3 items-start"
            >
              <div
                className={`h-7 w-7 shrink-0 rounded-md grid place-items-center ring-1 ${toneStyle[it.tone]}`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold tracking-tight">{it.title}</div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {it.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
