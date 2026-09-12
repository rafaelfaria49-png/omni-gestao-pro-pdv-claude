"use client"

import { PdvClassic, type VendasPDVProps } from "./pdv-classic"
import { PdvAssistenciaEnterprise } from "./pdv-assistencia-enterprise"
import { PdvSupermercado } from "./pdv-supermercado"
import { LoadingState } from "@/components/ui/states"
import { useStoreSettings } from "@/lib/store-settings-provider"

/**
 * Runtime do PDV: resolução de layout server-first integrada via StoreSettingsProvider.
 * Precedência canônica:
 * 1. Servidor explícito (StoreSettings)
 * 2. Fallback legado scoped da mesma loja
 * 3. Default canônico
 */

export function VendasPDV(props: VendasPDVProps) {
  const { storeId, hydrated, pdvMainLayout, pdvClassicLayout } = useStoreSettings()

  if (!storeId || !hydrated) {
    return <LoadingState message="Carregando configurações da unidade…" />
  }

  if (pdvMainLayout === "next") {
    return <LoadingState message="Redirecionando para o PDV Next…" />
  }

  if (pdvMainLayout === "supermercado") {
    return <PdvSupermercado {...props} />
  }

  if (pdvClassicLayout === "services") {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <PdvAssistenciaEnterprise isModoRapido={props.isModoRapido ?? false} />
      </div>
    )
  }

  return <PdvClassic {...props} uiShell="omni-smart" />
}
