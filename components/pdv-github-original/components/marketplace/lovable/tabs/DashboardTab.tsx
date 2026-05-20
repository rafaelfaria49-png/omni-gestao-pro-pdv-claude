"use client";

import { AIBadge } from "../AIBadge";
import { StatusPill } from "../StatusPill";
import { TrendingUp, TrendingDown, ShoppingCart, Receipt, Package, Megaphone, ArrowUpRight, AlertTriangle, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const stats = [
  { label: "Vendas hoje", value: "R$ 28.491", delta: "+18%", up: true, icon: Receipt, hint: "vs. ontem" },
  { label: "Pedidos", value: "127", delta: "+12", up: true, icon: ShoppingCart, hint: "novos hoje" },
  { label: "Ticket médio", value: "R$ 224", delta: "+4%", up: true, icon: Package, hint: "média 7 dias" },
  { label: "Anúncios ativos", value: "1.284", delta: "+22", up: true, icon: Megaphone, hint: "esta semana" },
];

const channels = [
  { name: "Mercado Livre", value: "R$ 124.302", pct: 58, color: "bg-yellow-400" },
  { name: "Shopee", value: "R$ 47.118", pct: 22, color: "bg-orange-500" },
  { name: "Amazon", value: "R$ 29.984", pct: 14, color: "bg-sky-500" },
  { name: "Nuvemshop", value: "R$ 12.847", pct: 6, color: "bg-emerald-500" },
];

const topProducts = [
  { name: "Cadeira Gamer Pro Preta", value: "R$ 18.962", units: 42 },
  { name: "Headset XPro Wireless", value: "R$ 7.176", units: 38 },
  { name: "Teclado Mecânico TKL", value: "R$ 5.681", units: 27 },
  { name: "Mesa Setup RGB 1.40m", value: "R$ 9.889", units: 11 },
];

const insights = [
  { icon: TrendingDown, title: "Queda em Eletrônicos", text: "Vendas caíram 18% esta semana", tone: "warn" as const },
  { icon: Clock, title: "Pico de pedidos às 14h", text: "Aumente equipe técnica entre 13h e 16h", tone: "info" as const },
  { icon: Users, title: "3 clientes em atraso", text: "R$ 12.480 vencidos há +30 dias", tone: "danger" as const },
];

const connections = [
  { name: "Mercado Livre", status: "online" as const, sub: "Última sync há 4 min" },
  { name: "Shopee", status: "warning" as const, sub: "Última sync há 18 min" },
  { name: "Amazon", status: "syncing" as const, sub: "Sincronizando agora..." },
  { name: "Nuvemshop", status: "error" as const, sub: "Precisa reautenticar" },
];

export function DashboardTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="surface-card surface-card-hover p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", s.up ? "stat-delta-up" : "stat-delta-down")}>
                  {s.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {s.delta}
                </span>
              </div>
              <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vendas por canal */}
        <div className="surface-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Vendas por canal</h3>
              <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
            </div>
            <span className="text-xs text-muted-foreground">Total R$ 214.251</span>
          </div>
          <div className="mt-5 space-y-4">
            {channels.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.value} <span className="text-foreground font-semibold">· {c.pct}%</span></span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full", c.color)} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Top produtos</h3>
            <span className="text-xs text-muted-foreground">Hoje</span>
          </div>
          <ul className="mt-4 space-y-3">
            {topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/40 transition-colors">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.units} un.</p>
                </div>
                <span className="text-sm font-semibold">{p.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* IA Insights */}
        <div className="surface-card surface-card-hover p-6 lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 -z-0 opacity-60 pointer-events-none" style={{ background: "radial-gradient(80% 60% at 100% 0%, hsl(var(--primary)/0.12), transparent 60%)" }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold">Insights da IA Mestre</h3>
              <AIBadge />
            </div>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-not-allowed opacity-80"
            >
              Ver tudo <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">IA analisou os últimos 7 dias</p>
          <div className="relative mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {insights.map((i) => {
              const Icon = i.icon;
              const tone =
                i.tone === "warn" ? "text-warning bg-warning/10" :
                i.tone === "danger" ? "text-destructive bg-destructive/10" :
                "text-info bg-info/10";
              return (
                <div key={i.title} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className={cn("inline-grid h-9 w-9 place-items-center rounded-lg", tone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="mt-3 text-sm font-semibold">{i.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{i.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conexões saúde */}
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Saúde das conexões</h3>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <ul className="mt-4 space-y-3">
            {connections.map((c) => (
              <li key={c.name} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.sub}</p>
                </div>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
