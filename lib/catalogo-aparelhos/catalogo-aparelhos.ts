/**
 * Catálogo de Aparelhos (MVP) — biblioteca PURA de leitura/normalização/busca.
 *
 * Não importa `fs`/banco: recebe o TEXTO dos CSVs e devolve estruturas em memória.
 * Isso mantém a busca testável e utilizável tanto no servidor quanto (via API) no client.
 * O carregamento do arquivo em si vive em `catalogo-loader.ts` (server-only).
 *
 * Regras-chave:
 *  - Somente leitura. Não escreve arquivo, não escreve banco.
 *  - Não infere compatibilidade automaticamente (isso é decisão humana no cadastro).
 *  - Aliases curtos/ambíguos são sinalizados, nunca "promovidos" a chave global.
 */

import { parseCsvObjects } from "./csv"
import type {
  CatalogoIndex,
  DeviceAlias,
  DeviceCompatibility,
  DeviceMatchType,
  DeviceModel,
  DeviceSearchResult,
  SearchDeviceOptions,
} from "./types"

// ---------------------------------------------------------------------------
// Parsing dos seeds (CSV texto → objetos tipados)
// ---------------------------------------------------------------------------

function toBool(v: string | undefined): boolean {
  return /^(true|1|sim|yes)$/i.test((v ?? "").trim())
}

/** Modelos canônicos. Linhas sem `model_key` são descartadas (resiliência). */
export function parseDeviceModels(text: string): DeviceModel[] {
  return parseCsvObjects(text)
    .filter((r) => (r.model_key ?? "").trim())
    .map((r) => ({
      modelKey: r.model_key.trim(),
      brand: r.brand ?? "",
      commercialLine: r.commercial_line ?? "",
      canonicalName: r.canonical_name ?? "",
      shortName: r.short_name ?? "",
      generation: r.generation ?? "",
      networkVariant: r.network_variant ?? "",
      yearHint: r.year_hint ?? "",
      sourceOrigin: r.source_origin ?? "",
      status: r.status ?? "",
      confidence: r.confidence ?? "",
      notes: r.notes ?? "",
    }))
}

/** Aliases de busca. Linhas sem `model_key`/`alias` são descartadas. */
export function parseDeviceAliases(text: string): DeviceAlias[] {
  return parseCsvObjects(text)
    .filter((r) => (r.model_key ?? "").trim() && (r.alias ?? "").trim())
    .map((r) => ({
      aliasKey: r.alias_key ?? "",
      modelKey: r.model_key.trim(),
      alias: r.alias.trim(),
      normalizedAlias: (r.normalized_alias ?? "").trim(),
      aliasType: r.alias_type ?? "",
      isAmbiguous: toBool(r.is_ambiguous),
      requiresBrandContext: toBool(r.requires_brand_context),
      confidence: r.confidence ?? "",
      notes: r.notes ?? "",
    }))
}

/** Compatibilidades (grupos de película etc.). Linhas sem `compatibility_key` são descartadas. */
export function parseDeviceCompatibilities(text: string): DeviceCompatibility[] {
  return parseCsvObjects(text)
    .filter((r) => (r.compatibility_key ?? "").trim())
    .map((r) => ({
      compatibilityKey: r.compatibility_key.trim(),
      compatibilityType: r.compatibility_type ?? "",
      groupName: r.group_name ?? "",
      sourceModelKey: r.source_model_key ?? "",
      targetModelKey: r.target_model_key ?? "",
      productCategory: r.product_category ?? "",
      status: r.status ?? "",
      confidence: r.confidence ?? "",
      sourceOrigin: r.source_origin ?? "",
      evidence: r.evidence ?? "",
      requiresDryTest: toBool(r.requires_dry_test),
      notes: r.notes ?? "",
    }))
}

// ---------------------------------------------------------------------------
// Normalização de texto de busca
// ---------------------------------------------------------------------------

/** Marcas diacríticas combinantes U+0300–U+036F (regex montado por escape ASCII puro). */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g")

