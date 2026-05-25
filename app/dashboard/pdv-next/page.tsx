import { Suspense } from "react"
import { LoadingState } from "@/components/ui/states"
import { PdvBlackEdition } from "@/components/pdv-next/PdvBlackEdition"
import { ModuleEmDesenvolvimento } from "@/components/painel-inicial/ModuleEmDesenvolvimento"
import { experimentalPdvEnabled } from "@/lib/feature-flags"

export default function DashboardPdvNextPage() {
  // Bloqueio operacional: o PDV Next ainda NÃO persiste vendas no banco.
  // Liberado apenas em desenvolvimento (env NEXT_PUBLIC_OG_EXPERIMENTAL=1).
  if (!experimentalPdvEnabled) {
    return (
      <ModuleEmDesenvolvimento
        title="PDV Next (Black Edition) — experimental"
        description="Este PDV ainda não registra as vendas no banco de dados e não deve ser usado em operação real. Use o PDV oficial para vender com segurança."
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
