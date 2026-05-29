"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { PanelLeftClose, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import {
  administrationNavItems,
  filterDashboardNav,
  hubsNavItems,
  isDashboardRouteActive,
  workspaceNavItems,
  type DashboardNavItem,
} from "@/lib/navigation/dashboard-nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const perms = useMemo(() => {
    if (status !== "authenticated" || !session?.user?.role) return null;
    return getEnterprisePermissions(session.user.role);
  }, [status, session?.user?.role]);

  const workspaceFiltered = useMemo(() => filterDashboardNav(workspaceNavItems, perms), [perms]);
  const hubsFiltered = useMemo(() => filterDashboardNav(hubsNavItems, perms), [perms]);
  const adminFiltered = useMemo(() => filterDashboardNav(administrationNavItems, perms), [perms]);

  const rowClasses = (active: boolean) =>
    [
      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] border transition-smooth",
      active
        ? "bg-primary/8 text-primary font-semibold border-primary/15 shadow-soft"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent",
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

  const renderItem = (item: DashboardNavItem) => {
    const path = pathname || "";
    const active = isDashboardRouteActive(path, item.to);
    return renderRow({ to: item.to, label: item.label, Icon: item.icon, active, badge: item.badge });
  };

  const sectionLabel = (label: string, first = false) => (
    <div
      className={[
        "px-2 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground/80",
        first ? "pt-1" : "pt-4",
      ].join(" ")}
    >
      {label}
    </div>
  );

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-border bg-background transition-all duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-0 border-r-0 opacity-0" : "w-56 opacity-100"
      )}
    >
      <div className="h-12 flex items-center gap-2.5 px-3 border-b border-border">
        <div className="h-6 w-6 shrink-0 rounded-md overflow-hidden bg-primary/10 grid place-items-center border border-primary/10">
          <img src="/omni-gestao-pro-icon.svg" alt="OmniGestão Logo" className="h-4 w-4" />
        </div>
        <div className="leading-tight min-w-0 flex-1">
          <div className="font-display font-semibold text-[13px] text-sidebar-foreground tracking-tight truncate">
            OmniGestão Pro
          </div>
          <div className="text-[10px] text-muted-foreground truncate">Matriz · Premium</div>
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

      <nav className="flex-1 min-h-0 px-2.5 py-1.5 space-y-1 overflow-y-auto">
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

      <div className="mt-auto border-t border-border/60 p-3 bg-muted/20 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-medium text-muted-foreground truncate">
              Servidor Conectado
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/50">v1.2.4</span>
        </div>
      </div>
    </aside>
  );
}
