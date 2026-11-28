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

/**
 * Agrupamento de apresentação (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · VC-00). Não concede nada:
 * só organiza a tela de Ramo e recursos.
 */
export const BUSINESS_RESOURCE_GROUPS = {
  vendas: "Vendas e atendimento",
  produtos: "Produtos e estoque",
  individualizados: "Produtos individualizados",
  assistencia: "Assistência técnica",
  posVenda: "Garantias e pós-venda",
  financeiro: "Financeiro e custos",
  automacao: "Automação",
} as const
export type BusinessResourceGroup = keyof typeof BUSINESS_RESOURCE_GROUPS

/** Módulo contratado (plano) exigido pelo recurso, além da escolha da loja. */
export type BusinessResourceModule = "deviceCatalog" | "operacoes"

type BusinessResourceDefinition = {
  readonly key: string
  readonly label: string
  readonly stage: "operational" | "preparation"
  readonly group: BusinessResourceGroup
  readonly description: string
  /** Recursos que precisam estar operacionais para este operar (dependência real, não sugestão). */
  readonly requires?: readonly string[]
  readonly module?: BusinessResourceModule
}

/** Um só conjunto de overrides. A seleção de acessórios já existia no V1. */
export const BUSINESS_RESOURCES = [
  { key: "service.technical", label: "Assistência técnica", stage: "operational", group: "assistencia", module: "operacoes",
    description: "Ordens de serviço, técnicos, serviços e equipamentos." },
  { key: "catalog.deviceCompatibility", label: "Compatibilidade com aparelhos", stage: "operational", group: "produtos", module: "deviceCatalog",
    description: "Películas e capinhas vinculadas a modelos de aparelho." },
  { key: "pdv.accessoryModelColor", label: "Acessórios para aparelhos", stage: "operational", group: "vendas", module: "deviceCatalog",
    description: "Modelo e cor do acessório informados na venda." },
  // OMNI-APARELHOS-ENDTOEND-001: nunca sugerido por ramo/legado — só liga por escolha explícita da loja.
  { key: "catalog.serializedDevices", label: "Aparelhos por IMEI (compra, venda e garantia)", stage: "operational", group: "individualizados", module: "deviceCatalog",
    description: "Unidade física por IMEI ou número de série, compra de cliente, venda e termo de garantia." },
  { key: "catalog.weight", label: "Produtos por peso", stage: "preparation", group: "produtos",
    description: "Declaração de produto por KG/G no cadastro. Venda fracionada ainda não operacional." },
  { key: "catalog.variants", label: "Grade comercial de cor e tamanho", stage: "preparation", group: "produtos",
    description: "Grade planejada no cadastro. Saldo por variação ainda não operacional." },
  // ── OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 — todos só por escolha explícita (MANUAL_ONLY). ──
  { key: "commercial.refurbishment", label: "Preparação para revenda e custos aplicados", stage: "operational", group: "individualizados",
    module: "deviceCatalog", requires: ["catalog.serializedDevices"],
    description: "Prontuário da unidade: avaliação, peças, mão de obra e frete apropriados sem duplicar despesa." },
  { key: "commercial.historicalCost", label: "Custo histórico congelado na venda", stage: "operational", group: "financeiro",
    module: "deviceCatalog", requires: ["catalog.serializedDevices"],
    description: "Congela o custo da unidade no momento da venda; mudança posterior de custo não altera o lucro histórico." },
  { key: "commercial.implantationMode", label: "Modo de implantação", stage: "operational", group: "financeiro",
    description: "Saldo inicial e materiais já pagos antes do sistema, sem gerar saída financeira no mês atual." },
  { key: "sales.retroactive", label: "Venda retroativa (data efetiva)", stage: "operational", group: "vendas",
    description: "Registra a data efetiva da venda e da entrega com justificativa e permissão; o registro real é imutável." },
  { key: "sales.gifts", label: "Brindes vinculados à venda", stage: "operational", group: "vendas",
    description: "Item entregue sem cobrança, com motivo, baixa de estoque e custo histórico." },
  { key: "sales.quickDeviceRegistration", label: "Cadastro rápido de aparelho durante a venda", stage: "preparation", group: "vendas",
    module: "deviceCatalog", requires: ["catalog.serializedDevices"],
    description: "Cadastrar e vender a unidade na mesma tela. Em preparação." },
  { key: "sales.tradeIn", label: "Usado como parte do pagamento", stage: "preparation", group: "vendas",
    module: "deviceCatalog", requires: ["catalog.serializedDevices"],
    description: "Aquisição do usado compensada na venda. Em preparação: sem contrato transacional publicado." },
  { key: "sales.detailedWarranty", label: "Garantias detalhadas por item", stage: "preparation", group: "posVenda",
    description: "Garantia legal, contratual, de fabricante e de fornecedor por item. Em preparação." },
] as const satisfies readonly BusinessResourceDefinition[]
export type BusinessResourceKey = (typeof BUSINESS_RESOURCES)[number]["key"]

