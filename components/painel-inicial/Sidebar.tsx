"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
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
  Command,
  Store,
  MessageCircle,
  Database,
  Bot,
  History,
  BarChart3,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import { financeiroV2Enabled, roadmapHubsEnabled } from "@/lib/feature-flags";
import { getEnterprisePermissions, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";

type SubItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  sub?: SubItem[];
  /** Se definido, o item só aparece quando a função retorna true. */
  visible?: (p: EnterprisePermissions) => boolean;
  /** Módulo em roadmap (mock/não operacional): oculto até `roadmapHubsEnabled`. */
  experimental?: boolean;
};

function isRouteActive(path: string, to: string): boolean {
  if (to === "/vendas-hub")
    return path.startsWith("/vendas-hub") || path.startsWith("/dashboard/vendas-hub");
  if (to === "/dashboard/relatorios") return path === to || path.startsWith(`${to}/`);
  return (
    path === to ||
    (to !== "/dashboard" && to !== "/" && path.startsWith(`${to}/`))
  );
}

// ── WORKSPACE ────────────────────────────────────────────────────────────────
const workspaceItems: Item[] = [
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
];

// ── HUBS ─────────────────────────────────────────────────────────────────────
const hubsItems: Item[] = [
  {
    to: "/dashboard/operacoes-v2",
    label: "Operações HUB",
    icon: Activity,
    badge: "Oficial",
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
  { to: "/vendas-hub", label: "Vendas HUB", icon: ShoppingCart, visible: (p) => p.hubs.vendas },
  {
    to: "/dashboard/caixa/historico",
    label: "Histórico de Caixa",
    icon: History,
    visible: (p) => p.hubs.caixaHistorico,
  },
  { to: "/dashboard/marketplace", label: "Marketplace", icon: Store, visible: (p) => p.hubs.marketplace, experimental: true },
  ...(financeiroV2Enabled
    ? [
        {
          to: "/dashboard/financeiro-v2",
          label: "Financeiro HUB",
          icon: Wallet,
          visible: (p: EnterprisePermissions) => p.hubs.financeiro,
        } satisfies Item,
      ]
    : [
        {
          to: "/dashboard/financeiro",
          label: "Financeiro HUB",
          icon: Wallet,
          visible: (p: EnterprisePermissions) => p.hubs.financeiro,
        } satisfies Item,
      ]),
  {
    to: "/dashboard/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    visible: (p) => p.hubs.relatorios,
  },
];

// ── ADMINISTRAÇÃO ─────────────────────────────────────────────────────────────
const administrationItems: Item[] = [
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
];

function filterNav(items: Item[], perms: EnterprisePermissions | null): Item[] {
  return items.filter((i) => {
    // Módulos em roadmap (mock) ficam ocultos até liberar via env de desenvolvimento.
    if (i.experimental && !roadmapHubsEnabled) return false;
    if (!perms) return true;
    return i.visible ? i.visible(perms) : true;
  });
}

// ── Componente ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const perms = useMemo(() => {
    if (status !== "authenticated" || !session?.user?.role) return null;
    return getEnterprisePermissions(session.user.role);
  }, [status, session?.user?.role]);

  const workspaceFiltered = useMemo(() => filterNav(workspaceItems, perms), [perms]);
  const hubsFiltered = useMemo(() => filterNav(hubsItems, perms), [perms]);
  const adminFiltered = useMemo(() => filterNav(administrationItems, perms), [perms]);

  if (collapsed) return null;

  const rowClasses = (active: boolean) =>
    [
      "group relative flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] transition-all duration-200",
      active
        ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/25"
        : "text-muted-foreground hover:text-foreground hover:bg-panel",
    ].join(" ");

  const renderRow = (params: {
    to: string;
    label: string;
    Icon: LucideIcon;
    active: boolean;
    badge?: string;
  }) => {
    const { to, label, Icon, active, badge } = params;
    return (
      <Link key={to} href={to} className={rowClasses(active)}>
        <span
          className={[
            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-primary transition-opacity",
            active ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
        <span
          className={[
            "h-5 w-5 shrink-0 grid place-items-center rounded-md transition-all duration-200",
            active
              ? "bg-primary/20 ring-1 ring-primary/30 text-primary"
              : "bg-muted/60 ring-1 ring-border/40 text-muted-foreground group-hover:bg-background group-hover:ring-border group-hover:text-foreground",
          ].join(" ")}
        >
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <span className="flex-1 truncate tracking-tight">{label}</span>
        {badge && (
          <span
            className={[
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-md tracking-wider",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-foreground/90 text-background",
            ].join(" ")}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const renderItem = (item: Item) => {
    const path = pathname || "";

    if (item.sub?.length) {
      const parentActive = isRouteActive(path, item.to);
      const subActive = item.sub.some((s) => isRouteActive(path, s.to));
      const parentLooksActive = parentActive || subActive;

      return (
        <div key={item.to} className="space-y-1">
          {renderRow({
            to: item.to,
            label: item.label,
            Icon: item.icon,
            active: parentLooksActive,
            badge: item.badge,
          })}
          <div className="ml-3 pl-2.5 space-y-0.5">
            {item.sub.map((sub) => {
              const active = isRouteActive(path, sub.to);
              return renderRow({ to: sub.to, label: sub.label, Icon: sub.icon, active });
            })}
          </div>
        </div>
      );
    }

    const active = isRouteActive(path, item.to);
    return renderRow({ to: item.to, label: item.label, Icon: item.icon, active, badge: item.badge });
  };

  const sectionLabel = (label: string, first = false) => (
    <div
      className={[
        "px-2 pb-0.5 text-[9.5px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/70",
        first ? "" : "pt-2",
      ].join(" ")}
    >
      {label}
    </div>
  );

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-background">
      {/* Brand + collapse button */}
      <div className="h-12 flex items-center gap-2.5 px-3 border-b border-border">
        <div className="h-6 w-6 rounded-md bg-primary grid place-items-center">
          <span className="text-[10px] font-bold text-primary-foreground tracking-tight">OG</span>
        </div>
        <div className="leading-tight min-w-0 flex-1">
          <div className="font-display font-semibold text-[13px] text-sidebar-foreground tracking-tight truncate">
            OmniGestão Pro
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Matriz · Premium
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Ocultar menu lateral"
          title="Ocultar menu"
          className="h-7 w-7 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* Nav — sem scroll: itens compactos cabem em 1 tela */}
      <nav className="flex-1 min-h-0 px-2.5 py-1.5 space-y-0.5">
        {sectionLabel("Workspace", true)}
        <div className="space-y-0.5">{workspaceFiltered.map(renderItem)}</div>

        {sectionLabel("Hubs")}
        <div className="space-y-0.5">{hubsFiltered.map(renderItem)}</div>

        {adminFiltered.length > 0 && (
          <>
            {sectionLabel("Administração")}
            <div className="space-y-0.5">{adminFiltered.map(renderItem)}</div>
          </>
        )}
      </nav>
    </aside>
  );
}
