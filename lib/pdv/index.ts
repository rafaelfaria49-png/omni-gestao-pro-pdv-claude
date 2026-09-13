export {
  OFFICIAL_PDV_SURFACE_IDS,
  EXPERIMENTAL_PDV_SURFACE_IDS,
  PDV_SURFACE_IDS,
  PDV_BLACK_CLASSIFICATION,
  isOfficialPdvSurfaceId,
  isExperimentalPdvSurfaceId,
  isPdvSurfaceId,
  surfaceIdFromPdvMainLayout,
  surfaceIdFromSwitcherLayouts,
  surfaceIdFromHeldPdvType,
} from "@/lib/pdv/surface-ids"
export type {
  OfficialPdvSurfaceId,
  ExperimentalPdvSurfaceId,
  PdvSurfaceId,
  LegacyHeldPdvType,
} from "@/lib/pdv/surface-ids"

export {
  CAPABILITIES_RUNTIME_VERSION,
  parseOverrideEnabled,
} from "@/lib/pdv/capability-types"
export type {
  CapabilityKey,
  CapabilitySource,
  ResolvedCapability,
  CapabilitiesSnapshot,
  CapabilityOverridesV1,
} from "@/lib/pdv/capability-types"

export {
  PDV_CAPABILITY_SUPPORT_MATRIX,
  isCapabilitySupportedOnSurface,
  canonicalDefaultEnabled,
} from "@/lib/pdv/capability-support-matrix"

export {
  resolveCapability,
  resolveAllKnownCapabilities,
  buildCapabilitiesSnapshot,
  applySnapshotAgainstRuntime,
  combineHoldSnapshotWithRuntime,
  resumeDiscountFields,
  applyDiscountIfEnabled,
  operationalLineDiscountPct,
  canSelectCustomerFromSearch,
  isBlockedCapabilityKey,
  isCapabilityEnabled,
  overridesFromStoreCapabilities,
} from "@/lib/pdv/resolve-capability"

export {
  PDV_REGISTRY,
  PDV_BLACK_REGISTRY_NOTE,
  getPdvRegistryEntry,
  resolveSwitcherSurface,
  listOfficialPdvSurfaces,
} from "@/lib/pdv/pdv-registry"
