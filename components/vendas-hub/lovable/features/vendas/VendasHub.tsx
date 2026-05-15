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
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* Nav superior */}
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/vendas"
            className="inline-flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <ThemeSwitcher />
        </div>

        {/* Header */}
        <header className="mb-8 md:mb-10">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-3"
            style={{
              backgroundColor: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
            }}
          >
            <TrendingUp className="h-3 w-3" />
            OmniGestão Pro
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Vendas HUB Central
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] max-w-xl">
            Todas as operações de venda em um único lugar. Escolha o módulo para começar.
          </p>
        </header>

        {/* Card destaque (PDV Rápido) */}
        {cards.filter(c => c.highlight).map((card) => {
          const Icon = card.icon
          return (
            <a
              key={card.title}
              href={card.dashboardHref}
              className="group relative mb-5 flex flex-col sm:flex-row sm:items-center gap-5 rounded-2xl border p-6 overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]"
              style={{
                backgroundColor: "hsl(var(--primary) / 0.06)",
                borderColor: "hsl(var(--primary) / 0.25)",
              }}
            >
              {/* Glow de fundo */}
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-20"
                style={{ background: "hsl(var(--primary))" }}
              />
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: "hsl(var(--primary) / 0.15)" }}
              >
                <Icon className="h-8 w-8" style={{ color: "hsl(var(--primary))" }} strokeWidth={2} />
              </div>
              <div className="relative flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold tracking-tight">{card.title}</h2>
                  <span
                    className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                    }}
                  >
                    {card.badge}
                  </span>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {card.description}
                </p>
              </div>
              <span
                className="relative inline-flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 group-hover:gap-3"
                style={{
                  backgroundColor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                }}
              >
                Abrir PDV
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </a>
          )
        })}

        {/* Grid dos demais cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.filter(c => !c.highlight).map((card) => {
            const Icon = card.icon
            const statusLabel = card.status ? STATUS_LABEL[card.status] : undefined
            const isEmBreve = card.status === "em-breve"
            const isBeta = card.status === "beta"

            const statusStyle: CSSProperties = isEmBreve
              ? { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              : isBeta
              ? { backgroundColor: "hsl(var(--success) / 0.12)", color: "hsl(var(--success))" }
              : { backgroundColor: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))" }

            return (
              <a
                key={card.title}
                href={card.dashboardHref}
                className="group relative flex flex-col rounded-2xl border p-5 cursor-pointer overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
                style={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--card-foreground))",
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: "hsl(var(--primary) / 0.10)" }}
                  >
                    <Icon className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} strokeWidth={2} />
                  </div>
                  {statusLabel && (
                    <span
                      className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full"
                      style={statusStyle}
                    >
                      {statusLabel}
                    </span>
                  )}
                </div>

                <h2 className="text-base font-semibold tracking-tight mb-1">{card.title}</h2>
                {card.meta && (
                  <p className="text-[11px] font-medium mb-1.5" style={{ color: "hsl(var(--primary))" }}>
                    {card.meta}
                  </p>
                )}
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mb-4 flex-1">
                  {card.description}
                </p>

                <span
                  className="inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 group-hover:gap-2.5"
                  style={{
                    backgroundColor: "hsl(var(--primary) / 0.08)",
                    color: "hsl(var(--primary))",
                  }}
                >
                  Acessar
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
