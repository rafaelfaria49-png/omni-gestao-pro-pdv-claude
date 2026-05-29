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
import { EmpresaSetupCard } from "@/components/painel-inicial/EmpresaSetupCard";
import { ShoppingCart, Wrench, AlertTriangle, Banknote } from "lucide-react";
import { useDashboardElite } from "@/hooks/use-dashboard-elite";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { configuracoesSectionHref } from "@/components/configuracoes-v3/features/settings/section-routing";

const fmtBrl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export default function DashboardInicioPage() {
  const { data, loading, error, refresh, hasStore } = useDashboardElite();
  const { storesLoaded, cadastroBasicoIncompleto, lojaAtivaRaw } = useLojaAtiva();
  const live = Boolean(data && !error && hasStore);

  const kpiValue = (n: number | undefined, asMoney: boolean) => {
    if (!hasStore) return "\u2014";
    if (loading) return "\u2026";
    if (error || n === undefined) return "\u2014";
    return asMoney ? fmtBrl(n) : fmtInt(n);
  };

  const hrefEmpresa = configuracoesSectionHref("geral");
  const nomeEmpresa = lojaAtivaRaw?.nomeFantasia?.trim() || "Unidade ativa";

  return (
    <div className="mx-auto w-full max-w-[1600px] min-h-full flex flex-col gap-[clamp(12px,2.2vh,24px)]">
      {/* Primeira Dobra (First Fold) */}
      <div className="flex flex-col gap-[clamp(12px,2.2vh,24px)] min-h-full shrink-0">
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                Painel Inicial
              </p>
              {live && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Ao vivo
                </span>
              )}
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex flex-wrap items-center gap-2.5">
              <span>Vis{"\u00e3"}o geral enterprise</span>
              {storesLoaded && lojaAtivaRaw && !cadastroBasicoIncompleto && (
                <Link
                  href={hrefEmpresa}
                  title="Configurações da empresa"
                  className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-foreground/20 transition-all shadow-sm"
                >
                  <span>{nomeEmpresa}</span>
                  <span className="text-[9px] text-muted-foreground/50 font-normal">· Gerenciar</span>
                </Link>
              )}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground leading-normal">
              Resumo operacional integrado da sua unidade ativa.
            </p>
          </div>
          <div className="hidden items-center gap-2 sm:flex shrink-0">
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

        <div className="shrink-0">
          <DashboardDemoNotice />
        </div>

        <div className="shrink-0">
          <EmpresaSetupCard />
        </div>

        {!hasStore ? (
          <div
            role="status"
            className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground shrink-0"
          >
            Selecione uma unidade no menu superior para carregar os indicadores da opera{"\u00e7"}{"\u00e3"}o.
          </div>
        ) : null}

        {error && hasStore ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground shrink-0"
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

        <div className="shrink-0">
          <QuickActions />
        </div>

        <div className="grid grid-cols-1 gap-[clamp(10px,1.5vh,16px)] sm:grid-cols-2 xl:grid-cols-4 shrink-0">
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

        <div className="grid grid-cols-1 gap-[clamp(12px,2vh,20px)] xl:grid-cols-3 flex-1 min-h-[220px]">
          <div className="xl:col-span-2 flex flex-col h-full [&>div]:flex [&>div]:flex-col [&>div]:h-full [&>div>div:last-child]:flex-grow [&>div>div:last-child]:min-h-0">
            <RevenueChart
              faturamento7d={data?.faturamento7d}
              faturamentoHoje={data?.cards.faturamentoHoje}
              loading={loading && hasStore}
              useLiveData={live}
            />
          </div>
          <div className="flex flex-col h-full">
            <CategoryChart
              vendasPorCategoria={data?.vendasPorCategoria}
              loading={loading && hasStore}
              useLiveData={live}
              hasStore={hasStore}
              error={error}
            />
          </div>
        </div>
      </div>

      {/* Segunda Dobra (Second Fold) */}
      <div className="flex flex-col gap-[clamp(12px,2.2vh,24px)] pb-4 shrink-0">
        <AiInsights
          data={data}
          loading={loading && hasStore}
          useLiveData={live}
          hasStore={hasStore}
          error={error}
        />

        <div className="grid grid-cols-1 gap-[clamp(12px,2vh,20px)] xl:grid-cols-2">
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
    </div>
  );
}
