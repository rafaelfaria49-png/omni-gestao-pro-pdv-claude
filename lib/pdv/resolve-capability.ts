/**
 * Resolver puro e determinístico de capabilities (N4).
 *
 * Precedência:
 * 1. capability bloqueada (scale / fracionado) → disabled
 * 2. capability não suportada pela superfície → disabled (override não eleva)
 * 3. suportada + override explícito → override
 * 4. suportada sem override → default canônico da superfície
 */

import {
  BLOCKED_CAPABILITY_KEYS_V1,
  KNOWN_CAPABILITY_KEYS_V1,
  type StoreCapabilitiesV1,
} from "@/lib/capabilities-persistence-v1"
import {
  CAPABILITIES_RUNTIME_VERSION,
  parseOverrideEnabled,
  type CapabilitiesSnapshot,
  type CapabilitiesSnapshotEntry,
  type CapabilityOverridesV1,
  type ResolvedCapability,
} from "@/lib/pdv/capability-types"
import {
  canonicalDefaultEnabled,
  isCapabilitySupportedOnSurface,
} from "@/lib/pdv/capability-support-matrix"
import type { PdvSurfaceId } from "@/lib/pdv/surface-ids"

const BLOCKED_SET = new Set<string>(BLOCKED_CAPABILITY_KEYS_V1)

export function isBlockedCapabilityKey(key: string): boolean {
  return BLOCKED_SET.has(key) || key.startsWith("pdv.scale")
}

export type ResolveCapabilityInput = {
  surfaceId: PdvSurfaceId
  capabilityKey: string
  overrides?: CapabilityOverridesV1 | null
}

export function resolveCapability(input: ResolveCapabilityInput): ResolvedCapability {
  const { surfaceId, capabilityKey } = input
  const overrides = input.overrides ?? undefined

  if (isBlockedCapabilityKey(capabilityKey)) {
    return {
      surfaceId,
      capabilityKey,
      supported: false,
      enabled: false,
      source: "blocked",
      version: CAPABILITIES_RUNTIME_VERSION,
    }
  }

  const supported = isCapabilitySupportedOnSurface(capabilityKey, surfaceId)
  if (!supported) {
    return {
      surfaceId,
      capabilityKey,
      supported: false,
      enabled: false,
      source: "unsupported",
      version: CAPABILITIES_RUNTIME_VERSION,
    }
  }

  const overrideVal = overrides?.[capabilityKey as keyof CapabilityOverridesV1]
  const overrideEnabled = parseOverrideEnabled(overrideVal)
  if (overrideEnabled !== undefined) {
    return {
      surfaceId,
      capabilityKey,
      supported: true,
      enabled: overrideEnabled,
      source: "override",
      version: CAPABILITIES_RUNTIME_VERSION,
    }
  }

  return {
    surfaceId,
    capabilityKey,
    supported: true,
    enabled: canonicalDefaultEnabled(capabilityKey, surfaceId),
    source: "default",
    version: CAPABILITIES_RUNTIME_VERSION,
  }
}

export function resolveAllKnownCapabilities(
  surfaceId: PdvSurfaceId,
  overrides?: CapabilityOverridesV1 | null,
): ResolvedCapability[] {
  return KNOWN_CAPABILITY_KEYS_V1.map((capabilityKey) =>
    resolveCapability({ surfaceId, capabilityKey, overrides }),
  )
}

export function resolveBlockedCapabilities(surfaceId: PdvSurfaceId): ResolvedCapability[] {
  return BLOCKED_CAPABILITY_KEYS_V1.map((capabilityKey) =>
    resolveCapability({ surfaceId, capabilityKey }),
  )
}

export function overridesFromStoreCapabilities(
  capabilities: StoreCapabilitiesV1 | null | undefined,
): CapabilityOverridesV1 {
  if (!capabilities || capabilities.version !== 1) return {}
  return capabilities.overrides ?? {}
}

export function buildCapabilitiesSnapshot(input: {
  storeId: string
  surfaceId: PdvSurfaceId
  overrides?: CapabilityOverridesV1 | null
  resolvedAt?: string
}): CapabilitiesSnapshot {
  const resolved = resolveAllKnownCapabilities(input.surfaceId, input.overrides)
  const entries: CapabilitiesSnapshotEntry[] = resolved.map((item) => ({
    key: item.capabilityKey,
    supported: item.supported,
    enabled: item.enabled,
    source: item.source,
  }))
  return {
    version: CAPABILITIES_RUNTIME_VERSION,
    surfaceId: input.surfaceId,
    storeId: input.storeId,
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
    entries,
  }
}

/**
 * Snapshot histórico não pode reativar capability atualmente
 * não suportada, bloqueada ou desabilitada no runtime vivo.
 */
export function applySnapshotAgainstRuntime(
  current: ResolvedCapability,
  snapshotEntry: CapabilitiesSnapshotEntry | undefined,
): { enabled: boolean; elevated: boolean } {
  if (!snapshotEntry) {
    return { enabled: current.enabled, elevated: false }
  }
  if (snapshotEntry.enabled && !current.enabled) {
    return { enabled: false, elevated: true }
  }
  return { enabled: current.enabled && snapshotEntry.enabled, elevated: false }
}

/**
 * Combina snapshot do hold com o runtime vivo.
 * Runtime atual vence: snapshot nunca eleva unsupported/blocked/disabled.
 * Hold legado (sem snapshot) usa só o runtime atual.
 */
export function combineHoldSnapshotWithRuntime(input: {
  surfaceId: PdvSurfaceId
  overrides?: CapabilityOverridesV1 | null
  snapshot?: CapabilitiesSnapshot | null
}): {
  resolved: ResolvedCapability[]
  isEnabled: (key: string) => boolean
} {
  const current = resolveAllKnownCapabilities(input.surfaceId, input.overrides)
  const resolved = current.map((item) => {
    const entry = input.snapshot?.entries.find((e) => e.key === item.capabilityKey)
    const applied = applySnapshotAgainstRuntime(item, entry)
    return { ...item, enabled: applied.enabled }
  })
  return {
    resolved,
    isEnabled: (key: string) =>
      resolved.find((item) => item.capabilityKey === key)?.enabled === true,
  }
}

export function resumeDiscountFields(
  sale: { discountReais?: number; discountPercent?: number },
  discountsEffectivelyEnabled: boolean,
): { discountReais: number; discountPercent: number } {
  if (!discountsEffectivelyEnabled) {
    return { discountReais: 0, discountPercent: 0 }
  }
  return {
    discountReais: sale.discountReais ?? 0,
    discountPercent: sale.discountPercent ?? 0,
  }
}

/** Não aplica novo desconto operacional quando a capability está off. */
export function applyDiscountIfEnabled(
  discountsEnabled: boolean,
  next: number,
  current: number,
): number {
  return discountsEnabled ? next : current
}

/** Resume: desconto de linha só entra no carrinho se efetivamente permitido. */
export function operationalLineDiscountPct(
  stored: number | undefined,
  discountsEffectivelyEnabled: boolean,
): number {
  if (!discountsEffectivelyEnabled) return 0
  return stored ?? 0
}

/** Busca/seleção operacional nova de cliente. Não apaga associação existente. */
export function canSelectCustomerFromSearch(customerSearchEnabled: boolean): boolean {
  return customerSearchEnabled
}

export function isCapabilityEnabled(
  surfaceId: PdvSurfaceId,
  capabilityKey: string,
  overrides?: CapabilityOverridesV1 | null,
): boolean {
  return resolveCapability({ surfaceId, capabilityKey, overrides }).enabled
}
