import type { CSSProperties } from "react"
import { Link } from "@tanstack/react-router"
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
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-4 py-6 md:px-8 md:py-8 flex flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col">
        {/* Nav superior e Título */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              to="/vendas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
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

            const cardStyle: CSSProperties = { 
              backgroundColor: "hsl(var(--card) / 0.7)", 
              borderColor: "hsl(var(--primary) / 0.15)", 
              color: "hsl(var(--card-foreground))" 
            };

            return (
              <a
                key={card.title}
                href={card.dashboardHref}
                className={`group relative rounded-[2rem] border cursor-pointer transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] flex ${gridClass} backdrop-blur-xl shadow-sm`}
                style={cardStyle}
              >
                {/* Glow layer em hover para todos os cards (AGORA FORA DO OVERFLOW, BRILHA PARA FORA) */}
                <div 
                  className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100 ring-1 ring-inset z-0"
                  style={{
                    boxShadow: "0 0 40px 5px hsl(var(--primary) / 0.35)",
                    borderColor: "hsl(var(--primary) / 0.5)"
                  }}
                />

                {/* Camada interna COM overflow-hidden para conter a fumaça/borrados do fundo */}
                <div className="pointer-events-none absolute inset-0 rounded-[2rem] overflow-hidden z-0">
                  {/* Fundo sutil com a cor do tema nativamente em todos os cards */}
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.2) 0%, transparent 100%)" }}
                  />

                  {/* Efeito extra de fumaça primária no canto direito para todos */}
                  <div 
                    className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-[60px] opacity-60" 
                    style={{ backgroundColor: "hsl(var(--primary) / 0.15)" }} 
                  />

                  {/* Efeito Glow Extra para PDV Rápido no canto inferior */}
                  {isPdvRapido && (
                    <div 
                      className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full blur-[80px]" 
                      style={{ backgroundColor: "hsl(var(--primary) / 0.20)" }} 
                    />
                  )}
                </div>

                {/* Container Principal do Conteúdo */}
                <div className={`relative z-20 flex w-full h-full ${flexClass}`}>
                  <div className={`flex relative z-20 ${isPdvRapido ? "justify-between w-full" : flexClass.includes("flex-row") ? "items-center" : "mb-4 w-full"}`}>
                    <div
                      className={`relative flex shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-110 ${isPdvRapido ? "h-16 w-16 rounded-2xl" : "h-12 w-12 rounded-xl"}`}
                      style={{
                        backgroundColor: "hsl(var(--primary) / 0.12)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      <Icon className={isPdvRapido ? "h-8 w-8 relative z-10" : "h-6 w-6 relative z-10"} strokeWidth={isPdvRapido ? 1.5 : 2} />
                    </div>
                  </div>

                  <div className={`flex-1 min-w-0 relative z-20 ${isPdvRapido ? "mt-auto pt-8" : flexClass.includes("flex-col") ? "" : "pr-6"}`}>
                    <h2 className={`font-bold tracking-tight truncate ${isPdvRapido ? "text-2xl md:text-3xl mb-2 text-foreground" : "text-[16px] mb-0.5 text-foreground"}`}>
                      {card.title}
                    </h2>
                    {card.meta && !isPdvRapido && (
                      <p className="text-[10px] uppercase tracking-wide font-bold mb-1.5" style={{ color: "hsl(var(--primary) / 0.8)" }}>
                        {card.meta}
                      </p>
                    )}
                    <p className={`leading-relaxed line-clamp-2 ${isPdvRapido ? "text-sm text-[hsl(var(--muted-foreground))] mb-3" : "text-[12px] text-[hsl(var(--muted-foreground))] mb-3"}`}>
                      {card.description}
                    </p>
                  </div>

                  {!isPdvRapido && (
                    <span
                      className={`relative z-20 inline-flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-300 group-hover:gap-2.5 group-hover:bg-[hsl(var(--primary)/0.15)] ${flexClass.includes("flex-row") ? "ml-auto" : "mt-auto self-start"}`}
                      style={{
                        backgroundColor: "hsl(var(--primary) / 0.08)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      Acessar
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  )}

                  {isPdvRapido && (
                     <div className="mt-6 flex items-center justify-between border-t border-[hsl(var(--border)/0.5)] pt-5 w-full relative z-20">
                        <span className="text-sm font-semibold text-foreground">Abrir módulo</span>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] transition-transform duration-300 group-hover:translate-x-2">
                          <ArrowRight className="h-5 w-5" />
                        </div>
                     </div>
                  )}
                </div>

                {/* Bagde status no canto direito para todos os cards garantido */}
                {(card.badge || statusLabel) && (
                  <div className={isPdvRapido ? "absolute right-6 top-6 z-30" : "absolute right-5 top-5 z-30"}>
                     <span
                       className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full shadow-sm"
                       style={statusStyle}
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
