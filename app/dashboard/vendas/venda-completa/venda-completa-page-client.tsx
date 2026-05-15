"use client"

import { useRouter } from "next/navigation"
import { VendaCompletaEnterprise } from "@/components/dashboard/vendas/venda-completa-enterprise"

export function VendaCompletaPageClient() {
  const router = useRouter()
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <VendaCompletaEnterprise onBack={() => router.push("/dashboard/vendas-hub")} />
    </div>
  )
}
