/**
 * PdvRegistry declarativo (N4).
 *
 * Centraliza surfaceId, status, chave de render do switcher e defaults.
 * `vendas-pdv.tsx` seleciona a superfície através deste registry.
 */

import type { CapabilityKey } from "@/lib/pdv/capability-types"
import { PDV_CAPABILITY_SUPPORT_MATRIX } from "@/lib/pdv/capability-support-matrix"
import {
  EXPERIMENTAL_PDV_SURFACE_IDS,
  OFFICIAL_PDV_SURFACE_IDS,
  PDV_BLACK_CLASSIFICATION,
  type LegacyPdvClassicLayout,
  type LegacyPdvMainLayout,
  type PdvSurfaceId,
  surfaceIdFromSwitcherLayouts,
} from "@/lib/pdv/surface-ids"

export type PdvSurfaceStatus = "official" | "experimental"

export type PdvSwitcherRenderKey =
  | "classic"
  | "assistencia"
  | "supermercado"
  | "next-redirect"
  | "none"

export type PdvRegistryEntry = {
  surfaceId: PdvSurfaceId
  status: PdvSurfaceStatus
  gated: boolean
  layoutKey: LegacyPdvMainLayout | "venda-completa"
  classicLayoutKey?: LegacyPdvClassicLayout
  renderKey: PdvSwitcherRenderKey
  route: string
  capabilityDefaults: Partial<Record<CapabilityKey, boolean>>
  notes: string
}

function defaultsFor(surfaceId: PdvSurfaceId): Partial<Record<CapabilityKey, boolean>> {
  const out: Partial<Record<CapabilityKey, boolean>> = {}
  for (const row of PDV_CAPABILITY_SUPPORT_MATRIX) {
    if (row.supportedBy.includes(surfaceId)) {
      out[row.key] = row.defaultEnabled
    }
  }
  return out
}

export const PDV_REGISTRY: readonly PdvRegistryEntry[] = [
  {
    surfaceId: "classic",
    status: "official",
    gated: false,
    layoutKey: "classic",
    classicLayoutKey: "lovable",
    renderKey: "classic",
    route: "/dashboard/vendas",
    capabilityDefaults: defaultsFor("classic"),
    notes: "MOTOR base de produção. Default do switcher.",
  },
  {
    surfaceId: "assistencia",
    status: "official",
    gated: false,
    layoutKey: "classic",
    classicLayoutKey: "services",
    renderKey: "assistencia",
    route: "/dashboard/vendas",
    capabilityDefaults: defaultsFor("assistencia"),
    notes: "Variante de domínio (classicLayout=services).",
  },
  {
    surfaceId: "supermercado",
    status: "official",
    gated: false,
    layoutKey: "supermercado",
    renderKey: "supermercado",
    route: "/dashboard/vendas",
    capabilityDefaults: defaultsFor("supermercado"),
    notes: "Variante de domínio (pdvMainLayout=supermercado).",
  },
  {
    surfaceId: "venda-completa",
    status: "official",
    gated: false,
    layoutKey: "venda-completa",
    renderKey: "none",
    route: "/dashboard/vendas/venda-completa",
    capabilityDefaults: defaultsFor("venda-completa"),
    notes: "Rota própria. Não participa do switcher de vendas-pdv.",
  },
  {
    surfaceId: "next",
    status: "experimental",
    gated: true,
    layoutKey: "next",
    renderKey: "next-redirect",
    route: "/dashboard/pdv-next",
    capabilityDefaults: defaultsFor("next"),
    notes: "Experimental + gated (NEXT_PUBLIC_OG_EXPERIMENTAL). Black é SHELL, não superfície.",
  },
] as const

export const PDV_BLACK_REGISTRY_NOTE = {
  classification: PDV_BLACK_CLASSIFICATION,
  officialSurface: false,
  parentSurfaceId: "next" as const,
  component: "PdvBlackShell",
}

export function getPdvRegistryEntry(surfaceId: PdvSurfaceId): PdvRegistryEntry {
  const entry = PDV_REGISTRY.find((item) => item.surfaceId === surfaceId)
  if (!entry) {
    throw new Error(`PdvRegistry: superfície desconhecida "${surfaceId}".`)
  }
  return entry
}

export function listOfficialPdvSurfaces(): readonly PdvRegistryEntry[] {
  return PDV_REGISTRY.filter((item) => item.status === "official")
}

export function listExperimentalPdvSurfaces(): readonly PdvRegistryEntry[] {
  return PDV_REGISTRY.filter((item) => item.status === "experimental")
}

export function resolveSwitcherSurface(
  mainLayout: LegacyPdvMainLayout,
  classicLayout: LegacyPdvClassicLayout,
): PdvRegistryEntry {
  const surfaceId = surfaceIdFromSwitcherLayouts(mainLayout, classicLayout)
  return getPdvRegistryEntry(surfaceId)
}

export function officialSurfaceIdsFromRegistry(): PdvSurfaceId[] {
  return listOfficialPdvSurfaces().map((item) => item.surfaceId)
}

export function experimentalSurfaceIdsFromRegistry(): PdvSurfaceId[] {
  return listExperimentalPdvSurfaces().map((item) => item.surfaceId)
}

export function assertRegistryTaxonomy(): void {
  const official = officialSurfaceIdsFromRegistry()
  if (official.join(",") !== OFFICIAL_PDV_SURFACE_IDS.join(",")) {
    throw new Error("PdvRegistry: conjunto oficial diverge de OFFICIAL_PDV_SURFACE_IDS.")
  }
  const experimental = experimentalSurfaceIdsFromRegistry()
  if (experimental.join(",") !== EXPERIMENTAL_PDV_SURFACE_IDS.join(",")) {
    throw new Error("PdvRegistry: conjunto experimental diverge de EXPERIMENTAL_PDV_SURFACE_IDS.")
  }
  if (PDV_REGISTRY.some((item) => item.surfaceId === ("black" as PdvSurfaceId))) {
    throw new Error("PdvRegistry: Black não pode ser superfície.")
  }
}
