"use client"

import { PdvClassic, type VendasPDVProps } from "./pdv-classic"
import { PdvAssistenciaEnterprise } from "./pdv-assistencia-enterprise"
import { PdvSupermercado } from "./pdv-supermercado"
import { LoadingState } from "@/components/ui/states"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { resolveSwitcherSurface } from "@/lib/pdv/pdv-registry"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"

/**
 * Runtime do PDV: resolução de layout server-first integrada via StoreSettingsProvider.
 * Precedência canônica:
 * 1. Servidor explícito (StoreSettings)
 * 2. Fallback legado scoped da mesma loja
 * 3. Default canônico
 *
 * N4: a superfície é escolhida pelo PdvRegistry a partir dos mesmos layouts.
 */

export function VendasPDV(props: VendasPDVProps) {
  const { storeId, hydrated, pdvMainLayout, pdvClassicLayout } = useStoreSettings()
  const permissions = useEnterprisePermissions()

  if (!storeId || !hydrated) {
    return <LoadingState message="Carregando configurações da unidade…" />
  }

  const authorizedLayout = permissions?.platformAuthority || permissions?.modules?.experiments
    ? pdvMainLayout : permissions?.hubs.operacoes && pdvMainLayout === "assistencia" ? pdvMainLayout : "classic"
  const entry = resolveSwitcherSurface(authorizedLayout, pdvClassicLayout)

  if (entry.renderKey === "next-redirect") {
    return <LoadingState message="Redirecionando para o PDV Next…" />
  }

  if (entry.renderKey === "supermercado") {
    return <PdvSupermercado {...props} />
  }

  if (entry.renderKey === "assistencia") {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <PdvAssistenciaEnterprise isModoRapido={props.isModoRapido ?? false} />
      </div>
    )
  }

  return <PdvClassic {...props} uiShell="omni-smart" />
}
