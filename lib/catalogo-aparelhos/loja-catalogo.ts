/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — camada PURA do catálogo POR LOJA.
 *
 * Sobrepõe ao catálogo global (CSVs versionados, somente leitura) os registros
 * persistidos por loja:
 *  - modelos cadastrados manualmente (lançamentos ausentes do catálogo global);
 *  - decisões de compatibilidade de película (adicionar relação manual / suprimir relação global).
 *
 * Regras-chave:
 *  - O catálogo global NUNCA é alterado: tudo aqui é overlay calculado por requisição.
 *  - Relação manual NÃO é transitiva: adicionar A↔B não torna B equivalente aos outros membros
 *    do grupo de A. Suprimir A↔B esconde B de A (e A de B), em qualquer grupo.
 *  - Compatibilidade manual NUNCA é apresentada como confirmada pelo fabricante/fornecedor.
 *  - Não importa banco nem `fs` (testável); o acesso a dados vive em `loja-catalogo-store.ts`.
 */

import { buildCatalogoIndex, normalizeDeviceQuery, searchDeviceModels } from "./catalogo-aparelhos"
import { chaveNomeSemFabricante, fabricanteDaMarca, hierarquiaDoModeloGlobal } from "./hierarquia"
import type { PeliculaGrupo, PeliculaGrupoMember } from "./peliculas"
import type {
  CatalogoIndex,
  DeviceAlias,
  DeviceModel,
  DeviceSearchResult,
  SearchDeviceOptions,
} from "./types"

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

/** Prefixo obrigatório da identidade dos modelos manuais (nunca colide com o seed). */
export const MANUAL_MODEL_KEY_PREFIX = "manual_"

export const LOJA_MODELO_LIMITS = Object.freeze({
  brand: 60,
  manufacturer: 60,
  line: 30,
  name: 80,
  alias: 60,
  aliases: 10,
  notes: 300,
})

/** Modelo manual de uma loja (linha persistida, já desserializada). */
export interface LojaModelo {
  id: string
  storeId: string
  modelKey: string
  brand: string
  /** Fabricante (COMPAT-PROFISSIONAL-001). "" em registros antigos → derivar da marca. */
  manufacturer: string
  /** Linha comercial (ex.: "A", "Note"). Opcional. */
  line: string
  name: string
  aliases: string[]
  notes: string
  active: boolean
  version: number
  createdAt?: string
  updatedAt?: string
}

/** Categorias de compatibilidade por par mantidas por loja (independentes). */
export const LOJA_COMPAT_CATEGORIAS = ["pelicula_tela", "capinha"] as const
export type LojaCompatCategoria = (typeof LOJA_COMPAT_CATEGORIAS)[number]

export const LOJA_COMPAT_ACOES = ["adicionar", "suprimir"] as const
export type LojaCompatAcao = (typeof LOJA_COMPAT_ACOES)[number]

/**
 * Status aceitos para relação MANUAL. `confirmado_fornecedor` fica de fora de propósito:
 * decisão da loja não é confirmação de fabricante/fornecedor.
 *
 * COMPAT-PROFISSIONAL-001: `confirmado_loja` = a LOJA testou fisicamente o encaixe. Só é
 * gravado com confirmação explícita do operador (`confirmacaoFisica: true`), registrada
 * (quem/quando). Nunca é apresentado como confirmação do fabricante.
 * Ordem: do mais forte ao mais fraco (usada para ordenar grupos).
 */
export const LOJA_COMPAT_STATUSES = ["confirmado_loja", "provavel_mercado", "precisa_testar", "nao_recomendado"] as const
export type LojaCompatStatus = (typeof LOJA_COMPAT_STATUSES)[number]

export interface LojaCompatOverride {
  categoria: LojaCompatCategoria
  modelKeyA: string
  modelKeyB: string
  acao: LojaCompatAcao
  status: LojaCompatStatus
  notes: string
  /** Origem informada (COMPAT-PROFISSIONAL-001). */
  origem?: string
  confirmedBy?: string
  confirmedAt?: string | null
}

// ---------------------------------------------------------------------------
// Saneamento de texto
// ---------------------------------------------------------------------------

