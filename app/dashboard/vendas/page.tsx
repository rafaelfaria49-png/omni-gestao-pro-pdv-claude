import { Suspense } from "react"
import { VendasPageClient } from "./vendas-page-client"

export default function DashboardVendasPage() {
  return (
    <Suspense fallback={null}>
      <VendasPageClient />
    </Suspense>
  )
}