export function businessResourceDefinition(key: BusinessResourceKey): BusinessResourceDefinition {
  return BUSINESS_RESOURCES.find((item) => item.key === key)!
}

/** Módulo contratado exigido para enxergar/usar o recurso (null = nenhum além de Cadastros). */
export function businessResourceModule(key: BusinessResourceKey): BusinessResourceModule | null {
  return (businessResourceDefinition(key) as BusinessResourceDefinition).module ?? null
}

/**
 * Recursos que nenhum ramo nem perfil legado liga: sem escolha explícita ficam desligados e a
 * origem é "manual" (não é "sugestão do ramo"). OMNI-APARELHOS-ENDTOEND-001.
 * Todos os recursos comerciais avançados também (não ativar automaticamente em lojas legadas).
 */
export const MANUAL_ONLY_RESOURCES: ReadonlySet<BusinessResourceKey> = new Set<BusinessResourceKey>([
  "catalog.serializedDevices",
  "commercial.refurbishment",
  "commercial.historicalCost",
  "commercial.implantationMode",
  "sales.retroactive",
  "sales.gifts",
  "sales.quickDeviceRegistration",
  "sales.tradeIn",
  "sales.detailedWarranty",
])
/** explicit = escolha da loja · preset = sugestão do ramo · legacy = loja sem ramo · manual = só por escolha explícita. */
export type BusinessResourceSource = "explicit" | "preset" | "legacy" | "manual"

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

export type ResolvedBusinessResource = {
  requested: boolean
  enabled: boolean
  operational: boolean
  stage: "operational" | "preparation"
  source: BusinessResourceSource
  missing: BusinessResourceKey[]
}

/** Disponibilidade é código entregue; nunca vem de ramo, plano ou payload. */
export function resolveBusinessResource(
  capabilities: StoreCapabilitiesV1 | null | undefined,
  key: BusinessResourceKey,
  legacyProfile?: string | null,
  permitted = true,
): ResolvedBusinessResource {
  const branch = configuredBusinessBranch(capabilities)
  const legacy = !branch
  const definition = businessResourceDefinition(key)
  // Dependência real: um recurso só opera se todos os que ele exige operam (mesma permissão).
  const missing = (definition.requires ?? []).filter((dep) =>
    !resolveBusinessResource(capabilities, dep as BusinessResourceKey, legacyProfile, permitted).operational) as BusinessResourceKey[]
  const suggested = legacy
    ? (key === "catalog.deviceCompatibility" || key === "pdv.accessoryModelColor" ||
        (key === "service.technical" && legacyBusinessBranch(legacyProfile) === "assistencia"))
    : PRESETS[branch].includes(key)
  // Recurso sem sugestão automática: ativação explícita por loja (rollout controlado).
  const manualOnly = MANUAL_ONLY_RESOURCES.has(key)
  const explicit = explicitCapabilityEnabled(capabilities?.overrides?.[key])
  const requested = explicit ?? (manualOnly ? false : suggested)
  const source: BusinessResourceSource = explicit !== undefined ? "explicit" : manualOnly ? "manual" : legacy ? "legacy" : "preset"
  return {
    requested,
    enabled: requested && permitted,
    operational: requested && permitted && definition.stage === "operational" && missing.length === 0,
    stage: definition.stage,
    source,
    /** Dependências que impedem a operação (vazio quando nada falta). */
    missing,
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
