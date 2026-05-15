"use client";

import { LayoutDashboard, RefreshCw } from "lucide-react";
import { QuickActions } from "@/components/painel-inicial/QuickActions";
import { KpiCard } from "@/components/painel-inicial/KpiCard";
import { RevenueChart } from "@/components/painel-inicial/RevenueChart";
import { CategoryChart } from "@/components/painel-inicial/CategoryChart";
import { AiInsights } from "@/components/painel-inicial/AiInsights";
import { CriticalStock } from "@/components/painel-inicial/CriticalStock";
import { RecentActivityTable } from "@/components/painel-inicial/RecentActivityTable";
import { DashboardDemoNotice } from "@/components/painel-inicial/DashboardDemoNotice";
import { ShoppingCart, Wrench, AlertTriangle, Banknote } from "lucide-react";
import { useDashboardElite } from "@/hooks/use-dashboard-elite";
import { Button } from "@/components/ui/button";

const fmtBrl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export default function DashboardInicioPage() {
  const { data, loading, error, refresh, hasStore } = useDashboardElite();
  const live = Boolean(data && !error && hasStore);

  const kpiValue = (n: number | undefined, asMoney: boolean) => {
    if (!hasStore) return "\u2014";
    if (loading) return "\u2026";
    if (error || n === undefined) return "\u2014";
    return asMoney ? fmtBrl(n) : fmtInt(n);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Painel Inicial
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
            Vis{"\u00e3"}o geral enterprise
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumo operacional da unidade ativa — veja o aviso abaixo sobre dados reais e demonstrativos.
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={!hasStore || loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 backdrop-blur-md">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">OmniGest{"\u00e3"}o</span>
          </div>
        </div>
      </div>

      <DashboardDemoNotice />

      {!hasStore ? (
        <div
          role="status"
          className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          Selecione uma unidade no menu superior para carregar os indicadores da opera{"\u00e7"}{"\u00e3"}o.
        </div>
      ) : null}

      {error && hasStore ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground"
        >
          <span>
            N{"\u00e3"}o foi poss{"\u00ed"}vel carregar os indicadores:{" "}
            <span className="text-foreground">{error}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <QuickActions />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Faturamento hoje"
          value={kpiValue(data?.cards.faturamentoHoje, true)}
          trend={0}
          icon={ShoppingCart}
          hint={live ? "Vendas registradas hoje" : hasStore ? "Aguardando dados da loja" : "Selecione a unidade"}
          accent="primary"
          hideTrend
          loading={loading && hasStore}
          statusLabel={live ? "Ao vivo" : undefined}
          hideSpark
        />
        <KpiCard
          label="OS abertas"
          value={kpiValue(data?.cards.osEmAberto, false)}
          trend={0}
          icon={Wrench}
          hint={
            live
              ? "Status Aberto ou Em an\u00e1lise (Prisma)"
              : hasStore
                ? "Aguardando dados da loja"
                : "Selecione a unidade"
          }
          accent="warning"
          hideTrend
          loading={loading && hasStore}
          statusLabel={live ? "Ao vivo" : undefined}
          hideSpark
        />
        <KpiCard
          label={"Estoque cr\u00edtico"}
          value={kpiValue(data?.cards.alertaEstoqueCount, false)}
          trend={0}
          icon={AlertTriangle}
          hint={live ? "Produtos com estoque zerado" : hasStore ? "Aguardando dados da loja" : "Selecione a unidade"}
          accent="destructive"
          hideTrend
          loading={loading && hasStore}
          statusLabel={live ? "Ao vivo" : undefined}
          hideSpark
        />
        <KpiCard
          label="A receber hoje"
          value={kpiValue(data?.cards.contasReceberHoje, true)}
          trend={0}
          icon={Banknote}
          hint={
            live
              ? "T\u00edtulos pendentes com vencimento hoje"
              : hasStore
                ? "Aguardando dados da loja"
                : "Selecione a unidade"
          }
          accent="success"
          hideTrend
          loading={loading && hasStore}
          statusLabel={live ? "Ao vivo" : undefined}
          hideSpark
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart
            faturamento7d={data?.faturamento7d}
            faturamentoHoje={data?.cards.faturamentoHoje}
            loading={loading && hasStore}
            useLiveData={live}
          />
        </div>
        <CategoryChart />
      </div>

      <AiInsights />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CriticalStock
          estoqueCritico={data?.estoqueCritico}
          loading={loading && hasStore}
          useLiveData={hasStore}
          isConnected={live}
          error={error}
          hasStore={hasStore}
        />
        <RecentActivityTable
          movimentos={data?.movimentos}
          loading={loading && hasStore}
          useLiveData={hasStore}
          isConnected={live}
          error={error}
          hasStore={hasStore}
        />
      </div>
    </div>
  );
}
