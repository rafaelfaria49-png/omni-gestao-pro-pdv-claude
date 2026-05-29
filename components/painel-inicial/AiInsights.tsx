"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wrench,
  Wallet,
  Activity,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { DashboardEliteData } from "@/hooks/use-dashboard-elite";

type InsightTone = "positive" | "negative" | "warning" | "neutral";

type OperationalInsight = {
  id: string;
  icon: LucideIcon;
  tone: InsightTone;
  title: string;
  desc: string;
  priority: number;
};

const toneStyle: Record<InsightTone, string> = {
  positive: "bg-success/10 text-success ring-success/20",
  negative: "bg-destructive/10 text-destructive ring-destructive/20",
  warning: "bg-warning/15 text-warning ring-warning/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};

const fmtBrl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

function compute7dTrend(
  faturamento7d: { day: string; total: number }[],
): { direction: "up" | "down" | "flat"; pct: number } | null {
  if (faturamento7d.length < 4) return null;
  const first = faturamento7d.slice(0, 3).reduce((s, d) => s + d.total, 0);
  const last = faturamento7d.slice(-3).reduce((s, d) => s + d.total, 0);
  if (first <= 0 && last <= 0) return null;
  if (first <= 0) return { direction: "up", pct: 100 };
  const change = ((last - first) / first) * 100;
  if (Math.abs(change) < 5) return { direction: "flat", pct: Math.abs(change) };
  return { direction: change > 0 ? "up" : "down", pct: Math.abs(change) };
}

function buildOperationalInsights(data: DashboardEliteData): OperationalInsight[] {
  const { cards, faturamento7d, movimentos, vendasPorCategoria } = data;
  const out: OperationalInsight[] = [];

  const estoqueZerado = cards.alertaEstoqueCount;
  if (estoqueZerado > 0) {
    out.push({
      id: "estoque-zerado",
      icon: Package,
      tone: "warning",
      title: "Estoque zerado",
      desc:
        estoqueZerado === 1
          ? "1 produto está sem estoque na unidade."
          : `${fmtInt(estoqueZerado)} produtos estão sem estoque na unidade.`,
      priority: 10,
    });
  }

  if (cards.faturamentoHoje <= 0) {
    out.push({
      id: "sem-venda-hoje",
      icon: ShoppingCart,
      tone: "warning",
      title: "Sem vendas hoje",
      desc: "Nenhuma venda registrada hoje para a unidade ativa.",
      priority: 20,
    });
  }

  const total7d = faturamento7d.reduce((s, d) => s + d.total, 0);
  if (total7d <= 0) {
    out.push({
      id: "sem-fat-7d",
      icon: BarChart3,
      tone: "warning",
      title: "Faturamento 7D zerado",
      desc: "Não há vendas registradas nos últimos 7 dias nesta unidade.",
      priority: 25,
    });
  }

  if (cards.contasReceberHoje > 0) {
    out.push({
      id: "receber-hoje",
      icon: Wallet,
      tone: "warning",
      title: "A receber hoje",
      desc: `${fmtBrl(cards.contasReceberHoje)} em títulos pendentes com vencimento hoje.`,
      priority: 30,
    });
  }

  if (cards.osEmAberto > 0) {
    out.push({
      id: "os-abertas",
      icon: Wrench,
      tone: "warning",
      title: "OS em aberto",
      desc:
        cards.osEmAberto === 1
          ? "1 ordem de serviço aguarda andamento (status Aberto ou Em análise)."
          : `${fmtInt(cards.osEmAberto)} ordens de serviço aguardam andamento.`,
      priority: 35,
    });
  }

  const trend = compute7dTrend(faturamento7d);
  if (trend && trend.direction === "down" && trend.pct >= 5) {
    out.push({
      id: "trend-down",
      icon: TrendingDown,
      tone: "negative",
      title: "Queda no faturamento 7D",
      desc: `Os últimos 3 dias somam ~${trend.pct.toFixed(0)}% menos que os 3 dias iniciais da janela.`,
      priority: 40,
    });
  } else if (trend && trend.direction === "up" && trend.pct >= 5) {
    out.push({
      id: "trend-up",
      icon: TrendingUp,
      tone: "positive",
      title: "Alta no faturamento 7D",
      desc: `Os últimos 3 dias somam ~${trend.pct.toFixed(0)}% mais que os 3 dias iniciais da janela.`,
      priority: 50,
    });
  }

  if (vendasPorCategoria.length > 0) {
    const sumCat = vendasPorCategoria.reduce((s, c) => s + c.total, 0);
    const top = vendasPorCategoria[0];
    if (sumCat > 0 && top) {
      const pct = (top.total / sumCat) * 100;
      if (pct >= 25) {
        out.push({
          id: "cat-dominante",
          icon: BarChart3,
          tone: "neutral",
          title: "Categoria em destaque",
          desc: `“${top.name}” representa ${pct.toFixed(0)}% do faturamento em itens (7D).`,
          priority: 55,
        });
      }
    }
  }

  if (movimentos.length === 0) {
    out.push({
      id: "sem-movimentos",
      icon: Activity,
      tone: "neutral",
      title: "Sem movimentações recentes",
      desc: "Nenhuma venda ou OS recente listada no painel para esta unidade.",
      priority: 60,
    });
  } else if (movimentos.length <= 2) {
    out.push({
      id: "poucas-movimentos",
      icon: Activity,
      tone: "neutral",
      title: "Pouca atividade recente",
      desc: `Apenas ${movimentos.length} movimentação(ões) nas últimas entradas do painel.`,
      priority: 65,
    });
  }

  if (cards.osEmAberto === 0 && cards.faturamentoHoje > 0) {
    out.push({
      id: "os-ok",
      icon: CheckCircle2,
      tone: "positive",
      title: "OS em dia",
      desc: "Nenhuma ordem de serviço aberta no momento.",
      priority: 80,
    });
  }

  if (out.length === 0) {
    out.push({
      id: "estavel",
      icon: CheckCircle2,
      tone: "positive",
      title: "Operação estável",
      desc: "Nenhum alerta operacional automático com base nos indicadores atuais.",
      priority: 90,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

type AiInsightsProps = {
  data?: DashboardEliteData | null;
  loading?: boolean;
  useLiveData?: boolean;
  hasStore?: boolean;
  error?: string | null;
};

export function AiInsights({
  data,
  loading = false,
  useLiveData = false,
  hasStore = true,
  error = null,
}: AiInsightsProps) {
  const insights = useMemo(() => {
    if (!useLiveData || !data) return [];
    return buildOperationalInsights(data).slice(0, 3);
  }, [data, useLiveData]);

  const failedLive = useLiveData && !loading && hasStore && Boolean(error);
  const isEmptyLive = useLiveData && !loading && hasStore && !error && data && insights.length === 0;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/20 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-md bg-muted ring-1 ring-border grid place-items-center shrink-0">
            <Activity className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-semibold text-[14px] tracking-tight">Insights operacionais</h3>
              {useLiveData && !loading && data && !error ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Ao vivo</span>
              ) : null}
            </div>
            <p className="text-[10.5px] text-muted-foreground -mt-0.5">
              Regras automáticas sobre os dados do painel — sem IA generativa
            </p>
          </div>
        </div>
      </div>

      {loading && useLiveData ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground" role="status">
          <Spinner className="size-5 text-primary" />
          <span className="text-sm">Analisando indicadores…</span>
        </div>
      ) : !hasStore && useLiveData ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground" role="status">
          Selecione uma unidade para ver os insights operacionais.
        </div>
      ) : failedLive ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground" role="alert">
          <p className="font-medium text-foreground">Insights indisponíveis</p>
          <p className="mt-1 text-xs">Atualize o painel para tentar novamente.</p>
        </div>
      ) : isEmptyLive ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground" role="status">
          Não há dados suficientes para gerar insights neste momento.
        </div>
      ) : useLiveData && insights.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {insights.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.id}
                className="px-4 py-2 flex gap-3 items-start min-w-0"
                role="status"
              >
                <div
                  className={`h-7 w-7 shrink-0 rounded-md grid place-items-center ring-1 ${toneStyle[it.tone]}`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold tracking-tight">{it.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{it.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground" role="status">
          Aguardando dados da unidade.
        </div>
      )}
    </div>
  );
}
