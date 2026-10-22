"use client"

import { useStoreSettings } from "@/lib/store-settings-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import {
  businessPresentation, configuredBusinessBranch, legacyBusinessBranch, resolveBusinessResource,
  type BusinessResourceKey,
} from "@/lib/store-business-capabilities"

export function useStoreBusiness() {
  const settings = useStoreSettings()
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva()
  const permissions = useEnterprisePermissions()
  const ready = settings.loaded && settings.storeId === lojaAtivaId
  const capabilities = ready ? settings.capabilities : null
  const profile = lojaAtivaRaw?.storeProfile
  return {
    ...settings,
    ready,
    permissions,
    capabilities,
    branch: configuredBusinessBranch(capabilities) ?? legacyBusinessBranch(profile),
    configured: !!configuredBusinessBranch(capabilities),
    legacyProfile: profile,
    presentation: businessPresentation(capabilities),
    canConfigure: permissions?.admin.configuracoes === true,
    resource: (key: BusinessResourceKey) => resolveBusinessResource(
      capabilities, key, profile, ready && (permissions?.hubs.cadastros ?? false) &&
        (key === "service.technical" ? permissions?.hubs.operacoes === true :
          key === "catalog.deviceCompatibility" || key === "pdv.accessoryModelColor" ? permissions?.modules?.deviceCatalog === true : true),
    ),
  }
}
