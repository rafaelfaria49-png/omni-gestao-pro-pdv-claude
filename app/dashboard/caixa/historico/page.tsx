import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { CaixaHistoricoClient } from "@/components/dashboard/caixa/caixa-historico-client"

export const dynamic = "force-dynamic"

export default function CaixaHistoricoPage() {
  return (
    <Suspense fallback={<LoadingState message="Carregando histórico de caixa…" />}>
      <CaixaHistoricoClient />
    </Suspense>
  )
}
