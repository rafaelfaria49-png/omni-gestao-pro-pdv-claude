"use client"

import { useStoreSettings } from "@/lib/store-settings-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"

/**
 * Venda de aparelho no PDV/Venda Completa: recurso ligado na loja + loja com o módulo de
 * catálogo de aparelhos + papel que vende. Diferente do HUB, não exige Cadastros (caixa vende).
 * O servidor revalida tudo (`/api/aparelhos/*` com gate `venda`).
 */
export function useAparelhosVendaHabilitado(): boolean {
  const settings = useStoreSettings()
  const { lojaAtivaId } = useLojaAtiva()
  const permissions = useEnterprisePermissions()
  const ready = settings.loaded && settings.storeId === lojaAtivaId
  if (!ready) return false
  return (
    resolveBusinessResource(settings.capabilities, "catalog.serializedDevices").requested &&
    permissions?.modules?.deviceCatalog === true &&
    permissions?.hubs.vendas === true
  )
}
