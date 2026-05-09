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

  const isVendas = pathname?.startsWith("/dashboard/vendas")

  const shell = (
    <AppShell>
      <FirstAccessWizard />
      <div className={isVendas ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-auto pb-24 lg:pb-0"}>
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
