"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { PanelLeftClose, Pin, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { CollapsibleHoverRail } from "@/components/ui/collapsible-hover-rail";
import { WORKSPACE_OVERLAY_PRIORITY } from "@/lib/workspace-overlay-orchestrator";
import { StoreSwitcher } from "./StoreSwitcher";
import {
  administrationNavItems,
  filterDashboardNav,
  hubsNavItems,
  isDashboardRouteActive,
  workspaceNavItems,
  type DashboardNavItem,
} from "@/lib/navigation/dashboard-nav-items";

/**
 * Classificação discreta de micro-tags da navegação global (sem blocos sólidos gritantes).
 * Preserva integralmente os marcadores operacionais AI, V3, Beta, Legado e Preview.
 */
function navBadgeClasses(badge: string, active: boolean): string {
  const key = badge.trim().toLowerCase();
  if (active) {
    return "border-primary/30 bg-primary/15 text-primary";
  }
  if (key === "ai") {
    return "border-primary/20 bg-primary/10 text-primary";
  }
  if (key === "beta" || key === "v3" || key === "v4") {
    return "border-sidebar-border bg-sidebar-accent/70 text-muted-foreground";
  }
  // Legado, Preview e outros marcadores secundários: contorno discreto sem competir com o título
  return "border-sidebar-border/80 bg-transparent text-muted-foreground/85";
}

