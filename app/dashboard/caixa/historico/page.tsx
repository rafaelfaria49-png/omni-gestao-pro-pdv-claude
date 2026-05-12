import { Suspense } from "react"
import { CaixaHistoricoClient } from "@/components/dashboard/caixa/caixa-historico-client"

export const dynamic = "force-dynamic"

export default function CaixaHistoricoPage() {
  return (
    <Suspense fallback={null}>
      <CaixaHistoricoClient />
    </Suspense>
  )
}
