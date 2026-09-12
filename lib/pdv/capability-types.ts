/**
 * Contrato runtime de capabilities do PDV (N4).
 *
 * Reutiliza a allowlist V1 do N3 (`KNOWN_CAPABILITY_KEYS_V1`).
 * Sem entitled / plan / license / billing — isso é N7.
 */

import type { CapabilityOverrideValue, KnownCapabilityKeyV1 } from "@/lib/capabilities-persistence-v1"
import type { PdvSurfaceId } from "@/lib/pdv/surface-ids"

export const CAPABILITIES_RUNTIME_VERSION = 1 as const

export type CapabilityKey = KnownCapabilityKeyV1

export type CapabilitySource = "unsupported" | "blocked" | "override" | "default"

export type ResolvedCapability = {
  surfaceId: PdvSurfaceId
  capabilityKey: string
  supported: boolean
  enabled: boolean
  source: CapabilitySource
  version: typeof CAPABILITIES_RUNTIME_VERSION
}

export type CapabilitySupportRow = {
  key: CapabilityKey
  supportedBy: readonly PdvSurfaceId[]
  defaultEnabled: boolean
  integration: string
  notes: string
}

export type CapabilityOverridesV1 = Partial<Record<KnownCapabilityKeyV1, CapabilityOverrideValue>>

export type CapabilitiesSnapshotEntry = {
  key: string
  supported: boolean
  enabled: boolean
  source: CapabilitySource
}

export type CapabilitiesSnapshot = {
  version: typeof CAPABILITIES_RUNTIME_VERSION
  surfaceId: PdvSurfaceId
  storeId: string
  resolvedAt: string
  entries: readonly CapabilitiesSnapshotEntry[]
}

export function parseOverrideEnabled(value: CapabilityOverrideValue | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === "boolean") return value
  if (typeof value.enabled === "boolean") return value.enabled
  return undefined
}