/** Controles C0/C1, zero-width, separadores de linha Unicode e BOM (regex montado por escapes ASCII). */
const INVISIBLE_OR_CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]", "g")

/** Remove caracteres de controle, colapsa espaços e limita o tamanho. */
export function cleanCatalogText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .normalize("NFC")
    .replace(INVISIBLE_OR_CONTROL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim()
}

/** Chave de duplicidade (sem acento, maiúscula, espaços colapsados). */
export function catalogKey(value: string): string {
  return normalizeDeviceQuery(value)
}

export function isManualModelKey(modelKey: string): boolean {
  return typeof modelKey === "string" && modelKey.startsWith(MANUAL_MODEL_KEY_PREFIX)
}

export type LojaModeloInputErrors = Partial<Record<"brand" | "manufacturer" | "line" | "name" | "aliases" | "notes", string>>

export interface LojaModeloInput {
  brand: string
  manufacturer: string
  line: string
  name: string
  aliases: string[]
  notes: string
}

/** Valida e saneia o input de criação/edição de modelo manual. */
export function sanitizeLojaModeloInput(
  raw: unknown,
): { ok: true; value: LojaModeloInput } | { ok: false; errors: LojaModeloInputErrors } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const errors: LojaModeloInputErrors = {}
  const brand = cleanCatalogText(input.brand, LOJA_MODELO_LIMITS.brand)
  const name = cleanCatalogText(input.name, LOJA_MODELO_LIMITS.name)
  if (!brand) errors.brand = "Informe a marca do aparelho."
  if (!name) errors.name = "Informe o nome do modelo."
  if (name && catalogKey(name).length < 2) errors.name = "Nome do modelo muito curto."

  const rawAliases = Array.isArray(input.aliases)
    ? input.aliases
    : typeof input.aliases === "string"
      ? input.aliases.split(/[,;\n]/)
      : []
  const seen = new Set<string>([catalogKey(name)])
  const aliases: string[] = []
  for (const a of rawAliases) {
    const alias = cleanCatalogText(a, LOJA_MODELO_LIMITS.alias)
    const key = catalogKey(alias)
    if (!alias || key.length < 2 || seen.has(key)) continue
    seen.add(key)
    aliases.push(alias)
  }
  if (aliases.length > LOJA_MODELO_LIMITS.aliases) {
    errors.aliases = `No máximo ${LOJA_MODELO_LIMITS.aliases} apelidos.`
  }
  const notes = cleanCatalogText(input.notes, LOJA_MODELO_LIMITS.notes)
  // Fabricante ausente = derivado da marca (ex.: POCO → Xiaomi); nunca inventado além do mapa.
  const manufacturer = cleanCatalogText(input.manufacturer, LOJA_MODELO_LIMITS.manufacturer) || fabricanteDaMarca(brand)
  const line = cleanCatalogText(input.line, LOJA_MODELO_LIMITS.line)

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { brand, manufacturer, line, name, aliases, notes } }
}

/** Nome exibido/gravado na venda: "Marca Modelo" (sem repetir a marca). */
export function lojaModeloCanonicalName(m: { brand: string; name: string }): string {
  const brand = m.brand.trim()
  const name = m.name.trim()
  if (!brand) return name
  return catalogKey(name).startsWith(catalogKey(brand) + " ") || catalogKey(name) === catalogKey(brand)
    ? name
    : `${brand} ${name}`
}

/** Converte qualquer valor JSON em lista de apelidos válidos. */
export function aliasesFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => cleanCatalogText(v, LOJA_MODELO_LIMITS.alias))
    .filter(Boolean)
    .slice(0, LOJA_MODELO_LIMITS.aliases)
}

// ---------------------------------------------------------------------------
// Duplicidade contra o catálogo global (mesma marca)
// ---------------------------------------------------------------------------

/**
 * Procura no catálogo GLOBAL um modelo da MESMA marca cujo nome canônico, nome curto,
 * nome sem a marca ou alias exato coincida com o nome informado. Marcas diferentes
 * nunca colidem (ex.: "G47" de duas marcas distintas é permitido).
 */
