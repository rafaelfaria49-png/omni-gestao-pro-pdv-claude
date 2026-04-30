"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AppOpsProviders } from "@/components/dashboard/app-ops-providers"
import { AccessGate } from "@/components/auth/AccessGate"
import { FirstAccessWizard } from "@/components/onboarding/first-access-wizard"
import { AppShell } from "@/components/painel-inicial/AppShell"

/**
 * Shell compartilhado das rotas `/dashboard/*` (mesma navegação do painel principal em `/`).
 */
export default function DashboardSegmentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

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

  return (
    <AppOpsProviders>
      <AccessGate>
        <AppShell>
          <FirstAccessWizard />
          <div className="flex-1 overflow-auto pb-24 lg:pb-0">{children}</div>
        </AppShell>
      </AccessGate>
    </AppOpsProviders>
  )
}
