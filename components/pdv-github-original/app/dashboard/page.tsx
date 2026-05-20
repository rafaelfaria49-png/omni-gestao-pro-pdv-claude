"use client";

import { LayoutDashboard } from "lucide-react"
import { QuickActions } from "@/components/painel-inicial/QuickActions"
import { KpiCard } from "@/components/painel-inicial/KpiCard"
import { RevenueChart } from "@/components/painel-inicial/RevenueChart"
import { CategoryChart } from "@/components/painel-inicial/CategoryChart"
import { AiInsights } from "@/components/painel-inicial/AiInsights"
import { CriticalStock } from "@/components/painel-inicial/CriticalStock"
import { RecentActivityTable } from "@/components/painel-inicial/RecentActivityTable"
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
            Acompanhe operações, receita e alertas críticos em tempo real.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 backdrop-blur-md">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">OmniGestão</span>
        </div>
      </div>

      {/* QuickActions */} 
      <QuickActions />

      {/* KPIs */} 
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Faturamento" value="R$ 128.490" trend={12.4} icon={ShoppingCart} hint="Últimos 7 dias" accent="primary" />
        <KpiCard label="Ordens de Serviço" value="38" trend={-3.2} icon={Wrench} hint="Em andamento" accent="warning" />
        <KpiCard label="Estoque crítico" value="12" trend={4.1} icon={AlertTriangle} hint="Abaixo do mínimo" accent="destructive" />
        <KpiCard label="A receber" value="R$ 18.920" trend={2.7} icon={Banknote} hint="Hoje" accent="success" />
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
