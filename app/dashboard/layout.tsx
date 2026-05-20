"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { AppOpsProviders } from "@/components/dashboard/app-ops-providers"
import { AccessGate } from "@/components/auth/AccessGate"
import { FirstAccessWizard } from "@/components/onboarding/first-access-wizard"
import { AppShell } from "@/components/painel-inicial/AppShell"

export default function DashboardSegmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  const goToPage = (page: string) => {
    if (page === "dashboard") {
      router.replace("/dashboard")
      return
    }
    router.replace(`/dashboard/${encodeURIComponent(page)}`)
  }

  useEffect(() => {
    const p = pathname || ""
    if (p === "/dashboard/vendas" || p.startsWith("/dashboard/vendas/")) {
      // no-op: sidebar enterprise não colapsa automaticamente
    }
  }, [pathname])

  // Rota isolada: PDV GitHub Original renderiza como mini-app standalone,
  // SEM AppShell (sidebar/topbar), SEM AccessGate, SEM AppOpsProviders.
  // O isolamento visual (CSS / theme / density) é feito no layout próprio
  // dessa rota (`app/dashboard/pdv-github-original/layout.tsx`).
  if (pathname?.startsWith("/dashboard/pdv-github-original")) {
    return <>{children}</>
  }

  const isVendas =
    pathname?.startsWith("/dashboard/vendas") ||
    pathname?.startsWith("/dashboard/pdv-next")

  const shell = (
    <AppShell noPadding={isVendas}>
      <FirstAccessWizard />
      <div
        className={
          isVendas
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden basis-0"
            : "min-h-0 flex-1 overflow-auto pb-24 lg:pb-0"
        }
      >
        {children}
      </div>
    </AppShell>
  )

  return (
    <AppOpsProviders>
      {session ? shell : <AccessGate>{shell}</AccessGate>}
    </AppOpsProviders>
  )
}
