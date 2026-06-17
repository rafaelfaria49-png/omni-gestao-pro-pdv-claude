/**
 * WhatsApp IA — F3 · Resolver de catálogo/estoque/preço/imagem (ASSISTIDO, somente leitura).
 *
 * Transforma a intenção CONSULTA_PRODUTO_ESTOQUE (F2) em sugestões reais baseadas no
 * catálogo da LOJA ATIVA. Reutiliza o motor de busca do PDV (`scorePdvSearch`) e o leitor
 * multi-loja canônico (`listProdutos`) — NÃO duplica lógica de busca nem de leitura.
 *
 * Garantias desta fase:
 *  - SOMENTE LEITURA: nunca altera estoque, preço, produto ou mídia.
 *  - Multi-loja estrito: produtos vêm do `storeId` resolvido pelo guard (sem fallback loja-1).
 *  - NÃO expõe custo, margem, fornecedor nem dados internos — só nome, preço de venda e
 *    disponibilidade.
 *  - `requiresHumanApproval` sempre true; `safeToAutoSend` sempre false (nada é enviado).
 *
 * Os loaders de banco são injetáveis (DI) para teste puro; o caminho de produção usa
 * import dinâmico (mantém este módulo importável em ambiente sem Prisma/Next).
 *
 * Referência: docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md (§3-A, §6).
 */

import { normalizePdvSearchText, scorePdvSearch } from "@/lib/pdv-product-search"
import { resolveProdutoImagens } from "@/lib/catalog/produto-media"
import type { WhatsAppIntentEntities } from "@/lib/whatsapp/whatsapp-intent-classifier"

export type WhatsAppStockStatus = "EM_ESTOQUE" | "BAIXO_ESTOQUE" | "SEM_ESTOQUE"

/** Produto cru lido da loja (campos PÚBLICOS — sem custo/margem/fornecedor). */
export type ResolverInputProduct = {
  id: string
  name: string
  sku: string
  barcode: string
  category: string
  price: number
  stock: number
}

export type WhatsAppResolvedProduct = {
  id: string
  nome: string
  sku: string
  barcode: string
  categoria: string
  /** Preço de VENDA (nunca custo/margem). */
  preco: number
  estoque: number
  estoqueStatus: WhatsAppStockStatus
  imagemPrincipalUrl: string | null
  imagens: string[]
  score: number
  matchedTokens: number
}

export type WhatsAppProductResolution = {
  query: string
  tokens: string[]
  /** Total de produtos que casaram (antes do limite de exibição). */
  total: number
  /** Top N (limite, default 5). */
  produtos: WhatsAppResolvedProduct[]
  /** Quantos a mais existem além do limite exibido. */
  overflow: number
  confidence: number
  resumo: string
  suggestedReply: string
  requiresHumanApproval: true
  safeToAutoSend: false
}

export type WhatsAppProductLoader = (storeId: string) => Promise<ResolverInputProduct[]>
export type WhatsAppMediaLoader = (
  storeId: string,
  productIds: string[]
) => Promise<Map<string, { url: string; isPrimary: boolean }[]>>

const DEFAULT_LIMIT = 5

// ─── Helpers puros (testáveis sem banco) ─────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "para", "pra", "com", "e", "o", "a", "os", "as",
  "um", "uma", "no", "na", "em", "pro", "tem", "voce", "voces", "ai", "por", "favor",
  "bom", "dia", "boa", "tarde", "noite", "ola", "oi", "que", "qual", "quais", "tao",
  "ainda", "aqui", "tipo", "modelo", "marca",
])

/** Classifica o saldo em faixa de disponibilidade (somente leitura). */
export function stockStatus(stock: number): WhatsAppStockStatus {
  const n = Number.isFinite(stock) ? stock : 0
  if (n <= 0) return "SEM_ESTOQUE"
  if (n <= 5) return "BAIXO_ESTOQUE"
  return "EM_ESTOQUE"
}

