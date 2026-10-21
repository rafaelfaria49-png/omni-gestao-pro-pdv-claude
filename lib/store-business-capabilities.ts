import type { StoreCapabilitiesV1, CapabilityOverrideValue } from "@/lib/capabilities-persistence-v1"

export const BUSINESS_BRANCHES = {
  padaria: "Padaria / Confeitaria",
  assistencia: "Assistência técnica",
  acessorios: "Acessórios para aparelhos",
  moda: "Moda / Vestuário",
  variedades: "Variedades / Brinquedos",
  agropecuaria: "Agropecuária",
  supermercado: "Supermercado",
  comercio: "Comércio geral",
} as const
export type BusinessBranch = keyof typeof BUSINESS_BRANCHES
export type BusinessPresentation = Partial<{
  productExample: string
  categoryExample: string
  brandExample: string
}>
export type StoreBusinessV1 = {
  primaryBranch?: BusinessBranch
  presentation?: BusinessPresentation
}

/** Um só conjunto de overrides. A seleção de acessórios já existia no V1. */
export const BUSINESS_RESOURCES = [
  { key: "service.technical", label: "Assistência técnica", stage: "operational" },
  { key: "catalog.deviceCompatibility", label: "Compatibilidade com aparelhos", stage: "operational" },
  { key: "pdv.accessoryModelColor", label: "Acessórios para aparelhos", stage: "operational" },
  { key: "catalog.weight", label: "Produtos por peso", stage: "preparation" },
  { key: "catalog.variants", label: "Grade comercial de cor e tamanho", stage: "preparation" },
] as const
export type BusinessResourceKey = (typeof BUSINESS_RESOURCES)[number]["key"]

const PRESETS: Record<BusinessBranch, readonly BusinessResourceKey[]> = {
  padaria: ["catalog.weight"],
  assistencia: ["service.technical", "catalog.deviceCompatibility", "pdv.accessoryModelColor"],
  acessorios: ["catalog.deviceCompatibility", "pdv.accessoryModelColor"],
  moda: ["catalog.variants"],
  variedades: [],
  agropecuaria: ["catalog.weight"],
  supermercado: [],
  comercio: [],
}

export function isBusinessBranch(value: unknown): value is BusinessBranch {
  return typeof value === "string" && Object.hasOwn(BUSINESS_BRANCHES, value)
}

/** Ramo gravado e conhecido. Valor fora do contrato equivale a loja sem ramo (legado). */
export function configuredBusinessBranch(capabilities: StoreCapabilitiesV1 | null | undefined): BusinessBranch | undefined {
  const branch = capabilities?.business?.primaryBranch
  return isBusinessBranch(branch) ? branch : undefined
}

export function legacyBusinessBranch(profile?: string | null): BusinessBranch {
  if (profile === "VARIEDADES") return "variedades"
  if (profile === "SUPERMERCADO") return "supermercado"
  return "assistencia"
}

export function explicitCapabilityEnabled(value: CapabilityOverrideValue | undefined): boolean | undefined {
  if (typeof value === "boolean") return value
  return typeof value?.enabled === "boolean" ? value.enabled : undefined
}

/** Disponibilidade é código entregue; nunca vem de ramo, plano ou payload. */
export function resolveBusinessResource(
  capabilities: StoreCapabilitiesV1 | null | undefined,
  key: BusinessResourceKey,
  legacyProfile?: string | null,
  permitted = true,
) {
  const branch = configuredBusinessBranch(capabilities)
  const legacy = !branch
  const definition = BUSINESS_RESOURCES.find((item) => item.key === key)!
  const suggested = legacy
    ? (key === "catalog.deviceCompatibility" || key === "pdv.accessoryModelColor" ||
        (key === "service.technical" && legacyBusinessBranch(legacyProfile) === "assistencia"))
    : PRESETS[branch].includes(key)
  const explicit = explicitCapabilityEnabled(capabilities?.overrides?.[key])
  const requested = explicit ?? suggested
  return {
    requested,
    enabled: requested && permitted,
    operational: requested && permitted && definition.stage === "operational",
    stage: definition.stage,
    source: explicit === undefined ? (legacy ? "legacy" : "preset") : "explicit",
  }
}

export function businessPresentation(capabilities: StoreCapabilitiesV1 | null | undefined): Required<BusinessPresentation> {
  const bakery = configuredBusinessBranch(capabilities) === "padaria"
  return {
    productExample: bakery ? "Ex.: Pão francês" : "Ex.: Nome da mercadoria",
    categoryExample: bakery ? "Selecione ou crie (ex.: Pães)" : "Selecione ou crie uma categoria",
    brandExample: "Selecione ou crie uma marca",
    ...capabilities?.business?.presentation,
  }
}

export const BUSINESS_SETTINGS_HREF = "/dashboard/configuracoes?sec=geral#ramo-recursos"
