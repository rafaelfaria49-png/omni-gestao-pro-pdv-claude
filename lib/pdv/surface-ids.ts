/**
 * IDs canônicos de superfície do PDV (N4).
 *
 * Aditivo: não substitui `PdvMainLayout`, `PdvClassicLayoutKind` nem `HeldSale.pdvType`.
 * Use os adapters abaixo para ler valores legados.
 */

export const OFFICIAL_PDV_SURFACE_IDS = [
  "classic",
  "assistencia",
  "supermercado",
  "venda-completa",
] as const

export type OfficialPdvSurfaceId = (typeof OFFICIAL_PDV_SURFACE_IDS)[number]

/** Next permanece experimental + gated. Não entra no conjunto oficial. */
export const EXPERIMENTAL_PDV_SURFACE_IDS = ["next"] as const

export type ExperimentalPdvSurfaceId = (typeof EXPERIMENTAL_PDV_SURFACE_IDS)[number]

export type PdvSurfaceId = OfficialPdvSurfaceId | ExperimentalPdvSurfaceId

export const PDV_SURFACE_IDS = [...OFFICIAL_PDV_SURFACE_IDS, ...EXPERIMENTAL_PDV_SURFACE_IDS] as const

/**
 * Black é SHELL do Next, não uma quinta superfície oficial.
 * O valor legado `pdvType: "black"` em holds permanece para compatibilidade.
 */
export const PDV_BLACK_CLASSIFICATION = "next-shell" as const

export type PdvBlackClassification = typeof PDV_BLACK_CLASSIFICATION

export type LegacyPdvMainLayout = "classic" | "supermercado" | "next"
export type LegacyPdvClassicLayout = "lovable" | "services"
export type LegacyHeldPdvType = "classic" | "supermercado" | "assistencia" | "black" | "venda-completa"

export function isOfficialPdvSurfaceId(value: string): value is OfficialPdvSurfaceId {
  return (OFFICIAL_PDV_SURFACE_IDS as readonly string[]).includes(value)
}

export function isExperimentalPdvSurfaceId(value: string): value is ExperimentalPdvSurfaceId {
  return (EXPERIMENTAL_PDV_SURFACE_IDS as readonly string[]).includes(value)
}

export function isPdvSurfaceId(value: string): value is PdvSurfaceId {
  return isOfficialPdvSurfaceId(value) || isExperimentalPdvSurfaceId(value)
}

export function isOfficialPdvSurfaceSet(ids: readonly string[]): boolean {
  if (ids.length !== OFFICIAL_PDV_SURFACE_IDS.length) return false
  return OFFICIAL_PDV_SURFACE_IDS.every((id) => ids.includes(id))
}

/** Adapter: layout principal legado → superfície (Next continua experimental). */
export function surfaceIdFromPdvMainLayout(layout: LegacyPdvMainLayout): PdvSurfaceId {
  if (layout === "supermercado") return "supermercado"
  if (layout === "next") return "next"
  return "classic"
}

/**
 * Adapter do switcher `/dashboard/vendas`.
 * `classicLayout=services` seleciona Assistência; `venda-completa` NÃO é sub-layout.
 */
export function surfaceIdFromSwitcherLayouts(
  mainLayout: LegacyPdvMainLayout,
  classicLayout: LegacyPdvClassicLayout,
): PdvSurfaceId {
  if (mainLayout === "next") return "next"
  if (mainLayout === "supermercado") return "supermercado"
  if (classicLayout === "services") return "assistencia"
  return "classic"
}

/** Adapter de `HeldSale.pdvType`. Black mapeia para Next (shell), não vira superfície oficial. */
export function surfaceIdFromHeldPdvType(pdvType: LegacyHeldPdvType): PdvSurfaceId {
  if (pdvType === "black") return "next"
  if (pdvType === "assistencia") return "assistencia"
  if (pdvType === "supermercado") return "supermercado"
  if (pdvType === "venda-completa") return "venda-completa"
  return "classic"
}
