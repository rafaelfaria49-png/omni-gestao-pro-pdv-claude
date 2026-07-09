/**
 * Contrato de METADATA do Catálogo de Aparelhos no Produto (MVP).
 *
 * Fonte única da verdade de leitura/escrita de `Produto.metadata.catalogoAparelhos`.
 * ADITIVO e DORMENTE — sem schema Prisma, sem migration, sem db:push. Espelha o padrão
 * de `lib/produto-fiscal.ts` (metadata.fiscal): pure, server-agnostic, merge NÃO-destrutivo.
 *
 * IMPORTANTE (guardrails de domínio):
 *  - Isto NÃO cria compatibilidade automática, NÃO baixa estoque, NÃO vende.
 *  - `reviewRequired` é FORÇADO a `true` quando o status não é `confirmado_fornecedor`
 *    (não dá para marcar "sem revisão" numa compatibilidade não confirmada).
 *  - `source` é sempre `manual` neste MVP.
 */

/** Status de compatibilidade aceitos. */
export const COMPATIBILITY_STATUSES = [
  "confirmado_fornecedor",
  "provavel_mercado",
  "precisa_testar",
  "nao_recomendado",
] as const
export type CompatibilityStatus = (typeof COMPATIBILITY_STATUSES)[number]

/** Tipos de compatibilidade aceitos. */
export const COMPATIBILITY_TYPES = [
  "capinha",
  "pelicula_tela",
  "pelicula_camera",
  "acessorio",
  "tela",
  "bateria",
  "conector",
  "generico",
] as const
export type CompatibilityType = (typeof COMPATIBILITY_TYPES)[number]

/** Tipos que exigem confirmação técnica mais rígida (peça interna). */
export const TECHNICAL_COMPATIBILITY_TYPES: readonly CompatibilityType[] = ["tela", "bateria", "conector"]

/** Status default quando não informado / inválido. */
export const DEFAULT_COMPATIBILITY_STATUS: CompatibilityStatus = "precisa_testar"

/** Estrutura canônica persistida em `Produto.metadata.catalogoAparelhos`. */
export interface CatalogoAparelhosMetadata {
  version: 1
  deviceModelKeys: string[]
  deviceAliases: string[]
  compatibilityStatus: CompatibilityStatus
  compatibilityTypes: CompatibilityType[]
  reviewRequired: boolean
  source: "manual"
  notes: string
}

/** Entrada crua (parcial) — vinda do form/API. */
export type CatalogoAparelhosInput = Partial<{
  deviceModelKeys: unknown
  deviceAliases: unknown
  compatibilityStatus: unknown
  compatibilityTypes: unknown
  reviewRequired: unknown
  source: unknown
  notes: unknown
}>

const MAX_MODELS = 200
const MAX_ALIASES = 300
const MAX_NOTES = 500

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Lista de strings não-vazias, deduplicada e limitada. Aceita array ou valor único. */
function stringList(v: unknown, max: number): string[] {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v]
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    const s = typeof item === "string" ? item.trim() : item == null ? "" : String(item).trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

function normalizeStatus(v: unknown): CompatibilityStatus {
  const s = typeof v === "string" ? v.trim() : ""
  return (COMPATIBILITY_STATUSES as readonly string[]).includes(s)
    ? (s as CompatibilityStatus)
    : DEFAULT_COMPATIBILITY_STATUS
}

function normalizeTypes(v: unknown): CompatibilityType[] {
  const raw = stringList(v, COMPATIBILITY_TYPES.length)
  const out: CompatibilityType[] = []
  for (const t of raw) {
    if ((COMPATIBILITY_TYPES as readonly string[]).includes(t)) out.push(t as CompatibilityType)
  }
  return out
}

/**
 * Normaliza/valida a entrada em uma estrutura canônica.
 * Retorna `null` quando NÃO há nenhum modelo vinculado (estrutura vazia = sem catálogo).
 */
export function sanitizeCatalogoAparelhos(
  input: CatalogoAparelhosInput | null | undefined,
): CatalogoAparelhosMetadata | null {
  if (!input || typeof input !== "object") return null
  const deviceModelKeys = stringList(input.deviceModelKeys, MAX_MODELS)
  if (deviceModelKeys.length === 0) return null // sem modelo → estrutura vazia (limpa)

  const compatibilityStatus = normalizeStatus(input.compatibilityStatus)
  // reviewRequired FORÇADO a true quando não confirmado. Só `confirmado_fornecedor`
  // pode dispensar revisão (default false), e ainda assim pode ser marcado true.
  const reviewRequired =
    compatibilityStatus !== "confirmado_fornecedor" ? true : input.reviewRequired === true
  const notes = (typeof input.notes === "string" ? input.notes : "").trim().slice(0, MAX_NOTES)

  return {
    version: 1,
    deviceModelKeys,
    deviceAliases: stringList(input.deviceAliases, MAX_ALIASES),
    compatibilityStatus,
    compatibilityTypes: normalizeTypes(input.compatibilityTypes),
    reviewRequired,
    source: "manual",
    notes,
  }
}

/** True quando não há catálogo de aparelhos (nenhum modelo). */
export function isCatalogoAparelhosVazio(v: CatalogoAparelhosMetadata | null): boolean {
  return !v || v.deviceModelKeys.length === 0
}

/**
 * LEITURA CANÔNICA — obtém o catálogo de aparelhos do produto.
 * Aceita o produto (`{ metadata }`) ou diretamente o objeto `metadata`. Retorna `null`
 * quando ausente/inválido (nunca lança).
 */
export function getProdutoCatalogoAparelhos(
  source: { metadata?: unknown } | Record<string, unknown> | null | undefined,
): CatalogoAparelhosMetadata | null {
  if (!source || typeof source !== "object") return null
  const maybeProduto = asObject((source as { metadata?: unknown }).metadata)
  const metadata = maybeProduto ?? asObject(source)
  if (!metadata) return null
  const raw = asObject(metadata.catalogoAparelhos)
  if (!raw) return null
  return sanitizeCatalogoAparelhos(raw as CatalogoAparelhosInput)
}

/**
 * ESCRITA CANÔNICA — devolve um novo `metadata` com `catalogoAparelhos` saneado,
 * preservando todas as demais chaves (incl. `fiscal`). Merge NÃO-destrutivo.
 *  - `input === null` OU saneia para vazio → REMOVE a chave `catalogoAparelhos`.
 *  - caso contrário → grava a estrutura canônica.
 */
export function mergeCatalogoAparelhosIntoMetadata(
  metadataBase: unknown,
  input: CatalogoAparelhosInput | null | undefined,
): Record<string, unknown> {
  const base = { ...(asObject(metadataBase) ?? {}) }
  const sanitized = input === null || input === undefined ? null : sanitizeCatalogoAparelhos(input)
  if (!sanitized) {
    delete base.catalogoAparelhos
    return base
  }
  base.catalogoAparelhos = sanitized
  return base
}

/**
 * Extrai o input do body cru da API. Distingue três casos para o merge:
 *  - `undefined` → chave ausente: NÃO tocar no catálogo (preserva).
 *  - `null` → limpar explicitamente o catálogo.
 *  - objeto → gravar/atualizar.
 */
export function catalogoInputFromBody(
  raw: Record<string, unknown>,
): CatalogoAparelhosInput | null | undefined {
  if (!("catalogoAparelhos" in raw)) return undefined
  const v = raw.catalogoAparelhos
  if (v === null) return null
  const obj = asObject(v)
  return obj ? (obj as CatalogoAparelhosInput) : undefined
}