export function findGlobalDuplicate(
  index: CatalogoIndex,
  input: { brand: string; name: string; manufacturer?: string },
): DeviceModel | null {
  const brandKey = catalogKey(input.brand)
  const nameKey = catalogKey(input.name)
  const fullKey = catalogKey(lojaModeloCanonicalName(input))
  if (!brandKey || !nameKey) return null
  // COMPAT-PROFISSIONAL-001: a loja informa a MARCA COMERCIAL ("Galaxy", "Redmi") e o CSV às vezes
  // guarda o FABRICANTE ("Samsung"). Dentro do mesmo fabricante, compara também o nome completo
  // sem o fabricante: "Galaxy" + "A56 5G" colide com "Samsung Galaxy A56 5G"; "A56" NÃO colide
  // com "A56 5G" (nomes semelhantes não são confundidos).
  const fabKey = catalogKey((input.manufacturer ?? "").trim() || fabricanteDaMarca(input.brand))
  const semFab = chaveNomeSemFabricante(fabKey, lojaModeloCanonicalName(input))
  for (const model of index.models) {
    if (catalogKey(model.brand) !== brandKey) {
      if (fabKey && catalogKey(hierarquiaDoModeloGlobal(model).fabricante) === fabKey) {
        if (chaveNomeSemFabricante(fabKey, model.canonicalName) === semFab) return model
      }
      continue
    }
    const canonical = catalogKey(model.canonicalName)
    const withoutBrand = canonical.startsWith(brandKey + " ") ? canonical.slice(brandKey.length + 1) : canonical
    const candidates = [canonical, withoutBrand, catalogKey(model.shortName)]
    for (const a of index.aliasesByModelKey.get(model.modelKey) ?? []) {
      candidates.push(catalogKey(a.alias))
    }
    if (candidates.some((c) => c && (c === nameKey || c === fullKey))) return model
  }
  return null
}

// ---------------------------------------------------------------------------
// Índice e busca combinada (global + loja)
// ---------------------------------------------------------------------------

/** Projeta modelos manuais (ATIVOS) num `CatalogoIndex` pequeno, reutilizando a busca global. */
export function buildLojaCatalogoIndex(modelos: readonly LojaModelo[]): CatalogoIndex {
  const models: DeviceModel[] = []
  const aliases: DeviceAlias[] = []
  for (const m of modelos) {
    if (!m.active) continue
    models.push({
      modelKey: m.modelKey,
      brand: m.brand,
      commercialLine: m.line ?? "",
      canonicalName: lojaModeloCanonicalName(m),
      shortName: m.name,
      generation: "",
      networkVariant: "",
      yearHint: "",
      sourceOrigin: "manual_loja",
      status: "ativo",
      confidence: "",
      notes: m.notes,
    })
    for (const alias of m.aliases) {
      aliases.push({
        aliasKey: `${m.modelKey}__${catalogKey(alias)}`,
        modelKey: m.modelKey,
        alias,
        normalizedAlias: catalogKey(alias),
        aliasType: "manual",
        isAmbiguous: false,
        requiresBrandContext: false,
        confidence: "",
        notes: "",
      })
    }
  }
  return buildCatalogoIndex({ models, aliases })
}

const MATCH_RANK = { exact: 0, prefix: 1, contains: 2 } as const

/**
 * Busca no catálogo global E nos modelos manuais da loja. Os manuais são marcados com
 * `source: "loja"` e a flag `cadastro_manual_loja`; o ranking (tipo de match) é preservado.
 */
export function searchDeviceModelsComLoja(
  globalIndex: CatalogoIndex,
  lojaIndex: CatalogoIndex | null,
  query: string,
  options: SearchDeviceOptions = {},
): DeviceSearchResult[] {
  const limit = options.limit ?? 20
  const globais = searchDeviceModels(globalIndex, query, { ...options, limit }).map((r) => ({
    ...r,
    source: "global" as const,
  }))
  if (!lojaIndex || lojaIndex.models.length === 0) return globais
  const manuais = searchDeviceModels(lojaIndex, query, { ...options, limit }).map((r) => ({
    ...r,
    source: "loja" as const,
    reviewFlags: [...r.reviewFlags, "cadastro_manual_loja"],
  }))
  // Manuais primeiro no empate: o operador acabou de cadastrar e espera encontrá-los.
  return [...manuais, ...globais]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => MATCH_RANK[a.r.matchType] - MATCH_RANK[b.r.matchType] || a.i - b.i)
    .map(({ r }) => r)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Pares de compatibilidade
