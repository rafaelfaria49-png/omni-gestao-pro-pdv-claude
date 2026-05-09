"use client";

import { LayoutDashboard } from "lucide-react"
import { QuickActions } from "@/components/painel-inicial/QuickActions"
import { KpiCard } from "@/components/painel-inicial/KpiCard"
import { RevenueChart } from "@/components/painel-inicial/RevenueChart"
import { CategoryChart } from "@/components/painel-inicial/CategoryChart"
import { AiInsights } from "@/components/painel-inicial/AiInsights"
import { CriticalStock } from "@/components/painel-inicial/CriticalStock"
import { RecentActivityTable } from "@/components/painel-inicial/RecentActivityTable"
import { DashboardDemoNotice } from "@/components/painel-inicial/DashboardDemoNotice"
import { ShoppingCart, Wrench, AlertTriangle, Banknote } from "lucide-react"

export default function DashboardInicioPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Painel Inicial
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
            Visão geral enterprise
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estrutura do painel pronta; métricas ao vivo serão ligadas na próxima etapa de integração.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 backdrop-blur-md">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">OmniGestão</span>
        </div>
      </div>

      <DashboardDemoNotice />

      {/* QuickActions */}
      <QuickActions />

      {/* KPIs — valores ilustrativos desativados até API agregada */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Faturamento" value="—" trend={0} icon={ShoppingCart} hint="Aguardando dados da loja" accent="primary" hideTrend />
        <KpiCard label="Ordens de Serviço" value="—" trend={0} icon={Wrench} hint="Aguardando dados da loja" accent="warning" hideTrend />
        <KpiCard label="Estoque crítico" value="—" trend={0} icon={AlertTriangle} hint="Aguardando dados da loja" accent="destructive" hideTrend />
        <KpiCard label="A receber" value="—" trend={0} icon={Banknote} hint="Aguardando dados da loja" accent="success" hideTrend />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart />
        </div>
        <CategoryChart />
      </div>

      {/* IA insights */}
      <AiInsights />

      {/* Critical + Recent */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CriticalStock />
        <RecentActivityTable />
      </div>
    </div>
  );
}
