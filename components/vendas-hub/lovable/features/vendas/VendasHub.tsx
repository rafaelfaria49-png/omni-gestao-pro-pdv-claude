import type { CSSProperties } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Zap,
  FileText,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Clock,
  Package,
  type LucideIcon,
} from "lucide-react"
import ThemeSwitcher from "./ThemeSwitcher"
import { cn } from "@/lib/utils"

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
  const pathname = usePathname() ?? ""
  const isDashboard = pathname.startsWith("/dashboard/vendas-hub")

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div
      className={cn(
        "bg-background text-foreground flex flex-col transition-smooth",
        isDashboard
          ? "w-full h-full min-h-0 overflow-hidden px-4 py-3.5 sm:px-6 lg:px-8 pb-4"
          : "min-h-screen px-4 py-6 md:px-8 md:py-8"
      )}
    >
      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col">
        {/* Nav superior e Título */}
        <div
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 flex-none",
            isDashboard ? "mb-4 pb-3" : "mb-6 pb-5"
          )}
        >
          <div className="space-y-1.5">
            {!isDashboard && (
              <button
                type="button"
                onClick={handleBack}
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-200"
              >
                <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                Voltar para o Dashboard
              </button>
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Vendas HUB Central
              </h1>
              <p className="mt-1.5 text-xs md:text-sm text-muted-foreground">
                Todas as operações de venda em um único lugar
              </p>
            </div>
          </div>
          <div className="self-end sm:self-auto">
            <ThemeSwitcher compact={isDashboard} />
          </div>
        </div>

        {/* Bento Grid dos Módulos */}
        <div
          className={cn(
            "w-full pr-1 pb-4",
            isDashboard ? "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-elegant" : ""
          )}
        >
          <div
            className={cn(
              "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 w-full",
              isDashboard
                ? "auto-rows-[minmax(115px,auto)] gap-4 md:gap-5"
                : "auto-rows-[minmax(140px,auto)] gap-5 md:gap-6"
            )}
          >
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

            // Grid classes manuais para Tailwind
            let gridClass = "";
            let flexClass = "";
            
            if (isPdvRapido) {
               gridClass = "md:col-span-2 md:row-span-2";
               flexClass = cn("flex-col justify-between", isDashboard ? "p-5 sm:p-6" : "p-6 sm:p-8");
            } else if (isVendaCompleta) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = cn("flex-row items-center", isDashboard ? "gap-4 p-4" : "gap-5 p-5");
            } else if (isOrcamentos) {
               gridClass = "md:col-span-1 md:row-span-1";
               flexClass = cn("flex-col", isDashboard ? "p-4" : "p-5");
            } else if (isHistorico) {
               gridClass = "md:col-span-1 md:row-span-1";
               flexClass = cn("flex-col", isDashboard ? "p-4" : "p-5");
            } else if (isEstoque) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = cn("flex-row items-center", isDashboard ? "gap-4 p-4" : "gap-5 p-5");
            } else if (isRelatorios) {
               gridClass = "md:col-span-2 md:row-span-1";
               flexClass = cn("flex-row items-center", isDashboard ? "gap-4 p-4" : "gap-5 p-5");
            }

            return (
              <a
                key={card.title}
                href={card.dashboardHref}
                className={cn(
                  "group relative rounded-2xl border border-border/80 cursor-pointer transition-smooth hover:-translate-y-0.5 active:scale-[0.99] flex",
                  gridClass,
                  isPdvRapido
                    ? "bg-gradient-to-br from-card to-muted/40 text-foreground shadow-sm"
                    : "bg-card text-foreground shadow-sm"
                )}
              >
                {/* Glow layer em hover para todos os cards */}
                <div 
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 ring-1 ring-inset z-0 border border-primary/20 shadow-elegant"
                  style={{
                    boxShadow: "0 8px 30px -12px var(--primary-glow, rgb(239, 68, 68, 0.25))",
                  }}
                />

                {/* Container Principal do Conteúdo */}
                <div className={`relative z-20 flex w-full h-full ${flexClass}`}>
                  <div className={`flex relative z-20 ${isPdvRapido ? "justify-between w-full" : flexClass.includes("flex-row") ? "items-center" : "mb-4 w-full"}`}>
                    <div
                      className={cn(
                        "relative flex shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105 bg-primary/10 text-primary border border-primary/20",
                        isPdvRapido ? "h-14 w-14 rounded-2xl" : "h-10 w-10 rounded-xl"
                      )}
                    >
                      <Icon className={isPdvRapido ? "h-7 w-7 relative z-10" : "h-5 w-5 relative z-10"} strokeWidth={2} />
                    </div>
                  </div>

                  <div className={cn(
                    "flex-1 min-w-0 relative z-20",
                    isPdvRapido
                      ? (isDashboard ? "mt-auto pt-3" : "mt-auto pt-6")
                      : (flexClass.includes("flex-col") ? "" : "pr-6")
                  )}>
                    <h2 className={cn(
                      "font-semibold tracking-tight truncate text-foreground",
                      isPdvRapido ? "text-xl md:text-2xl mb-1.5" : "text-sm mb-0.5"
                    )}>
                      {card.title}
                    </h2>
                    {card.meta && !isPdvRapido && (
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-1 text-primary/80">
                        {card.meta}
                      </p>
                    )}
                    <p className={cn(
                      "leading-relaxed line-clamp-2 text-muted-foreground",
                      isPdvRapido ? "text-xs mb-4" : "text-[11px] mb-2"
                    )}>
                      {card.description}
                    </p>
                  </div>

                  {!isPdvRapido && (
                    <span
                      className={cn(
                        "relative z-20 inline-flex items-center gap-1 shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all duration-300 bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground",
                        flexClass.includes("flex-row") ? "ml-auto" : "mt-auto self-start"
                      )}
                    >
                      Acessar
                      <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  )}

                  {isPdvRapido && (
                      <div className={cn(
                         "flex items-center justify-between border-t border-border/40 w-full relative z-20",
                         isDashboard ? "mt-3 pt-2.5" : "mt-5 pt-4"
                      )}>
                        <span className="text-xs font-semibold text-foreground">Abrir módulo</span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 transition-transform duration-200 group-hover:translate-x-1">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                     </div>
                  )}
                </div>

                {/* Badge status no canto direito */}
                {(card.badge || statusLabel) && (
                  <div className={isPdvRapido ? "absolute right-5 top-5 z-30" : "absolute right-4 top-4 z-30"}>
                     <span
                       className={cn(
                         "text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                         isBeta 
                           ? "border-amber-500/20 bg-amber-500/10 text-amber-500" 
                           : "border-primary/20 bg-primary/10 text-primary"
                       )}
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
    </div>
  )
}