/** Tokens de busca a partir do termo extraído na F2 (+ marca/modelo), sem stopwords. */
export function buildSearchTokens(input: {
  termoProduto?: string
  marca?: string
  modeloAparelho?: string
  fallbackText?: string
}): string[] {
  const base = (input.termoProduto?.trim() || input.fallbackText?.trim() || "")
  const extra = [input.marca, input.modeloAparelho].filter(Boolean).join(" ")
  const raw = `${base} ${extra}`.trim()
  const norm = normalizePdvSearchText(raw)
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const t of norm.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (t.length < 2) continue
    if (STOPWORDS.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    tokens.push(t)
  }
  return tokens
}

type RankedItem = { product: ResolverInputProduct; score: number; matchedTokens: number }

/**
 * Ranqueia produtos pelos tokens reutilizando `scorePdvSearch` por token.
 * Tolerante a linguagem natural: NÃO exige que TODOS os tokens casem (diferente do
 * `filterPdvCatalogBySearch` do PDV) — ordena por nº de tokens casados, depois score, estoque.
 */
export function rankProducts(
  products: ResolverInputProduct[],
  tokens: string[]
): { ranked: RankedItem[]; total: number } {
  if (tokens.length === 0) return { ranked: [], total: 0 }
  const scored: RankedItem[] = []
  for (const product of products) {
    const shape = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      codigo: product.sku,
      codigoBarras: product.barcode,
      barcode: product.barcode,
      price: product.price,
      stock: product.stock,
      category: product.category,
    }
    let score = 0
    let matched = 0
    for (const t of tokens) {
      const s = scorePdvSearch(shape, t)
      if (s > 0) {
        score += s
        matched += 1
      }
    }
    if (matched > 0) scored.push({ product, score, matchedTokens: matched })
  }
  scored.sort(
    (a, b) =>
      b.matchedTokens - a.matchedTokens ||
      b.score - a.score ||
      b.product.stock - a.product.stock ||
      a.product.name.localeCompare(b.product.name)
  )
  return { ranked: scored, total: scored.length }
}

/** Confiança da busca a partir do melhor resultado (0..1). */
export function searchConfidence(ranked: RankedItem[], tokens: string[]): number {
  if (ranked.length === 0 || tokens.length === 0) return 0
  const top = ranked[0]!
  const ratio = top.matchedTokens / tokens.length
  let c = ratio >= 1 ? 0.85 : ratio >= 0.5 ? 0.7 : 0.55
  if (top.score >= 4) c += 0.05
  return Math.min(1, Math.max(0, Number(c.toFixed(2))))
}

/** Resumo operacional (não é mensagem ao cliente). */
export function buildResumo(total: number): string {
  if (total <= 0) return "Nenhum produto encontrado no catálogo da loja."
  return `Encontrado${total > 1 ? "s" : ""} ${total} produto${total > 1 ? "s" : ""}.`
}

/**
 * Resposta sugerida ao cliente — segura: não cita preço, nem quantidade exata de estoque,
 * nem promete prazo. Operador revisa antes de enviar.
 */
export function buildProductSuggestionReply(input: {
  total: number
  anyInStock: boolean
  marca?: string
  modeloAparelho?: string
  termoProduto?: string
}): string {
  if (input.total <= 0) {
    return "No momento não localizei esse item no nosso catálogo. Vou verificar com a equipe e já te retorno."
  }
  const subjectParts = [input.marca, input.modeloAparelho]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
  const subject = subjectParts.length > 0 ? subjectParts.join(" ") : (input.termoProduto ?? "").trim()
  const paraSubject = subject ? ` para ${subject}` : ""
  const disponivel = input.anyInStock ? " disponíveis" : ""
  const modelos = input.total > 1 ? "alguns modelos" : "o modelo"
  return `Temos opções${paraSubject}${disponivel}. Posso te mostrar ${modelos} e confirmar com você.`
}

