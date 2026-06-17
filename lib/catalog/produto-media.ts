/**
 * Catálogo inteligente — F1 · Mídia do produto (helper único).
 *
 * Centraliza a seleção de imagem principal/secundária, ordenação e placeholder a partir
 * de uma lista no formato de `ProductMedia` (tabela `product_media`). Hoje a escolha
 * "primary ?? primeira imagem" está repetida inline (ex.: whatsapp-product-resolver,
 * marketplace). Esta é a fonte única reutilizável por PDV, WhatsApp, Marketplace e Marketing.
 *
 * PURE: sem IO. Recebe a lista já lida do banco.
 */

/** Forma mínima aceita (compatível com select de `ProductMedia`). */
export type ProdutoMediaInput = {
  url: string
  isPrimary?: boolean | null
  /** "image" | "video" | ... (default tratado como image quando ausente). */
  type?: string | null
  createdAt?: string | Date | null
}

/** Placeholder padrão do projeto (existe em /public). UI pode sobrescrever via opts. */
export const PLACEHOLDER_PRODUTO_IMAGE = "/placeholder.svg"

export type ProdutoImagens = {
  /** Imagem principal (ou o placeholder, se `usarPlaceholder`). null se não houver e sem placeholder. */
  principal: string | null
  /** Imagem secundária (1ª das demais), ou null. */
  secundaria: string | null
  /** Todas as imagens ordenadas (principal primeiro). */
  todas: string[]
  /** true quando não há nenhuma imagem real (consumidor decide mostrar placeholder). */
  vazio: boolean
}

const isImage = (m: ProdutoMediaInput) => {
  const t = (m.type ?? "image").toLowerCase()
  return t === "image" || t === "img" || t === "foto"
}

const ts = (v: string | Date | null | undefined): number => {
  if (!v) return Number.MAX_SAFE_INTEGER // sem data → vai pro fim, estável
  const d = v instanceof Date ? v : new Date(v)
  const n = d.getTime()
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

/**
 * Ordena: somente imagens, `isPrimary` primeiro, depois mais antigas primeiro (createdAt asc),
 * estável e sem urls vazias/duplicadas.
 */
export function orderProdutoMedia(list: ProdutoMediaInput[] | null | undefined): ProdutoMediaInput[] {
  const safe = Array.isArray(list) ? list.filter((m) => m && typeof m.url === "string" && m.url.trim()) : []
  const images = safe.filter(isImage)
  const seen = new Set<string>()
  const deduped = images.filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))
  return deduped
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const pa = a.m.isPrimary ? 0 : 1
      const pb = b.m.isPrimary ? 0 : 1
      if (pa !== pb) return pa - pb
      const ta = ts(a.m.createdAt)
      const tb = ts(b.m.createdAt)
      if (ta !== tb) return ta - tb
      return a.i - b.i // estabilidade
    })
    .map((x) => x.m)
}

/** URL da imagem principal: `isPrimary` → 1ª imagem → null. */
export function pickPrimaryImage(list: ProdutoMediaInput[] | null | undefined): string | null {
  const ordered = orderProdutoMedia(list)
  return ordered[0]?.url ?? null
}

/** Imagens secundárias (todas menos a principal), com limite opcional. */
export function pickSecondaryImages(list: ProdutoMediaInput[] | null | undefined, max?: number): string[] {
  const urls = orderProdutoMedia(list)
    .slice(1)
    .map((m) => m.url)
  return typeof max === "number" && max >= 0 ? urls.slice(0, max) : urls
}

/**
 * Resolve o conjunto de imagens de um produto de forma única e consistente.
 * `usarPlaceholder` (default true) preenche `principal` com o placeholder quando vazio.
 */
export function resolveProdutoImagens(
  list: ProdutoMediaInput[] | null | undefined,
  opts?: { usarPlaceholder?: boolean; placeholder?: string },
): ProdutoImagens {
  const ordered = orderProdutoMedia(list)
  const todas = ordered.map((m) => m.url)
  const vazio = todas.length === 0
  const usarPlaceholder = opts?.usarPlaceholder ?? true
  const placeholder = opts?.placeholder ?? PLACEHOLDER_PRODUTO_IMAGE
  return {
    principal: vazio ? (usarPlaceholder ? placeholder : null) : todas[0]!,
    secundaria: todas[1] ?? null,
    todas,
    vazio,
  }
}
