"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { useLojaAtiva } from "@/lib/loja-ativa"
import {
  administrationNavItems,
  dashboardNavSections,
  filterDashboardNav,
  hubsNavItems,
  isDashboardRouteActive,
  workspaceNavItems,
  type DashboardNavItem,
} from "@/lib/navigation/dashboard-nav-items"
import { cn } from "@/lib/utils"
import { StoreSwitcher } from "./StoreSwitcher"

function NavLinkRow({ item, path, onNavigate }: { item: DashboardNavItem; path: string; onNavigate: () => void }) {
  const active = isDashboardRouteActive(path, item.to)
  const Icon = item.icon
  return (
    <Link
      href={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-primary/10 text-sidebar-foreground font-semibold"
          : "text-muted-foreground font-medium hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground/85")}
        strokeWidth={active ? 2 : 1.75}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.subtitle ? (
          <span className="block truncate text-[10.5px] font-normal text-muted-foreground/80">
            {item.subtitle}
          </span>
        ) : null}
      </span>
      {item.badge ? (
        <span className="shrink-0 rounded border border-sidebar-border px-1.5 py-[1px] text-[9.5px] font-medium text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

export function MobileNavSheet() {
  const pathname = usePathname()
  const { storesLoaded, lojaAtivaId, lojas } = useLojaAtiva()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const perms = useEnterprisePermissions()
  // A resolução inicial da unidade remonta o workspace de operações. Não aceitar
  // um clique que seria perdido nessa troca, nem abrir itens do contexto anterior.
  const contextReady = storesLoaded && (!!lojaAtivaId || (lojas.length === 0 && perms?.platformAuthority === true))

  const sections = useMemo(() => {
    const workspace = filterDashboardNav(workspaceNavItems, perms)
    const hubs = filterDashboardNav(hubsNavItems, perms)
    const admin = filterDashboardNav(administrationNavItems, perms)
    return dashboardNavSections
      .map((s) => {
        if (s.id === "workspace") return { ...s, items: workspace }
        if (s.id === "hubs") return { ...s, items: hubs }
        if (s.id === "admin") return { ...s, items: admin }
        return s
      })
      .filter((s) => s.items.length > 0)
  }, [perms])

  const path = pathname || ""
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        type="button"
        className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-panel text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Abrir menu de navegação"
        disabled={!ready || !contextReady}
      >
        <Menu className="h-4 w-4" strokeWidth={2} />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0 flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border">
        <SheetHeader className="border-b border-sidebar-border px-4 py-3 text-left">
          <SheetTitle className="text-sm font-semibold text-sidebar-foreground">Navegação</SheetTitle>
          <StoreSwitcher variant="sheet" fallback={null} onSwitched={close} />
        </SheetHeader>
        <nav className="scroll-elegant flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          {sections.map((section) => (
            <div key={section.id} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLinkRow key={item.to} item={item} path={path} onNavigate={close} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
