"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
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

function NavLinkRow({ item, path, onNavigate }: { item: DashboardNavItem; path: string; onNavigate: () => void }) {
  const active = isDashboardRouteActive(path, item.to)
  const Icon = item.icon
  return (
    <Link
      href={item.to}
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/25"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-md",
          active ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

export function MobileNavSheet() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)

  const perms = useMemo(() => {
    if (status !== "authenticated" || !session?.user?.role) return null
    return getEnterprisePermissions(session.user.role)
  }, [status, session?.user?.role])

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
      >
        <Menu className="h-4 w-4" strokeWidth={2} />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-0 flex flex-col">
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="text-sm font-semibold">Navegação</SheetTitle>
        </SheetHeader>
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
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
