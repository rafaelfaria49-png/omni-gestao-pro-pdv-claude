import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { PdvBlackEdition } from "@/components/pdv-next/PdvBlackEdition"
import { ModuleEmDesenvolvimento } from "@/components/painel-inicial/ModuleEmDesenvolvimento"
import { experimentalPdvEnabled } from "@/lib/feature-flags"

export default function DashboardPdvNextPage() {
  // O PDV Next já persiste vendas reais (motor oficial finalizeSaleTransaction);
  // segue experimental por funcionalidades de balcão ainda em desenvolvimento
  // (impressão de cupom, desconto, devolução). Liberado apenas em desenvolvimento
  // (env NEXT_PUBLIC_OG_EXPERIMENTAL=1).
  if (!experimentalPdvEnabled) {
    return (
      <ModuleEmDesenvolvimento
        title="PDV Next (Black Edition) — experimental"
        description="Este PDV é operacional e já registra as vendas no banco de dados pelo motor oficial. Segue experimental enquanto recursos de balcão (impressão de cupom, desconto e devolução) estão em desenvolvimento. Para a operação completa, use o PDV oficial."
        links={[{ href: "/dashboard/vendas", label: "Abrir PDV oficial" }]}
      />
    )
  }
  return (
    <Suspense fallback={<LoadingState message="Carregando PDV Black Edition…" />}>
      <PdvBlackEdition />
    </Suspense>
  )
}