export function Sidebar({ focusMode = false }: { focusMode?: boolean }) {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const perms = useEnterprisePermissions();

  const workspaceFiltered = useMemo(() => filterDashboardNav(workspaceNavItems, perms), [perms]);
  const hubsFiltered = useMemo(() => filterDashboardNav(hubsNavItems, perms), [perms]);
  const adminFiltered = useMemo(() => filterDashboardNav(administrationNavItems, perms), [perms]);

  const roleSubtitle = perms?.platformAuthority ? "Admin · Plataforma" : "Acesso da loja";

  const rowClasses = (active: boolean) =>
    cn(
      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[12.5px] leading-snug transition-colors duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 focus-visible:ring-offset-0",
      active
        ? "bg-primary/10 text-sidebar-foreground font-semibold"
        : "text-muted-foreground font-medium hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    );

  const renderRow = (params: {
    to: string;
    label: string;
    subtitle?: string;
    Icon: LucideIcon;
    active: boolean;
    badge?: string;
  }) => {
    const { to, label, subtitle, Icon, active, badge } = params;
    return (
      <Link
        key={to}
        href={to}
        aria-current={active ? "page" : undefined}
        title={subtitle ? `${label} — ${subtitle}` : label}
        className={rowClasses(active)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-primary transition-opacity duration-150",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon
          aria-hidden="true"
          className={cn(
            "h-[15px] w-[15px] shrink-0 transition-colors duration-150",
            active
              ? "text-primary"
              : "text-muted-foreground/85 group-hover:text-sidebar-foreground",
          )}
          strokeWidth={active ? 2 : 1.75}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate tracking-[-0.01em]">{label}</span>
          {subtitle ? (
            <span className="mt-px block truncate text-[10px] font-normal leading-tight text-muted-foreground/80">
              {subtitle}
            </span>
          ) : null}
        </span>
        {badge ? (
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-[1px] text-[9.5px] font-medium leading-tight tracking-[0.02em]",
              navBadgeClasses(badge, active),
            )}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const renderItem = (item: DashboardNavItem) => {
    const path = pathname || "";
    const active = isDashboardRouteActive(path, item.to);
    return renderRow({
      to: item.to,
      label: item.label,
      subtitle: item.subtitle,
      Icon: item.icon,
      active,
      badge: item.badge,
    });
  };

  const sectionLabel = (label: string, first = false) => (
    <div
      className={cn(
        "px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/75",
        first ? "pt-1" : "mt-3 border-t border-sidebar-border/60 pt-3",
      )}
    >
      {label}
    </div>
  );

  if (focusMode) {
    const sections = [
      { label: "Workspace", items: workspaceFiltered },
      { label: "Hubs", items: hubsFiltered },
      { label: "Administração", items: adminFiltered },
    ].filter((section) => section.items.length > 0);

    return (
      <CollapsibleHoverRail
        ariaLabel="Navegação principal"
        compactWidth={56}
        expandedWidth={228}
        overlayId="global-nav"
        overlayGroup="workspace-left"
        priority={WORKSPACE_OVERLAY_PRIORITY["global-nav"]}
        panelClassName="!bg-sidebar"
      >
        {({ expanded, pinned, togglePinned, collapse }) => (
          <div className="flex h-full w-[228px] flex-col text-sidebar-foreground">
            <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-3">
              <button
                type="button"
                onClick={togglePinned}
                aria-label={expanded ? (pinned ? "Desafixar menu" : "Fixar menu aberto") : "Expandir menu"}
                aria-pressed={pinned}
                className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10"
              >
                <Image src="/omni-gestao-pro-icon.svg" alt="OmniGestão" width={16} height={16} className="h-4 w-4" />
              </button>
              <div className={cn("ml-2.5 min-w-0 flex-1 leading-tight transition-opacity", expanded ? "opacity-100" : "opacity-0")}>
                <div className="truncate font-display text-[13px] font-semibold tracking-tight text-sidebar-foreground">
                  OmniGestão Pro
                </div>
                <div className="truncate text-[10.5px] text-muted-foreground">Workspace em foco</div>
              </div>
              {expanded ? (
                <button
                  type="button"
                  onClick={togglePinned}
                  aria-label={pinned ? "Desafixar menu aberto" : "Fixar menu aberto"}
                  aria-pressed={pinned}
                  title={pinned ? "Desafixar" : "Fixar aberto"}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current text-primary")} />
                </button>
              ) : null}
            </div>
            <nav className="scroll-elegant min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
              {sections.map((section, sectionIndex) => (
                <div
                  key={section.label}
                  className={sectionIndex ? "mt-3 border-t border-sidebar-border/60 pt-2.5" : undefined}
                >
                  <div
                    className={cn(
                      "px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/75 transition-opacity",
                      expanded ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {section.label}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isDashboardRouteActive(pathname || "", item.to);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          href={item.to}
                          onClick={collapse}
                          title={!expanded ? item.label : item.subtitle ? `${item.label} — ${item.subtitle}` : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative flex min-h-9 items-center rounded-lg px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                            active
                              ? "bg-primary/10 text-sidebar-foreground font-semibold"
                              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-primary transition-opacity",
                              active ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="grid h-5 w-5 shrink-0 place-items-center">
                            <Icon
                              aria-hidden="true"
                              className={cn("h-[15px] w-[15px]", active ? "text-primary" : "text-muted-foreground")}
                              strokeWidth={active ? 2 : 1.75}
                            />
                          </span>
                          <span className={cn("ml-2.5 min-w-0 flex-1 transition-opacity", expanded ? "opacity-100" : "opacity-0")}>
                            <span className="block truncate text-[12.5px] leading-snug">{item.label}</span>
                            {item.subtitle ? (
                              <span className="block truncate text-[10px] font-normal text-muted-foreground/80">
                                {item.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {expanded && item.badge ? (
                            <span
                              className={cn(
                                "shrink-0 rounded border px-1.5 py-[1px] text-[9.5px] font-medium",
                                navBadgeClasses(item.badge, active),
                              )}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="flex h-10 shrink-0 items-center border-t border-sidebar-border/80 px-4 text-[10.5px] text-muted-foreground">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
              <span className={cn("ml-2.5 whitespace-nowrap transition-opacity", expanded ? "opacity-100" : "opacity-0")}>
                Servidor Conectado
              </span>
            </div>
          </div>
        )}
      </CollapsibleHoverRail>
    );
  }

  return (
    <aside
      aria-hidden={collapsed}
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none overflow-hidden",
        collapsed ? "w-0 border-r-0 opacity-0 pointer-events-none invisible" : "w-[228px] opacity-100",
      )}
    >
      {/* Container interno com largura fixa impede quebra/reajuste de texto durante a transição expandir↔recolher */}
      <div className="flex h-full w-[228px] flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10">
            <Image src="/omni-gestao-pro-icon.svg" alt="OmniGestão Logo" width={16} height={16} className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-display text-[13px] font-semibold tracking-tight text-sidebar-foreground">
              OmniGestão Pro
            </div>
            <StoreSwitcher
              fallback={
                <div className="mt-0.5 truncate text-[10.5px] font-medium text-muted-foreground">
                  {roleSubtitle}
                </div>
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Ocultar menu lateral"
            title="Ocultar menu"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
          >
            <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.9} />
          </button>
        </div>

        <nav className="scroll-elegant min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {sectionLabel("Workspace", true)}
          <div className="space-y-0.5">{workspaceFiltered.map(renderItem)}</div>

          {sectionLabel("Hubs")}
          <div className="space-y-0.5">{hubsFiltered.map(renderItem)}</div>

          {adminFiltered.length > 0 ? (
            <>
              {sectionLabel("Administração")}
              <div className="space-y-0.5">{adminFiltered.map(renderItem)}</div>
            </>
          ) : null}
        </nav>

        <div className="mt-auto flex h-10 shrink-0 items-center justify-between gap-2 border-t border-sidebar-border/80 px-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"
            />
            <span className="truncate text-[10.5px] font-medium text-muted-foreground">
              Servidor Conectado
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/65">v1.2.4</span>
        </div>
      </div>
    </aside>
  );
}
