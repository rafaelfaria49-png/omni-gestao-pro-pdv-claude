/**
 * Catálogo de Aparelhos (MVP) — tipos do domínio de modelos/aliases/compatibilidades.
 *
 * Fonte: seeds versionados em `docs/catalogo/seeds/*.csv` (device_models / device_aliases /
 * device_compatibilities). Esta camada é SOMENTE LEITURA e NÃO importa nada de banco/estoque.
 *
 * O catálogo serve para BUSCA e CONFERÊNCIA no cadastro de produto. Ele NÃO cria
 * compatibilidade automática, NÃO baixa estoque e NÃO vende nada.
 */

/** Status do modelo (coluna `status` do device_models). Mantido como string para resiliência. */
export type DeviceModelStatus = "ativo" | "legado" | "novo" | "revisar"

/** Confiança (colunas `confidence`). Mantido como string para resiliência. */
export type CatalogoConfidence = "alta" | "media" | "baixa"

/** Modelo canônico de aparelho (device_models_seed_001.csv). Sem compatibilidade física. */
export interface DeviceModel {
  modelKey: string
  brand: string
  commercialLine: string
  canonicalName: string
  shortName: string
  generation: string
  networkVariant: string
  yearHint: string
  sourceOrigin: string
  status: string
  confidence: string
  notes: string
  /**
   * COMPAT-CATALOGO-BRASIL-2023-2026-002 (colunas opcionais do CSV; vazias em linhas antigas):
   *  - manufacturer: fabricante (Xiaomi para Redmi/POCO); vazio = derivado da marca.
   *  - releaseYear: ano de lançamento oficial.
   *  - visibilityTier: "prioritaria" (visível por padrão) | "secundaria" (oculta por padrão na loja).
   *  - replacedBy: chave do modelo canônico quando esta linha foi MESCLADA (ex.: "iPhone 7 Branco",
   *    que era a cor da borda da película). A linha continua existindo: históricos seguem válidos.
   *  - sources: fontes oficiais/consultadas (texto livre, separado por " | ").
   */
  manufacturer?: string
  releaseYear?: string
  visibilityTier?: string
  replacedBy?: string
  sources?: string
}

/**
 * Status que NÃO aparecem nas buscas operacionais (PDV, cadastro, consulta):
 *  - mesclado: linha substituída por `replacedBy` (busca devolve o canônico);
 *  - aguardando_lancamento: aparelho anunciado/esperado sem confirmação oficial — só gestão.
 */
export const STATUS_FORA_DA_BUSCA = Object.freeze(["mesclado", "aguardando_lancamento"])

/** Alias de busca/autocomplete vinculado a um `modelKey` (device_aliases_seed_001.csv). */
export interface DeviceAlias {
  aliasKey: string
  modelKey: string
  alias: string
  normalizedAlias: string
  aliasType: string
  isAmbiguous: boolean
  requiresBrandContext: boolean
  confidence: string
  notes: string
}

/** Relação de compatibilidade entre modelos (device_compatibilities_seed_001.csv). */
export interface DeviceCompatibility {
  compatibilityKey: string
  compatibilityType: string
  groupName: string
  sourceModelKey: string
  targetModelKey: string
  productCategory: string
  status: string
  confidence: string
  sourceOrigin: string
  evidence: string
  requiresDryTest: boolean
  notes: string
}

/** Tipo do match de busca, do mais forte ao mais fraco. */
export type DeviceMatchType = "exact" | "prefix" | "contains"

/** Resultado de busca de modelo — enxuto para autocomplete de UI. */
export interface DeviceSearchResult {
  modelKey: string
  brand: string
  canonicalName: string
  shortName: string
  commercialLine: string
  /** Aliases principais (para exibição/preenchimento), deduplicados. */
  aliases: string[]
  confidence: string
  status: string
  matchType: DeviceMatchType
  /** Texto (alias/nome) que casou com a busca. */
  matchedText: string
  /** Alias curto/ambíguo OU normalizado presente em mais de uma marca. */
  ambiguous: boolean
  /** Precisa de contexto de marca para desambiguar. */
  requiresBrandContext: boolean
  /** Flags de revisão legíveis (ex.: "alias_curto_ambiguo", "modelo_em_revisao"). */
  reviewFlags: string[]
  /** Origem: catálogo global (CSV) ou cadastro manual da loja ativa. Ausente = global. */
  source?: "global" | "loja"
}

/** Opções da busca de modelos. */
export interface SearchDeviceOptions {
  /** Máximo de resultados (default 20). */
  limit?: number
  /** Quantos resultados pular (paginação "Mostrar mais"; default 0). */
  offset?: number
  /** Tamanho mínimo da query para buscar (default 2). */
  minQueryLength?: number
  /** Filtro por marca (desambigua aliases curtos). */
  brand?: string
  /**
   * Marcas ocultas nesta loja (chave normalizada, ex.: "OPPO"). Modelos dessas marcas não
   * aparecem na busca; continuam resolvíveis por `modelKey` (produtos e vendas antigos intactos).
   */
  marcasOcultas?: ReadonlySet<string>
}

/** Índice em memória do catálogo (construído uma vez a partir dos seeds). */
export interface CatalogoIndex {
  models: DeviceModel[]
  aliases: DeviceAlias[]
  compatibilities: DeviceCompatibility[]
  modelByKey: Map<string, DeviceModel>
  aliasesByModelKey: Map<string, DeviceAlias[]>
  /** normalizado(alias) → marcas que têm um alias EXATAMENTE igual (detecção de colisão). */
  normalizedAliasBrands: Map<string, Set<string>>
  /** Chave canônica de qualquer chave (segue `replacedBy`; chave sem mescla = ela mesma). */
  canonicalKeyOf: (modelKey: string) => string
  /** Canônico + chaves mescladas nele (para ler vínculos/produtos/decisões gravados com a chave antiga). */
  equivalentKeysOf: (modelKey: string) => string[]
}