function toResolved(
  item: RankedItem,
  media: Map<string, { url: string; isPrimary: boolean }[]>
): WhatsAppResolvedProduct {
  // Seleção de imagem unificada (lib/catalog) — fonte única de "principal ?? 1ª".
  // Em produção a lista chega `isPrimary desc` (loadMedia), então o resultado é idêntico
  // ao anterior; sem placeholder aqui (o WhatsApp decide se anexa foto).
  const list = media.get(item.product.id) ?? []
  const imgs = resolveProdutoImagens(list, { usarPlaceholder: false })
  const primary = imgs.principal
  const imagens = imgs.todas
  return {
    id: item.product.id,
    nome: item.product.name,
    sku: item.product.sku,
    barcode: item.product.barcode,
    categoria: item.product.category,
    preco: item.product.price,
    estoque: item.product.stock,
    estoqueStatus: stockStatus(item.product.stock),
    imagemPrincipalUrl: primary,
    imagens,
    score: item.score,
    matchedTokens: item.matchedTokens,
  }
}

// ─── Loaders de produção (import dinâmico — só fora de teste/DI) ────────────────

async function defaultLoadProducts(storeId: string): Promise<ResolverInputProduct[]> {
  const { listProdutos } = await import("@/app/actions/cadastros")
  const rows = await listProdutos(storeId)
  return rows
    .filter((p) => p.status !== "Inativo")
    .map((p) => ({
      id: p.id,
      name: p.nome,
      sku: p.sku === "—" ? "" : p.sku,
      barcode: p.barras,
      category: p.categoria === "—" ? "" : p.categoria,
      price: p.preco,
      stock: p.estoque,
    }))
}

async function defaultLoadMedia(
  storeId: string,
  productIds: string[]
): Promise<Map<string, { url: string; isPrimary: boolean }[]>> {
  const map = new Map<string, { url: string; isPrimary: boolean }[]>()
  if (productIds.length === 0) return map
  const { prisma } = await import("@/lib/prisma")
  const rows = await prisma.productMedia.findMany({
    where: { storeId, productId: { in: productIds }, type: "image" },
    select: { productId: true, url: true, isPrimary: true },
    orderBy: { isPrimary: "desc" },
  })
  for (const r of rows) {
    const arr = map.get(r.productId) ?? []
    arr.push({ url: r.url, isPrimary: r.isPrimary })
    map.set(r.productId, arr)
  }
  return map
}

// ─── Resolver principal ──────────────────────────────────────────────────────────

export async function resolveWhatsAppProducts(
  params: {
    storeId: string
    text: string
    entities?: WhatsAppIntentEntities
    limit?: number
  },
  deps?: { loadProducts?: WhatsAppProductLoader; loadMedia?: WhatsAppMediaLoader }
): Promise<WhatsAppProductResolution> {
  const limit = Math.max(1, params.limit ?? DEFAULT_LIMIT)
  const entities = params.entities ?? {}
  const tokens = buildSearchTokens({
    termoProduto: entities.termoProduto,
    marca: entities.marca,
    modeloAparelho: entities.modeloAparelho,
    fallbackText: params.text,
  })

  const empty: WhatsAppProductResolution = {
    query: tokens.join(" "),
    tokens,
    total: 0,
    produtos: [],
    overflow: 0,
    confidence: 0,
    resumo: buildResumo(0),
    suggestedReply: buildProductSuggestionReply({ total: 0, anyInStock: false }),
    requiresHumanApproval: true,
    safeToAutoSend: false,
  }

  if (tokens.length === 0) return empty

  const loadProducts = deps?.loadProducts ?? defaultLoadProducts
  const loadMedia = deps?.loadMedia ?? defaultLoadMedia

  const products = await loadProducts(params.storeId)
  const { ranked, total } = rankProducts(products, tokens)
  if (total === 0) return empty

  const top = ranked.slice(0, limit)
  const media = await loadMedia(
    params.storeId,
    top.map((r) => r.product.id)
  )
  const produtos = top.map((item) => toResolved(item, media))
  const anyInStock = produtos.some((p) => p.estoque > 0)

  return {
    query: tokens.join(" "),
    tokens,
    total,
    produtos,
    overflow: Math.max(0, total - produtos.length),
    confidence: searchConfidence(ranked, tokens),
    resumo: buildResumo(total),
    suggestedReply: buildProductSuggestionReply({
      total,
      anyInStock,
      marca: entities.marca,
      modeloAparelho: entities.modeloAparelho,
      termoProduto: entities.termoProduto,
    }),
    requiresHumanApproval: true,
    safeToAutoSend: false,
  }
}
