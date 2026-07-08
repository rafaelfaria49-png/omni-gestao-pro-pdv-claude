import {
  LayoutDashboard,
  Sparkles,
  Megaphone,
  Crown,
  ShoppingCart,
  Activity,
  Wallet,
  Network,
  Settings,
  Store,
  MessageCircle,
  Database,
  Bot,
  History,
  BarChart3,
  ClipboardCheck,
  Calculator,
  type LucideIcon,
} from "lucide-react"
import { financeiroV2Enabled, roadmapHubsEnabled } from "@/lib/feature-flags"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

export type DashboardNavItem = {
  to: string
  label: string
  icon: LucideIcon
  badge?: string
  visible?: (p: EnterprisePermissions) => boolean
  experimental?: boolean
}

export type DashboardNavSection = {
  id: string
  label: string
  items: DashboardNavItem[]
}

export const workspaceNavItems: DashboardNavItem[] = [
  { to: "/dashboard", label: "Painel Inicial", icon: LayoutDashboard },
  {
    to: "/dashboard/ia-mestre",
    label: "IA Mestre",
    icon: Sparkles,
    badge: "AI",
    visible: (p) => p.workspace.iaMestre,
  },
  {
    to: "/dashboard/omni-agent",
    label: "Omni Agent HUB",
    icon: Bot,
    badge: "AI",
    visible: (p) => p.workspace.omniAgent,
  },
]

export const hubsNavItems: DashboardNavItem[] = [
  {
    to: "/dashboard/operacoes-v3",
    label: "Operações HUB",
    icon: Activity,
    badge: "V3",
    visible: (p) => p.hubs.operacoes,
  },
  {
    to: "/dashboard/operacoes-v4-preview",
    label: "Operações V4 · Beta",
    icon: Activity,
    badge: "V4",
    visible: (p) => p.hubs.operacoes,
  },
  {
    to: "/dashboard/operacoes-v2",
    label: "Operações V2",
    icon: Activity,
    badge: "Legado",
    visible: (p) => p.hubs.operacoes,
  },
  {
    to: "/dashboard/marketing-ia",
    label: "Marketing IA",
    icon: Megaphone,
    badge: "AI",
    visible: (p) => p.hubs.marketingIa,
    experimental: true,
  },
  { to: "/dashboard/whatsapp", label: "WhatsApp HUB", icon: MessageCircle, visible: (p) => p.hubs.whatsapp },
  { to: "/dashboard/cadastros-v2", label: "Cadastros HUB", icon: Database, visible: (p) => p.hubs.cadastros },
  {
    to: "/dashboard/estoque/inventario",
    label: "Inventário Assistido",
    icon: ClipboardCheck,
    visible: (p) => p.hubs.cadastros,
  },
  { to: "/dashboard/vendas-hub", label: "Vendas HUB", icon: ShoppingCart, visible: (p) => p.hubs.vendas },
  {
    to: "/dashboard/caixa/historico",
    label: "Histórico de Caixa",
    icon: History,
    visible: (p) => p.hubs.caixaHistorico,
  },
  {
    to: "/dashboard/marketplace",
    label: "Marketplace",
    icon: Store,
    visible: (p) => p.hubs.marketplace,
    experimental: true,
  },
  ...(financeiroV2Enabled
    ? [
        {
          to: "/dashboard/financeiro-v2",
          label: "Financeiro HUB",
          icon: Wallet,
          visible: (p: EnterprisePermissions) => p.hubs.financeiro,
        } satisfies DashboardNavItem,
      ]
    : [
        {
          to: "/dashboard/financeiro",
          label: "Financeiro HUB",
          icon: Wallet,
          visible: (p: EnterprisePermissions) => p.hubs.financeiro,
        } satisfies DashboardNavItem,
      ]),
  {
    to: "/dashboard/contador",
    label: "Contador HUB",
    icon: Calculator,
    badge: "Preview",
    // Contador HUB (interno) é finance-adjacent: reusa a permissão de Financeiro
    // sem tocar no modelo de permissões. Rota nova em /dashboard/contador — NÃO é
    // o portal externo antigo /contador.
    visible: (p) => p.hubs.financeiro,
  },
  {
    to: "/dashboard/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    visible: (p) => p.hubs.relatorios,
  },
]

export const administrationNavItems: DashboardNavItem[] = [
  {
    to: "/dashboard/master-console",
    label: "Master Console",
    icon: Crown,
    visible: (p) => p.admin.masterConsole,
  },
  {
    to: "/dashboard/unidades",
    label: "Gestão da Rede",
    icon: Network,
    visible: (p) => p.admin.unidades,
  },
  {
    to: "/dashboard/configuracoes",
    label: "Configurações",
    icon: Settings,
    visible: (p) => p.admin.configuracoes,
  },
]

export const dashboardNavSections: DashboardNavSection[] = [
  { id: "workspace", label: "Workspace", items: workspaceNavItems },
  { id: "hubs", label: "Hubs", items: hubsNavItems },
  { id: "admin", label: "Administração", items: administrationNavItems },
]

export function filterDashboardNav(
  items: DashboardNavItem[],
  perms: EnterprisePermissions | null,
): DashboardNavItem[] {
  return items.filter((i) => {
    if (i.experimental && !roadmapHubsEnabled) return false
    if (!perms) return true
    return i.visible ? i.visible(perms) : true
  })
}

export function isDashboardRouteActive(path: string, to: string): boolean {
  if (to === "/vendas-hub")
    return path.startsWith("/vendas-hub") || path.startsWith("/dashboard/vendas-hub")
  if (to === "/dashboard/relatorios") return path === to || path.startsWith(`${to}/`)
  return path === to || (to !== "/dashboard" && to !== "/" && path.startsWith(`${to}/`))
}