// ---------------------------------------------------------------------------

/** Par canônico ordenado (A < B). `null` quando inválido ou A === B. */
export function orderedPair(a: string, b: string): { modelKeyA: string; modelKeyB: string } | null {
  const x = (a ?? "").trim()
  const y = (b ?? "").trim()
  if (!x || !y || x === y) return null
  return x < y ? { modelKeyA: x, modelKeyB: y } : { modelKeyA: y, modelKeyB: x }
}

export function otherKeyOf(o: { modelKeyA: string; modelKeyB: string }, modelKey: string): string | null {
  if (o.modelKeyA === modelKey) return o.modelKeyB
  if (o.modelKeyB === modelKey) return o.modelKeyA
  return null
}

export function normalizeLojaCompatStatus(v: unknown): LojaCompatStatus {
  return typeof v === "string" && (LOJA_COMPAT_STATUSES as readonly string[]).includes(v)
    ? (v as LojaCompatStatus)
    : "precisa_testar"
}

export const LOJA_MANUAL_GROUP_PREFIX = "loja_manual"
export const AVISO_COMPAT_MANUAL =
  "Informada manualmente pela loja — não é confirmação do fabricante. Teste antes de vender."
/** Aviso do status `confirmado_loja`: confirmação física DA LOJA, não do fabricante. */
export const AVISO_COMPAT_CONFIRMADA_LOJA =
  "Confirmada pela loja em teste físico — não é confirmação do fabricante."
/** Aviso fixo: compatibilidades de película e capinha são independentes. */
export const AVISO_CATEGORIAS_INDEPENDENTES =
  "Película e capinha têm compatibilidades independentes: uma não garante a outra."

export interface PeliculaGruposComLoja {
  grupos: PeliculaGrupo[]
  /** Modelos removidos POR ESTA LOJA de grupos globais (para exibir/restaurar). */
  suprimidos: PeliculaGrupoMember[]
}

/**
 * Só decisões cujos dois lados ainda existem: chave global presente no catálogo atual e modelo
 * manual ATIVO desta loja. Evita equivalente "fantasma" (chave crua, sem marca) depois que o CSV
 * deixa de ter o modelo ou que a loja desativa o seu.
 */
export function overridesUtilizaveis<T extends Pick<LojaCompatOverride, "modelKeyA" | "modelKeyB">>(
  overrides: readonly T[],
  isGlobalKey: (modelKey: string) => boolean,
  isManualAtivo: (modelKey: string) => boolean,
): T[] {
  return overrides.filter((o) =>
    [o.modelKeyA, o.modelKeyB].every((k) => (isManualModelKey(k) ? isManualAtivo(k) : isGlobalKey(k))),
  )
}

/**
 * Aplica as decisões da loja aos grupos globais de película de UM modelo.
 *  - suprimir(A,B): B some de todos os grupos de A (sem reaparecer por outro grupo).
 *  - adicionar(A,B): B aparece num grupo sintético "manual da loja", não transitivo.
 * Grupos que ficam sem membros após supressão são descartados.
 */
