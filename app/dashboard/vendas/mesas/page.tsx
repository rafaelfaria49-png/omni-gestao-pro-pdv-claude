import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { MesasPageClient } from "./mesas-page-client"

export default function VendasMesasPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando mesas…" />}>
      <MesasPageClient />
    </Suspense>
  )
}
