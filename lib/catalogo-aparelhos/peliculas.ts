/**
 * CATALOGO-PELICULAS-BUSCADOR-MVP-002 — consulta PURA de grupos de película por modelo.
 *
 * Lê apenas o `CatalogoIndex` já montado (seeds versionados). Não importa `fs`/banco,
 * não escreve nada e não infere compatibilidade além do que está nos seeds.
 *
 * Regras-chave:
 *  - Os grupos estão armazenados como PARES UNIDIRECIONAIS (i<j): um modelo pode
 *    aparecer só como `source`, só como `target` ou como ambos — a consulta casa os dois.
 *  - Só entram relações de película: `product_category === "pelicula_tela"` (ou
 *    `compatibility_type === "grupo_pelicula"` sem categoria). Capinha NUNCA entra.
 *  - Status/confiança NUNCA são promovidos: o agregado do grupo é sempre o PIOR
 *    status e a MENOR confiança entre as relações do grupo.
 */

import type { CatalogoIndex, DeviceCompatibility } from "./types"

/** Membro de um grupo de película (modelo equivalente resolvido pelo índice). */
export interface PeliculaGrupoMember {
  modelKey: string
  canonicalName: string
  brand: string
}

/** Grupo de película relacionado a um modelo consultado. */
export interface PeliculaGrupo {
  groupKey: string
  groupName: string
  compatibilityType: string
  productCategory: string
  /** PIOR status entre as relações do grupo (nunca promovido). */
  status: string
  /** MENOR confiança entre as relações do grupo. */
  confidence: string
  /** True se QUALQUER relação do grupo exigir teste seco. */
  requiresDryTest: boolean
  /** Grupo com modelos de mais de uma marca (molde cruzado — risco maior). */
  isCrossBrandGroup: boolean
  /** Total de modelos do grupo (incluindo o consultado). */
  memberCount: number
  /** Modelos equivalentes do grupo (EXCLUI o modelo consultado). */
  members: PeliculaGrupoMember[]
  /** Evidência curta e legível, ou "" quando ilegível/mojibake (nunca notes cru). */
  evidence: string
  /** Avisos prontos para exibição, derivados das flags do grupo. */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Agregação honesta de status/confiança
// ---------------------------------------------------------------------------

/** Ordem do melhor para o pior. Desconhecido cai em `precisa_testar` (conservador). */
const STATUS_ORDER = ["confirmado_fornecedor", "provavel_mercado", "precisa_testar", "nao_recomendado"] as const
const CONFIDENCE_ORDER = ["alta", "media", "baixa"] as const

function statusRank(status: string): number {
  const i = (STATUS_ORDER as readonly string[]).indexOf(status.trim().toLowerCase())
  return i === -1 ? STATUS_ORDER.indexOf("precisa_testar") : i
}

function confidenceRank(confidence: string): number {
  const i = (CONFIDENCE_ORDER as readonly string[]).indexOf(confidence.trim().toLowerCase())
  return i === -1 ? CONFIDENCE_ORDER.indexOf("baixa") : i
}

// ---------------------------------------------------------------------------
// Evidência: só exibir texto curto e legível (seeds têm campos com mojibake)
// ---------------------------------------------------------------------------

/**
 * Sequências típicas de UTF-8 lido como Latin-1: "Ã" + byte de continuação
 * (U+00C3 seguido de U+0080–U+00BF/minúscula), "â€" (U+00E2 U+20AC), dupla
 * codificação "ÃƒÂ" e o replacement char U+FFFD. Escrito com escapes ASCII
 * para não depender do encoding do próprio arquivo-fonte.
 */
const MOJIBAKE = /\u00e2\u20ac|\u00c3\u0192\u00c2|\u00c3[\u0080-\u00bf\sa-z]|\uFFFD/

function evidenciaLegivel(raw: string): string {
  const s = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!s || s.length > 160 || MOJIBAKE.test(s)) return ""
  return s
}

// ---------------------------------------------------------------------------
// Índice de películas por modelo (construído uma vez por CatalogoIndex)
// ---------------------------------------------------------------------------

/** Só relações de PELÍCULA DE TELA. Categoria divergente (ex.: capinha) nunca entra. */
function isPeliculaRow(c: DeviceCompatibility): boolean {
  const category = (c.productCategory ?? "").trim().toLowerCase()
  if (category === "pelicula_tela") return true
  // Sem categoria informada, o tipo explícito de grupo de película ainda vale.
  return category === "" && (c.compatibilityType ?? "").trim().toLowerCase() === "grupo_pelicula"
}

/** Identidade do grupo: prefixo da chave (`pelicula_g003__a__b` → `pelicula_g003`). */
function groupKeyOf(c: DeviceCompatibility): string {
  const key = (c.compatibilityKey ?? "").trim()
  const prefix = key.split("__")[0]
  return prefix || (c.groupName ?? "").trim() || key
}

interface GrupoAgregado {
  groupKey: string
  groupName: string
  compatibilityType: string
  productCategory: string
  worstStatusRank: number
  worstConfidenceRank: number
  requiresDryTest: boolean
  evidence: string
  memberKeys: Set<string>
}

interface PeliculaIndex {
  gruposByKey: Map<string, GrupoAgregado>
  grupoKeysByModelKey: Map<string, Set<string>>
}

const peliculaIndexCache = new WeakMap<CatalogoIndex, PeliculaIndex>()

