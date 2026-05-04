import type { CSSProperties } from "react"
import { Link } from "@tanstack/react-router"
import {
  Zap,
  FileText,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
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
  /** Destino real no app Next (fora do SPA do Hub). */
  dashboardHref: string
}

const cards: VendasCard[] = [
  {
    title: "PDV rápido",
    description: "Venda rápida para balcão, caixa e atendimento imediato.",
    icon: Zap,
    badge: "Rápido",
    status: "ativo",
    dashboardHref: "/dashboard/vendas?modo=rapido",
  },
  {
    title: "Venda completa",
    description:
      "Venda detalhada para produtos de maior valor, emissão fiscal e dados completos do cliente.",
    icon: ShoppingCart,
    status: "ativo",
    dashboardHref: "/dashboard/vendas",
  },
  {
    title: "Orçamentos",
    description: "Crie, acompanhe e converta orçamentos em vendas.",
    icon: FileText,
    status: "beta",
    dashboardHref: "/dashboard/orcamentos",
  },
]

const STATUS_LABEL: Record<Status, string> = {
  ativo: "Ativo",
  beta: "Beta",
  "em-breve": "Em breve",
}

export default function VendasHub() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-6 py-10 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-6xl">
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

        <header className="mb-10 md:mb-12">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium mb-4"
            style={{
              backgroundColor: "hsl(var(--primary) / 0.12)",
              color: "hsl(var(--primary))",
            }}
          >
            OmniGestão Pro
          </span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Vendas HUB Central
          </h1>
          <p className="mt-3 text-sm md:text-base text-[hsl(var(--muted-foreground))] max-w-2xl">
            Gerencie todas as operações de venda do OmniGestão Pro em um único lugar.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {cards.map((card) => {
            const Icon = card.icon
            const statusLabel = card.status ? STATUS_LABEL[card.status] : undefined
            const statusTone =
              card.status === "em-breve"
                ? {
                    bg: "hsl(var(--muted))",
                    fg: "hsl(var(--muted-foreground))",
                  }
                : card.status === "beta"
                  ? {
                      bg: "hsl(var(--success) / 0.15)",
                      fg: "hsl(var(--success))",
                    }
                  : {
                      bg: "hsl(var(--primary) / 0.12)",
                      fg: "hsl(var(--primary))",
                    }
            const cardClassName =
              "group relative flex flex-col text-left rounded-2xl p-6 border cursor-pointer overflow-hidden transition-all duration-200 ease-out shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            const cardStyle = {
              backgroundColor: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              borderColor: "hsl(var(--border))",
              ["--tw-ring-color" as string]: "hsl(var(--primary))",
              ["--tw-ring-offset-color" as string]: "hsl(var(--background))",
            } as CSSProperties

            const cardInner = (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: "hsl(var(--primary) / 0.12)" }}
                  >
                    <Icon className="h-6 w-6 text-[hsl(var(--primary))]" strokeWidth={2} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {card.badge && (
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: "hsl(var(--primary) / 0.12)",
                          color: "hsl(var(--primary))",
                        }}
                      >
                        {card.badge}
                      </span>
                    )}
                    {statusLabel && (
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                </div>
                <h2 className="text-lg font-semibold tracking-tight mb-2">{card.title}</h2>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-5 flex-1">
                  {card.description}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 group-hover:gap-2.5"
                  style={{
                    backgroundColor: "hsl(var(--primary) / 0.10)",
                    color: "hsl(var(--primary))",
                  }}
                >
                  Acessar módulo
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </>
            )

            return (
              <a key={card.title} href={card.dashboardHref} className={cardClassName} style={cardStyle}>
                {cardInner}
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
