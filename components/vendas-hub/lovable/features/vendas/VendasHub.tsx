import type { CSSProperties } from "react"
import { useRouter } from "next/navigation"
import {
  Zap,
  FileText,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Clock,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import ThemeSwitcher from "./ThemeSwitcher"

type Status = "ativo" | "beta" | "em-breve"

type VendasCard = {
  title: string
  description: string
  icon: LucideIcon
  badge?: string
  status?: Status
  dashboardHref: string
  highlight?: boolean
  meta?: string
}

const cards: VendasCard[] = [
  {
    title: "PDV Rápido",
    description: "Venda rápida para balcão, caixa e atendimento imediato. Teclas de atalho F1–F9.",
    icon: Zap,
    badge: "Rápido",
    status: "ativo",
    dashboardHref: "/dashboard/vendas?modo=rapido",
    highlight: true,
    meta: "Modo balcão",
  },
  {
    title: "Venda Completa",
    description: "Venda detalhada com dados do cliente, nota fiscal e registro completo.",
    icon: ShoppingCart,
    status: "ativo",
    dashboardHref: "/dashboard/vendas/venda-completa",
    meta: "Com NF e cliente",
  },
  {
    title: "Orçamentos",
    description: "Crie, envie e converta orçamentos em vendas com acompanhamento de status.",
    icon: FileText,
    status: "beta",
    dashboardHref: "/dashboard/orcamentos",
    meta: "Beta",
  },
  {
    title: "Histórico de Vendas",
    description: "Consulte todas as vendas registradas com filtros por data, cliente e produto.",
    icon: Clock,
    status: "ativo",
    dashboardHref: "/dashboard/vendas-arquivo-geral",
    meta: "Arquivo geral",
  },
  {
    title: "Estoque",
    description: "Controle de produtos, entradas, saídas e alertas de estoque mínimo.",
    icon: Package,
    status: "ativo",
    dashboardHref: "/dashboard/estoque",
    meta: "Inventário",
  },
  {
    title: "Relatórios",
    description: "Análise de performance, ticket médio, produtos mais vendidos e crescimento.",
    icon: BarChart3,
    status: "ativo",
    dashboardHref: "/dashboard/relatorios",
    meta: "Analytics",
  },
]

const STATUS_LABEL: Record<Status, string> = {
  ativo: "Ativo",
  beta: "Beta",
  "em-breve": "Em breve",
}

export default function VendasHub() {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-4 py-6 md:px-8 md:py-8 flex flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col">
        {/* Nav superior e Título */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-none text-[hsl(var(--foreground))]">
                Vendas HUB Central
              </h1>
              <p className="mt-1 text-xs md:text-sm text-[hsl(var(--muted-foreground))]">
                Todas as operações de venda em um único lugar
              </p>
            </div>
          </div>
          <div className="self-end sm:self-auto">
            <ThemeSwitcher />
          </div>
        </div>

        {/* Bento Grid dos Módulos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 auto-rows-[minmax(140px,auto)] gap-4 md:gap-5 w-full">
          {cards.map((card, index) => {
            const Icon = card.icon;
            // Configurações do Bento Grid
            const isPdvRapido = index === 0;
            const isVendaCompleta = index === 1;
            const isOrcamentos = index === 2;
            const isHistorico = index === 3;
            const isEstoque = index === 4;
            const isRelatorios = index === 5;
            
            const isBeta = card.status === "beta";
            const isEmBreve = card.status === "em-breve";
            const statusLabel = card.status ? STATUS_LABEL[card.status] : undefined;

            const statusStyle: CSSProperties = isEmBreve
              ? { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              : isBeta
              ? { backgroundColor: "hsl(var(--success) / 0.12)", color: "hsl(var(--success))" }
              : { backgroundColor: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))" };

            // Grid classes manuais para Tailwind
            let gridClass = "";
            let flexClass = "";
            
            if (isPdvRapido) {
               gridClass = "md:col-span-2 md:row-span-2";
               flexClass = "flex-col justify-between p-6 sm:p-8";
            } else if (isVendaCompleta) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = "flex-row items-center gap-5 p-5";
            } else if (isOrcamentos) {
               gridClass = "md:col-span-1 md:row-span-1";
               flexClass = "flex-col p-5";
            } else if (isHistorico) {
               gridClass = "md:col-span-1 md:row-span-1";
               flexClass = "flex-col p-5";
            } else if (isEstoque) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = "flex-row items-center gap-5 p-5";
            } else if (isRelatorios) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = "flex-row items-center gap-5 p-5";
            }

            return (
              <a
                key={card.title}
                href={card.dashboardHref}
                className={`group relative rounded-xl border border-border cursor-pointer transition-smooth hover:-translate-y-0.5 active:scale-[0.99] flex ${gridClass} bg-card/70 backdrop-blur-xl text-card-foreground shadow-soft`}
              >
                {/* Glow layer em hover para todos os cards */}
                <div 
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ring-1 ring-inset z-0"
                  style={{
                    boxShadow: "0 8px 30px -12px hsl(var(--primary) / 0.25)",
                    borderColor: "hsl(var(--primary) / 0.3)"
                  }}
                />

                {/* Container Principal do Conteúdo */}
                <div className={`relative z-20 flex w-full h-full ${flexClass}`}>
                  <div className={`flex relative z-20 ${isPdvRapido ? "justify-between w-full" : flexClass.includes("flex-row") ? "items-center" : "mb-4 w-full"}`}>
                    <div
                      className={`relative flex shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105 ${isPdvRapido ? "h-14 w-14 rounded-xl" : "h-10 w-10 rounded-lg"}`}
                      style={{
                        backgroundColor: "hsl(var(--primary) / 0.08)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      <Icon className={isPdvRapido ? "h-7 w-7 relative z-10" : "h-5 w-5 relative z-10"} strokeWidth={2} />
                    </div>
                  </div>

                  <div className={`flex-1 min-w-0 relative z-20 ${isPdvRapido ? "mt-auto pt-6" : flexClass.includes("flex-col") ? "" : "pr-6"}`}>
                    <h2 className={`font-semibold tracking-tight truncate ${isPdvRapido ? "text-xl md:text-2xl mb-1 text-foreground" : "text-sm mb-0.5 text-foreground"}`}>
                      {card.title}
                    </h2>
                    {card.meta && !isPdvRapido && (
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: "hsl(var(--primary) / 0.8)" }}>
                        {card.meta}
                      </p>
                    )}
                    <p className={`leading-relaxed line-clamp-2 ${isPdvRapido ? "text-xs text-muted-foreground mb-3" : "text-[11px] text-muted-foreground mb-2"}`}>
                      {card.description}
                    </p>
                  </div>

                  {!isPdvRapido && (
                    <span
                      className={`relative z-20 inline-flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 group-hover:bg-primary/10 ${flexClass.includes("flex-row") ? "ml-auto" : "mt-auto self-start"}`}
                      style={{
                        backgroundColor: "hsl(var(--muted))",
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      Acessar
                      <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  )}

                  {isPdvRapido && (
                     <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4 w-full relative z-20">
                        <span className="text-xs font-semibold text-foreground">Abrir módulo</span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-200 group-hover:translate-x-1">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                     </div>
                  )}
                </div>

                {/* Badge status no canto direito */}
                {(card.badge || statusLabel) && (
                  <div className={isPdvRapido ? "absolute right-5 top-5 z-30" : "absolute right-4 top-4 z-30"}>
                     <span
                       className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border border-primary/20 bg-primary/10 text-primary"
                     >
                       {card.badge || statusLabel}
                     </span>
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  )
}
