import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { VendasPageClient } from "./vendas-page-client"

export default function DashboardVendasPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando PDV…" />}>
      <VendasPageClient />
    </Suspense>
  )
}
