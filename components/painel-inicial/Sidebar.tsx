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
  type LucideIcon,
} from "lucide-react";
import { financeiroV2Enabled } from "@/lib/feature-flags";
import { getEnterprisePermissions, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions";

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
};

function isRouteActive(path: string, to: string): boolean {
  if (to === "/vendas-hub") return path.startsWith("/vendas-hub");
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
    to: "/dashboard/marketing-ia",
    label: "Marketing IA",
    icon: Megaphone,
    badge: "AI",
    visible: (p) => p.hubs.marketingIa,
  },
  { to: "/dashboard/whatsapp", label: "WhatsApp HUB", icon: MessageCircle, visible: (p) => p.hubs.whatsapp },
  {
    to: "/dashboard/operacoes-v2",
    label: "Operações HUB",
    icon: Activity,
    badge: "Novo",
    visible: (p) => p.hubs.operacoes,
  },
  { to: "/dashboard/cadastros-v2", label: "Cadastros HUB", icon: Database, visible: (p) => p.hubs.cadastros },
  { to: "/vendas-hub", label: "Vendas HUB", icon: ShoppingCart, visible: (p) => p.hubs.vendas },
  {
    to: "/dashboard/caixa/historico",
    label: "Histórico de Caixa",
    icon: History,
    visible: (p) => p.hubs.caixaHistorico,
  },
  { to: "/dashboard/marketplace", label: "Marketplace", icon: Store, visible: (p) => p.hubs.marketplace },
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
  if (!perms) return items;
  return items.filter((i) => (i.visible ? i.visible(perms) : true));
}

// ── Componente ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const perms = useMemo(() => {
    if (status !== "authenticated" || !session?.user?.role) return null;
    return getEnterprisePermissions(session.user.role);
  }, [status, session?.user?.role]);

  const workspaceFiltered = useMemo(() => filterNav(workspaceItems, perms), [perms]);
  const hubsFiltered = useMemo(() => filterNav(hubsItems, perms), [perms]);
  const adminFiltered = useMemo(() => filterNav(administrationItems, perms), [perms]);

  const rowClasses = (active: boolean) =>
    [
      "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all duration-200",
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
            "h-7 w-7 shrink-0 grid place-items-center rounded-lg transition-all duration-200",
            active
              ? "bg-primary/20 ring-1 ring-primary/30 text-primary"
              : "bg-muted/60 ring-1 ring-border/40 text-muted-foreground group-hover:bg-background group-hover:ring-border group-hover:text-foreground",
          ].join(" ")}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
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
          <div className="ml-3 pl-3 space-y-0.5">
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
        "px-2.5 pb-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/70",
        first ? "" : "pt-5",
      ].join(" ")}
    >
      {label}
    </div>
  );

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-background">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
        <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
          <span className="text-[11px] font-bold text-primary-foreground tracking-tight">OG</span>
        </div>
        <div className="leading-tight min-w-0">
          <div className="font-display font-semibold text-[13px] text-sidebar-foreground tracking-tight truncate">
            OmniGestão Pro
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Matriz · Premium
          </div>
        </div>
      </div>

      {/* Quick command */}
      <div className="px-3 pt-3">
        <button className="w-full h-9 px-2.5 flex items-center gap-2 rounded-xl border border-sidebar-border bg-background/50 hover:bg-panel hover:shadow-card text-[12px] text-muted-foreground transition-all">
          <Command className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Buscar...</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-background/60">
            ⌘K
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {sectionLabel("Workspace", true)}
        <div className="space-y-1">{workspaceFiltered.map(renderItem)}</div>

        {sectionLabel("Hubs")}
        <div className="space-y-1">{hubsFiltered.map(renderItem)}</div>

        {adminFiltered.length > 0 && (
          <>
            {sectionLabel("Administração")}
            <div className="space-y-1">{adminFiltered.map(renderItem)}</div>
          </>
        )}
      </nav>

      {/* Footer status */}
      <div className="px-3 pb-3">
        <div className="rounded-xl border border-sidebar-border bg-background/50 px-3 py-2.5 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-medium">Sistema operacional</span>
          </div>
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">
            Sessão ativa · status ilustrativo
          </p>
        </div>
      </div>
    </aside>
  );
}