function buildPeliculaIndex(index: CatalogoIndex): PeliculaIndex {
  const gruposByKey = new Map<string, GrupoAgregado>()
  const grupoKeysByModelKey = new Map<string, Set<string>>()

  for (const c of index.compatibilities) {
    if (!isPeliculaRow(c)) continue
    const source = (c.sourceModelKey ?? "").trim()
    const target = (c.targetModelKey ?? "").trim()
    if (!source && !target) continue

    const gk = groupKeyOf(c)
    let grupo = gruposByKey.get(gk)
    if (!grupo) {
      grupo = {
        groupKey: gk,
        groupName: (c.groupName ?? "").trim(),
        compatibilityType: c.compatibilityType,
        productCategory: c.productCategory,
        worstStatusRank: statusRank(c.status),
        worstConfidenceRank: confidenceRank(c.confidence),
        requiresDryTest: c.requiresDryTest,
        evidence: evidenciaLegivel(c.evidence),
        memberKeys: new Set<string>(),
      }
      gruposByKey.set(gk, grupo)
    } else {
      // Agregação SEM promoção: pior status, menor confiança, OR do teste seco.
      grupo.worstStatusRank = Math.max(grupo.worstStatusRank, statusRank(c.status))
      grupo.worstConfidenceRank = Math.max(grupo.worstConfidenceRank, confidenceRank(c.confidence))
      grupo.requiresDryTest = grupo.requiresDryTest || c.requiresDryTest
      if (!grupo.evidence) grupo.evidence = evidenciaLegivel(c.evidence)
    }

    for (const modelKey of [source, target]) {
      if (!modelKey) continue
      grupo.memberKeys.add(modelKey)
      const set = grupoKeysByModelKey.get(modelKey) ?? new Set<string>()
      set.add(gk)
      grupoKeysByModelKey.set(modelKey, set)
    }
  }

  return { gruposByKey, grupoKeysByModelKey }
}

function getPeliculaIndex(index: CatalogoIndex): PeliculaIndex {
  const cached = peliculaIndexCache.get(index)
  if (cached) return cached
  const built = buildPeliculaIndex(index)
  peliculaIndexCache.set(index, built)
  return built
}

// ---------------------------------------------------------------------------
// Consulta principal
// ---------------------------------------------------------------------------

/** Limiar de "grupo grande" — reaproveitamento amplo aumenta risco de molde divergente. */
const LARGE_GROUP_THRESHOLD = 10

function resolveMember(index: CatalogoIndex, modelKey: string): PeliculaGrupoMember {
  const model = index.modelByKey.get(modelKey)
  return {
    modelKey,
    canonicalName: model?.canonicalName || modelKey,
    brand: model?.brand ?? "",
  }
}

/**
 * Grupos de película relacionados a um `modelKey` canônico, ordenados do status
 * mais forte (confirmado_fornecedor) ao mais fraco. Modelo sem grupo → `[]` (vazio honesto).
 */
export function getPeliculasPorModelo(index: CatalogoIndex, modelKey: string): PeliculaGrupo[] {
  const key = (modelKey ?? "").trim()
  if (!key) return []

  const peliculaIndex = getPeliculaIndex(index)
  const groupKeys = peliculaIndex.grupoKeysByModelKey.get(key)
  if (!groupKeys || groupKeys.size === 0) return []

  const grupos: PeliculaGrupo[] = []
  for (const gk of groupKeys) {
    const agg = peliculaIndex.gruposByKey.get(gk)
    if (!agg) continue

    const members = [...agg.memberKeys]
      .filter((mk) => mk !== key)
      .map((mk) => resolveMember(index, mk))
      .sort((a, b) => a.brand.localeCompare(b.brand, "pt-BR") || a.canonicalName.localeCompare(b.canonicalName, "pt-BR"))

    const brands = new Set<string>()
    for (const mk of agg.memberKeys) {
      const brand = index.modelByKey.get(mk)?.brand.trim()
      if (brand) brands.add(brand.toLowerCase())
    }
    const isCrossBrandGroup = brands.size > 1

    const warnings: string[] = []
    if (agg.requiresDryTest) {
      warnings.push("Testar a seco antes de vender: borda, câmera e sensor podem variar por molde.")
    }
    if (isCrossBrandGroup) {
      warnings.push("Grupo cruzado multimarcas — confirme o molde fisicamente.")
    }
    if (agg.memberKeys.size >= LARGE_GROUP_THRESHOLD) {
      warnings.push(`Grupo grande (${agg.memberKeys.size} modelos) — risco maior de variação de molde.`)
    }

    grupos.push({
      groupKey: agg.groupKey,
      groupName: agg.groupName,
      compatibilityType: agg.compatibilityType,
      productCategory: agg.productCategory,
      status: STATUS_ORDER[agg.worstStatusRank],
      confidence: CONFIDENCE_ORDER[agg.worstConfidenceRank],
      requiresDryTest: agg.requiresDryTest,
      isCrossBrandGroup,
      memberCount: agg.memberKeys.size,
      members,
      evidence: agg.evidence,
      warnings,
    })
  }

  grupos.sort((a, b) => {
    const st = statusRank(a.status) - statusRank(b.status)
    if (st !== 0) return st
    const cf = confidenceRank(a.confidence) - confidenceRank(b.confidence)
    if (cf !== 0) return cf
    return a.groupName.localeCompare(b.groupName, "pt-BR")
  })

  return grupos
}
