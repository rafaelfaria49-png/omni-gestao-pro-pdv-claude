"use client"

import { Wallet } from "lucide-react"
import { EmptyState } from "@/components/ui/states"

export default function Page() {
  return (
    <div className="min-w-0 p-6">
      <EmptyState
        icon={Wallet}
        title="Contas a pagar"
        description="Esta tela legada ainda está em preparação. Use o Financeiro HUB para acompanhar despesas e fluxo da unidade."
        primaryHref={{ label: "Abrir Financeiro HUB", href: "/dashboard/financeiro-v2" }}
        dashboardLink
      />
    </div>
  )
}
