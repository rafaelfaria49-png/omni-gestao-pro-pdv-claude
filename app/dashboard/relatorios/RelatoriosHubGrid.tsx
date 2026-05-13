"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  ReceiptText,
  Wallet,
  TrendingUp,
  ArrowUpDown,
  Package,
  Users,
  ClipboardList,
  Wrench,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { EnterpriseAccessDenied } from "@/components/enterprise/EnterpriseAccessDenied"

type ReportCard = {
  title: string
  description: string
  href: string
  icon: LucideIcon
  tone: string
  bg: string
  status: "disponivel" | "em_breve"
  /** Se omitido, qualquer utilizador com hub Relatórios vê o cartão. */
  visible?: (p: EnterprisePermissions) => boolean
}

const reports: ReportCard[] = [
  {
    title: "Histórico de Vendas",
    description: "Visualize todas as vendas registradas, busque por cliente ou cupom e acompanhe o faturamento real.",
    href: "/dashboard/vendas-arquivo-geral",
    icon: ReceiptText,
    tone: "text-info",
    bg: "bg-info/10",
    status: "disponivel",
    visible: (p) => p.hubs.vendas,
  },
  {
    title: "Financeiro",
    description: "Contas a receber, contas a pagar, saldo e fluxo de caixa por unidade.",
    href: "/dashboard/financeiro",
    icon: Wallet,
    tone: "text-success",
    bg: "bg-success/10",
    status: "disponivel",
    visible: (p) => p.hubs.financeiro && p.financeiro.view,
  },
  {
    title: "DRE",
    description: "Demonstrativo de resultado do exercício com receitas, despesas e lucro líquido.",
    href: "/dashboard/relatorios/dre",
    icon: TrendingUp,
    tone: "text-purple",
    bg: "bg-purple/10",
    status: "em_breve",
    visible: (p) => p.hubs.financeiro && p.financeiro.view,
  },
  {
    title: "Fluxo de Caixa",
    description: "Entradas e saídas diárias com projeção para os próximos períodos.",
    href: "/dashboard/relatorios/fluxo-caixa",
    icon: ArrowUpDown,
    tone: "text-warning",
    bg: "bg-warning/10",
    status: "em_breve",
    visible: (p) => p.hubs.financeiro && p.financeiro.view,
  },
  {
    title: "Produtos Mais Vendidos",
    description: "Ranking de produtos por quantidade vendida, margem e faturamento.",
    href: "/dashboard/relatorios/produtos",
    icon: Package,
    tone: "text-info",
    bg: "bg-info/10",
    status: "em_breve",
    visible: (p) => p.hubs.cadastros || p.hubs.vendas,
  },
  {
    title: "Clientes",
    description: "Base de clientes, frequência de compra, ticket médio e histórico.",
    href: "/dashboard/relatorios/clientes",
    icon: Users,
    tone: "text-success",
    bg: "bg-success/10",
    status: "em_breve",
    visible: (p) => p.hubs.cadastros || p.hubs.vendas,
  },
  {
    title: "Ordens de Serviço",
    description: "Análise de OS por status, técnico, tempo médio de resolução e faturamento.",
    href: "/dashboard/relatorios/os",
    icon: ClipboardList,
    tone: "text-info",
    bg: "bg-info/10",
    status: "em_breve",
    visible: (p) => p.hubs.operacoes,
  },
  {
    title: "Técnicos",
    description: "Desempenho por técnico: OS concluídas, prazo médio e satisfação do cliente.",
    href: "/dashboard/relatorios/tecnicos",
    icon: Wrench,
    tone: "text-purple",
    bg: "bg-purple/10",
    status: "em_breve",
    visible: (p) => p.hubs.operacoes,
  },
  {
    title: "WhatsApp",
    description: "Volume de conversas, tempo de resposta, atendimentos e campanhas enviadas.",
    href: "/dashboard/relatorios/whatsapp",
    icon: MessageCircle,
    tone: "text-success",
    bg: "bg-success/10",
    status: "em_breve",
    visible: (p) => p.hubs.whatsapp,
  },
]

export function RelatoriosHubGrid() {
  const perms = useEnterprisePermissions()

  const visibleReports = useMemo(() => {
    if (!perms) return reports
    return reports.filter((r) => (r.visible ? r.visible(perms) : true))
  }, [perms])

  if (perms && !perms.hubs.relatorios) {
    return (
      <EnterpriseAccessDenied
        title="Relatórios indisponíveis"
        description="Seu perfil não inclui acesso à central de relatórios. Peça ao administrador se precisar desta área."
      />
    )
  }

  if (visibleReports.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhum relatório corresponde ao seu perfil neste momento.
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visibleReports.map((r) => {
        const Icon = r.icon
        const isAvailable = r.status === "disponivel"
        const card = (
          <div
            className={[
              "group flex flex-col gap-4 rounded-2xl border p-5 transition-all duration-200",
              isAvailable
                ? "border-border bg-card hover:border-primary/30 hover:shadow-card cursor-pointer"
                : "border-border bg-card/50 opacity-70 cursor-default",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${r.bg}`}>
                <Icon className={`h-5 w-5 ${r.tone}`} />
              </div>
              {isAvailable ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  Disponível
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Em breve
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold text-foreground leading-snug">{r.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
            </div>
            {isAvailable && (
              <div className="flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all">
                Acessar relatório
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        )

        return isAvailable ? (
          <Link key={r.title} href={r.href} className="block">
            {card}
          </Link>
        ) : (
          <div key={r.title}>{card}</div>
        )
      })}
    </div>
  )
}
