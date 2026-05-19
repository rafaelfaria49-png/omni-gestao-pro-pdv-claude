import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { PdvBlackEdition } from "@/components/pdv-next/PdvBlackEdition"

export default function DashboardPdvNextPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando PDV Black Edition…" />}>
      <PdvBlackEdition />
    </Suspense>
  )
}
