"use client"

import { useStoreSettings } from "@/lib/store-settings-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import {
  businessPresentation, legacyBusinessBranch, resolveBusinessResource,
  type BusinessResourceKey,
} from "@/lib/store-business-capabilities"

export function useStoreBusiness() {
  const settings = useStoreSettings()
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva()
  const permissions = useEnterprisePermissions()
  const ready = settings.hydrated && settings.storeId === lojaAtivaId
  const capabilities = ready ? settings.capabilities : null
  const profile = lojaAtivaRaw?.storeProfile
  return {
    ...settings,
    ready,
    capabilities,
    branch: capabilities?.business?.primaryBranch ?? legacyBusinessBranch(profile),
    configured: !!capabilities?.business?.primaryBranch,
    legacyProfile: profile,
    presentation: businessPresentation(capabilities),
    canConfigure: permissions?.admin.configuracoes === true,
    resource: (key: BusinessResourceKey) => resolveBusinessResource(
      capabilities, key, profile, ready && (permissions?.hubs.cadastros ?? false),
    ),
  }
}