export function applyPeliculaOverrides(
  modelKey: string,
  gruposGlobais: readonly PeliculaGrupo[],
  overrides: readonly LojaCompatOverride[],
  resolveMember: (modelKey: string) => PeliculaGrupoMember,
): PeliculaGruposComLoja {
  const key = (modelKey ?? "").trim()
  const doModelo = overrides.filter((o) => o.categoria === "pelicula_tela" && otherKeyOf(o, key) !== null)
  const suprimidosKeys = new Set(
    doModelo.filter((o) => o.acao === "suprimir").map((o) => otherKeyOf(o, key) as string),
  )

  const suprimidosVistos = new Map<string, PeliculaGrupoMember>()
  const grupos: PeliculaGrupo[] = []
  for (const g of gruposGlobais) {
    const members = g.members.filter((m) => {
      if (!suprimidosKeys.has(m.modelKey)) return true
      suprimidosVistos.set(m.modelKey, m)
      return false
    })
    if (members.length === 0 && g.members.length > 0) continue
    const removidos = g.members.length - members.length
    grupos.push(
      removidos > 0
        ? {
            ...g,
            members,
            memberCount: members.length + 1,
            warnings: [...g.warnings, `${removidos} modelo(s) removido(s) deste grupo por decisão da loja.`],
          }
        : g,
    )
  }

  const presentes = new Set(grupos.flatMap((g) => g.members.map((m) => m.modelKey)))
  const porStatus = new Map<LojaCompatStatus, PeliculaGrupoMember[]>()
  for (const o of doModelo) {
    if (o.acao !== "adicionar") continue
    const other = otherKeyOf(o, key) as string
    if (presentes.has(other) || suprimidosKeys.has(other)) continue
    presentes.add(other)
    const arr = porStatus.get(o.status) ?? []
    arr.push(resolveMember(other))
    porStatus.set(o.status, arr)
  }

  for (const status of LOJA_COMPAT_STATUSES) {
    const members = porStatus.get(status)
    if (!members?.length) continue
    members.sort((a, b) => a.brand.localeCompare(b.brand, "pt-BR") || a.canonicalName.localeCompare(b.canonicalName, "pt-BR"))
    const brands = new Set([resolveMember(key), ...members].map((m) => m.brand.trim().toLowerCase()).filter(Boolean))
    grupos.push(grupoManual("pelicula_tela", status, members, brands.size > 1))
  }

  return { grupos, suprimidos: [...suprimidosVistos.values()] }
}

function grupoManual(
  categoria: LojaCompatCategoria,
  status: LojaCompatStatus,
  members: PeliculaGrupoMember[],
  crossBrand: boolean,
): PeliculaGrupo {
  const confirmada = status === "confirmado_loja"
  return {
    groupKey:
      categoria === "pelicula_tela"
        ? `${LOJA_MANUAL_GROUP_PREFIX}__${status}`
        : `${LOJA_MANUAL_GROUP_PREFIX}_capinha__${status}`,
    groupName: confirmada ? "Confirmada pela loja (teste físico)" : "Compatibilidade informada pela loja",
    compatibilityType: categoria === "pelicula_tela" ? "grupo_pelicula_manual_loja" : "grupo_capinha_manual_loja",
    productCategory: categoria,
    status,
    confidence: confirmada ? "media" : "baixa",
    requiresDryTest: !confirmada,
    isCrossBrandGroup: crossBrand,
    memberCount: members.length + 1,
    members,
    evidence: "",
    warnings: [confirmada ? AVISO_COMPAT_CONFIRMADA_LOJA : AVISO_COMPAT_MANUAL],
  }
}

/**
 * COMPAT-PROFISSIONAL-001 — grupos de CAPINHA de um modelo. Não há base global de capinha:
 * tudo vem das relações informadas pela loja (categoria `capinha`), agrupadas por status e
 * NÃO transitivas. Relações de película nunca entram aqui (e vice-versa).
 */
export function buildCapinhaGrupos(
  modelKey: string,
  overrides: readonly LojaCompatOverride[],
  resolveMember: (modelKey: string) => PeliculaGrupoMember,
): PeliculaGrupo[] {
  const key = (modelKey ?? "").trim()
  const porStatus = new Map<LojaCompatStatus, PeliculaGrupoMember[]>()
  const vistos = new Set<string>()
  for (const o of overrides) {
    if (o.categoria !== "capinha" || o.acao !== "adicionar") continue
    const other = otherKeyOf(o, key)
    if (!other || vistos.has(other)) continue
    vistos.add(other)
    const arr = porStatus.get(o.status) ?? []
    arr.push(resolveMember(other))
    porStatus.set(o.status, arr)
  }
  const grupos: PeliculaGrupo[] = []
  for (const status of LOJA_COMPAT_STATUSES) {
    const members = porStatus.get(status)
    if (!members?.length) continue
    members.sort((a, b) => a.brand.localeCompare(b.brand, "pt-BR") || a.canonicalName.localeCompare(b.canonicalName, "pt-BR"))
    const brands = new Set([resolveMember(key), ...members].map((m) => m.brand.trim().toLowerCase()).filter(Boolean))
    grupos.push(grupoManual("capinha", status, members, brands.size > 1))
  }
  return grupos
}
