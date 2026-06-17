/**
 * Catálogo inteligente — F1 · Compatibilidade (1 produto → N aparelhos).
 *
 * Camada de PREPARAÇÃO (não altera schema). Para peças/acessórios (película, capinha,
 * tela, bateria, conector, flex, cabo, acessório) extrai os modelos de aparelho
 * compatíveis a partir de:
 *   1) `metadata.compatibilidade` (lista explícita, quando o cadastro já a tiver) — preferida;
 *   2) derivação do nome do produto (ex.: "Capa Galaxy A06" → ["a06"]).
 *
 * PURE: sem IO, sem Prisma. Reutiliza `normalizePdvSearchText` e o dicionário de categorias.
 */

import { normalizePdvSearchText } from "@/lib/pdv-product-search"
import { resolveCategoriaCanonica, type CategoriaCanonica } from "@/lib/catalog/produto-sinonimos"

/** Categorias cujo produto é peça/acessório que se aplica a aparelhos. */
const CATEGORIAS_COM_COMPAT: ReadonlySet<CategoriaCanonica> = new Set<CategoriaCanonica>([
  "pelicula",
  "capinha",
  "tela",
  "bateria",
  "conector",
  "flex",
  "cabo",
  "acessorio",
])

/**
 * Marcas/linhas de aparelho reconhecidas (normalizadas). A ordem importa: a primeira que
 * casar vence (por isso "samsung" antes de "galaxy"). Linhas de produto que implicam marca
 * são canonizadas por {@link MARCA_ALIASES} (ex.: "galaxy" → "samsung").
 */
const MARCAS_APARELHO = [
  "samsung",
  "galaxy",
  "apple",
  "iphone",
  "motorola",
  "moto",
  "xiaomi",
  "redmi",
  "poco",
  "lg",
  "asus",
  "realme",
  "nokia",
  "infinix",
] as const

/** Linha de produto → marca canônica (mantém iphone/redmi como estão, por uso já consolidado). */
const MARCA_ALIASES: Record<string, string> = {
  galaxy: "samsung",
}

export type CompatFonte = "metadata" | "derivado" | "nenhum"

export type CompatibilidadeInfo = {
  /** É uma categoria que comporta compatibilidade com aparelhos? */
  aplicavel: boolean
  /** Marca de aparelho detectada (normalizada), quando houver. */
  marca: string | null
  /** Modelos compatíveis normalizados (ex.: "a06", "iphone 13 pro max", "redmi note 12"). */
  modelos: string[]
  /** De onde vieram os modelos. */
  fonte: CompatFonte
}

/** Indica se a categoria (canônica ou termo livre) comporta compatibilidade. */
export function isProdutoComCompatibilidade(categoriaOuTermo: string | null | undefined): boolean {
  if (!categoriaOuTermo) return false
  const cat = resolveCategoriaCanonica(categoriaOuTermo)
  return cat != null && CATEGORIAS_COM_COMPAT.has(cat)
}

/** Detecta a marca de aparelho em um texto livre (1ª que casar), normalizada. */
export function detectMarcaAparelho(text: string): string | null {
  const n = normalizePdvSearchText(text)
  if (!n) return null
  for (const m of MARCAS_APARELHO) {
    if (n.includes(m)) return MARCA_ALIASES[m] ?? m
  }
  return null
}

// Padrões de modelo comuns no varejo de celular (normalizados, sem acento/minúsculo).
const MODELO_PATTERNS: RegExp[] = [
  // iPhone: "iphone 13", "iphone 13 pro max", "iphone 15 plus", "iphone xr/xs/se"
  /iphone\s?(\d{1,2}\s?(pro\smax|pro|plus|mini)?|x[rs]?|se)\b/g,
  // Samsung Galaxy A/S/M/J/Note: "a06", "s23 ultra", "m54", "note 12"
  /\b([asmj])\s?(\d{1,3})(\s?(ultra|plus|fe|lite|5g))?\b/g,
  /\bnote\s?(\d{1,2}(\s?(pro|plus|ultra))?)\b/g,
  // Redmi / Poco: "redmi 12", "redmi note 13 pro", "poco x5"
  /\bredmi\s?(note\s?)?(\d{1,2}[a-z]?(\s?(pro|plus))?)\b/g,
  /\bpoco\s?([a-z]\d{1,2}(\s?(pro|plus))?)\b/g,
  // Moto: "moto g13", "moto e22", "moto g54 5g"
  /\bmoto\s?([a-z]\d{1,3}(\s?(plus|power|play|5g))?)\b/g,
]

/** Extrai códigos de modelo de aparelho de um texto livre (nome do produto, query, etc.). */
export function extractModelosCompat(text: string): string[] {
  const n = normalizePdvSearchText(text)
  if (!n) return []
  const out = new Set<string>()
  for (const re of MODELO_PATTERNS) {
    re.lastIndex = 0
    for (const m of n.matchAll(re)) {
      const hit = m[0].replace(/\s+/g, " ").trim()
      if (hit.length >= 2) out.add(hit)
    }
  }
  return [...out]
}

function normalizeModelos(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out = new Set<string>()
  for (const item of list) {
    const n = normalizePdvSearchText(String(item ?? ""))
    if (n) out.add(n)
  }
  return [...out]
}

/**
 * Resolve a compatibilidade de um produto. `metadataCompat` (quando array não vazio) tem
 * prioridade sobre a derivação do nome. Nunca inventa quando a categoria não é aplicável.
 */
export function buildCompatibilidade(input: {
  nome: string
  categoria?: string | null
  metadataCompat?: unknown
}): CompatibilidadeInfo {
  const aplicavel = isProdutoComCompatibilidade(input.categoria) || isProdutoComCompatibilidade(input.nome)
  const marca = detectMarcaAparelho(input.nome)

  const explicit = normalizeModelos(input.metadataCompat)
  if (explicit.length > 0) {
    return { aplicavel: true, marca, modelos: explicit, fonte: "metadata" }
  }

  if (!aplicavel) {
    return { aplicavel: false, marca, modelos: [], fonte: "nenhum" }
  }

  const derived = extractModelosCompat(input.nome)
  return {
    aplicavel: true,
    marca,
    modelos: derived,
    fonte: derived.length > 0 ? "derivado" : "nenhum",
  }
}