/**
 * Normaliza texto para comparação de busca: remove acentos, sobe para maiúsculas,
 * colapsa espaços. NÃO remove espaços internos (mantém "IPHONE 13 PRO MAX").
 */
export function normalizeDeviceQuery(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Índice em memória
// ---------------------------------------------------------------------------

/** Prioridade de exibição dos aliases principais por tipo. */
const ALIAS_TYPE_PRIORITY: Record<string, number> = {
  canonical: 0,
  brand_short: 1,
  commercial_variant: 2,
  marketplace_name: 3,
  short: 4,
  common_typo: 5,
}

/** Constrói o índice de busca a partir dos modelos/aliases/compatibilidades já parseados. */
export function buildCatalogoIndex(input: {
  models: DeviceModel[]
  aliases: DeviceAlias[]
  compatibilities?: DeviceCompatibility[]
}): CatalogoIndex {
  const modelByKey = new Map<string, DeviceModel>()
  for (const m of input.models) {
    if (!modelByKey.has(m.modelKey)) modelByKey.set(m.modelKey, m)
  }

  const aliasesByModelKey = new Map<string, DeviceAlias[]>()
  const normalizedAliasBrands = new Map<string, Set<string>>()
  for (const a of input.aliases) {
    const model = modelByKey.get(a.modelKey)
    if (!model) continue // alias órfão: ignora
    const arr = aliasesByModelKey.get(a.modelKey) ?? []
    arr.push(a)
    aliasesByModelKey.set(a.modelKey, arr)

    const norm = normalizeDeviceQuery(a.normalizedAlias || a.alias)
    if (!norm) continue
    const brands = normalizedAliasBrands.get(norm) ?? new Set<string>()
    brands.add(normalizeDeviceQuery(model.brand))
    normalizedAliasBrands.set(norm, brands)
  }

  return {
    models: input.models,
    aliases: input.aliases,
    compatibilities: input.compatibilities ?? [],
    modelByKey,
    aliasesByModelKey,
    normalizedAliasBrands,
  }
}

/** Aliases principais de um modelo (deduplicados, priorizados por tipo, limitados). */
function pickPrincipalAliases(index: CatalogoIndex, modelKey: string, max = 6): string[] {
  const aliases = (index.aliasesByModelKey.get(modelKey) ?? [])
    .slice()
    .sort((a, b) => (ALIAS_TYPE_PRIORITY[a.aliasType] ?? 99) - (ALIAS_TYPE_PRIORITY[b.aliasType] ?? 99))
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of aliases) {
    const key = normalizeDeviceQuery(a.alias)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(a.alias)
    if (out.length >= max) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Busca / autocomplete
// ---------------------------------------------------------------------------

const MATCH_RANK: Record<DeviceMatchType, number> = { exact: 0, prefix: 1, contains: 2 }
const CONFIDENCE_RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 }

type Hit = {
  model: DeviceModel
  matchType: DeviceMatchType
  matchedText: string
}

/**
 * Busca modelos por nome canônico, nome curto ou alias (alias e normalized_alias).
 * Prioriza match exato → começa com → contém. Deduplica por `modelKey`.
 *
 * Ambiguidade:
 *  - alias curto marcado `is_ambiguous`/`requires_brand_context` propaga a flag;
 *  - se o termo (exato) existir como alias de mais de uma MARCA, marca colisão.
 * Passar `options.brand` filtra por marca (desambigua aliases curtos).
 */
export function searchDeviceModels(
  index: CatalogoIndex,
  query: string,
  options: SearchDeviceOptions = {},
): DeviceSearchResult[] {
  const limit = options.limit ?? 20
  const minLen = options.minQueryLength ?? 2
  const nq = normalizeDeviceQuery(query)
  if (nq.length < minLen) return []
  const brandFilter = options.brand ? normalizeDeviceQuery(options.brand) : ""

  const classify = (candidate: string): DeviceMatchType | null => {
    const c = normalizeDeviceQuery(candidate)
    if (!c) return null
    if (c === nq) return "exact"
    if (c.startsWith(nq)) return "prefix"
    if (c.includes(nq)) return "contains"
    return null
  }

  const hits = new Map<string, Hit>()
  const consider = (model: DeviceModel, matchType: DeviceMatchType, matchedText: string) => {
    const prev = hits.get(model.modelKey)
    if (!prev || MATCH_RANK[matchType] < MATCH_RANK[prev.matchType]) {
      hits.set(model.modelKey, { model, matchType, matchedText })
    }
  }

  for (const model of index.models) {
    const nameMt = classify(model.canonicalName)
    if (nameMt) consider(model, nameMt, model.canonicalName)
    const shortMt = classify(model.shortName)
    if (shortMt) consider(model, shortMt, model.shortName)
    for (const a of index.aliasesByModelKey.get(model.modelKey) ?? []) {
      const mt = classify(a.alias) ?? classify(a.normalizedAlias)
      if (mt) consider(model, mt, a.alias)
    }
  }

  // Colisão entre marcas: quantas marcas têm um alias EXATAMENTE igual à query.
  const brandsForExact = index.normalizedAliasBrands.get(nq)
  const crossBrandCollision = !!brandsForExact && brandsForExact.size > 1

  // Acha o alias que melhor explica o casamento (para as flags de ambiguidade), preferindo
  // um alias EXATO — necessário porque `short_name` pode casar exato antes do alias curto
  // ambíguo (ex.: short "A05" casa antes do alias "A05" que carrega `is_ambiguous`).
  const flagAliasFor = (model: DeviceModel): DeviceAlias | undefined => {
    let fallback: DeviceAlias | undefined
    for (const a of index.aliasesByModelKey.get(model.modelKey) ?? []) {
      const an = normalizeDeviceQuery(a.normalizedAlias || a.alias)
      const aliasName = normalizeDeviceQuery(a.alias)
      if (an === nq || aliasName === nq) return a
      if (!fallback && (an.startsWith(nq) || aliasName.startsWith(nq) || an.includes(nq) || aliasName.includes(nq))) {
        fallback = a
      }
    }
    return fallback
  }

  let results: DeviceSearchResult[] = []
  for (const hit of hits.values()) {
    const { model, matchType, matchedText } = hit
    const alias = flagAliasFor(model)
    const aliasAmbiguous = !!alias?.isAmbiguous
    const aliasRequiresBrand = !!alias?.requiresBrandContext
    // Colisão só desambigua/sinaliza quando o casamento é exato sobre o termo colidente.
    const crossBrand = matchType === "exact" && crossBrandCollision
    const ambiguous = aliasAmbiguous || crossBrand
    const requiresBrandContext = aliasRequiresBrand || crossBrand

    const reviewFlags: string[] = []
    if ((model.status ?? "").toLowerCase() === "revisar") reviewFlags.push("modelo_em_revisao")
    if (aliasAmbiguous) reviewFlags.push("alias_curto_ambiguo")
    if (crossBrand) reviewFlags.push("alias_em_multiplas_marcas")
    if ((model.confidence ?? "").toLowerCase() === "baixa") reviewFlags.push("confianca_baixa")

    results.push({
      modelKey: model.modelKey,
      brand: model.brand,
      canonicalName: model.canonicalName,
      shortName: model.shortName,
      commercialLine: model.commercialLine,
      aliases: pickPrincipalAliases(index, model.modelKey),
      confidence: model.confidence,
      status: model.status,
      matchType,
      matchedText,
      ambiguous,
      requiresBrandContext,
      reviewFlags,
    })
  }

  if (brandFilter) results = results.filter((r) => normalizeDeviceQuery(r.brand) === brandFilter)

  results.sort((a, b) => {
    const mt = MATCH_RANK[a.matchType] - MATCH_RANK[b.matchType]
    if (mt !== 0) return mt
    const cf =
      (CONFIDENCE_RANK[(a.confidence ?? "").toLowerCase()] ?? 3) -
      (CONFIDENCE_RANK[(b.confidence ?? "").toLowerCase()] ?? 3)
    if (cf !== 0) return cf
    return a.canonicalName.localeCompare(b.canonicalName, "pt-BR")
  })

  return results.slice(0, limit)
}
