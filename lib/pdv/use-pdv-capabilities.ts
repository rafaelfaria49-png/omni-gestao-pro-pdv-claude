"use client"

import { useMemo } from "react"
import { useStoreSettings } from "@/lib/store-settings-provider"
import type { CapabilityKey } from "@/lib/pdv/capability-types"
import type { PdvSurfaceId } from "@/lib/pdv/surface-ids"
import {
  buildCapabilitiesSnapshot,
  isCapabilityEnabled,
  overridesFromStoreCapabilities,
  resolveAllKnownCapabilities,
  resolveCapability,
} from "@/lib/pdv/resolve-capability"

/**
 * Runtime de capabilities da loja ativa para uma superfície.
 * Recalcula quando a loja ou o envelope V1 mudam — sem cache cruzado.
 */
export function usePdvCapabilities(surfaceId: PdvSurfaceId) {
  const { storeId, capabilities, hydrated } = useStoreSettings()

  const overrides = useMemo(
    () => overridesFromStoreCapabilities(capabilities),
    [capabilities],
  )

  const resolved = useMemo(
    () => resolveAllKnownCapabilities(surfaceId, overrides),
    [surfaceId, overrides, storeId],
  )

  const snapshot = useMemo(
    () =>
      buildCapabilitiesSnapshot({
        storeId,
        surfaceId,
        overrides,
      }),
    [storeId, surfaceId, overrides],
  )

  return {
    storeId,
    surfaceId,
    hydrated,
    overrides,
    resolved,
    snapshot,
    isEnabled: (key: CapabilityKey | string) =>
      isCapabilityEnabled(surfaceId, key, overrides),
    resolve: (key: CapabilityKey | string) =>
      resolveCapability({ surfaceId, capabilityKey: key, overrides }),
  }
}
