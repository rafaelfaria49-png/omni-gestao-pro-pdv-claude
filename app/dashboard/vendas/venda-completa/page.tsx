import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { VendaCompletaPageClient } from "./venda-completa-page-client"

export default function VendaCompletaPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando Venda Completa…" />}>
      <VendaCompletaPageClient />
    </Suspense>
  )
}
