/**
 * Catálogo inteligente — F1 · Pesquisa inteligente (utilitário ÚNICO).
 *
 * Entrada de linguagem natural ("capinha a06") → intenção resolvida (categoria, marca,
 * modelo, sinônimos, compatibilidade, palavras-chave) → ranking de produtos.
 *
 * NÃO duplica a engine de busca: a pontuação por token continua sendo `scorePdvSearch`
 * (lib/pdv-product-search). Esta camada apenas (1) interpreta a query e (2) EXPANDE os
 * termos (sinônimos + modelos) antes de pontuar — para que PDV, WhatsApp, Marketplace,
 * Marketing e Importador compartilhem a MESMA inteligência sem reimplementá-la.
 *
 * PURE: recebe a lista de produtos já carregada (multi-loja resolvido pelo chamador).
 */

import { normalizePdvSearchText, scorePdvSearch } from "@/lib/pdv-product-search"
import type { PdvCatalogProduct } from "@/lib/pdv-catalog"
import {
  expandTermoSinonimos,
  resolveCategoriaCanonica,
  type CategoriaCanonica,
} from "@/lib/catalog/produto-sinonimos"
import { detectMarcaAparelho, extractModelosCompat } from "@/lib/catalog/produto-compatibilidade"

export type ProdutoQueryParse = {
  textoOriginal: string
  /** Tokens normalizados (sem stopwords triviais, ≥2 chars). */
  tokens: string[]
  categoriaCanonica: CategoriaCanonica | null
  marca: string | null
  /** Modelos de aparelho detectados na query (ex.: "a06"). */
  modelos: string[]
  /** Sinônimos expandidos a partir da categoria detectada. */
  sinonimos: string[]
  /** União dos termos efetivamente usados para pontuar (tokens + sinônimos + modelos). */
  termosBusca: string[]
}

const QUERY_STOPWORDS = new Set([
  "de", "do", "da", "para", "pra", "com", "e", "o", "a", "um", "uma", "tem",
  "quero", "queria", "preciso", "tipo", "modelo", "marca", "qual", "quais",
])

/** Interpreta uma query livre, resolvendo categoria/marca/modelo e expandindo sinônimos. */
export function parseProdutoQuery(raw: string): ProdutoQueryParse {
  const textoOriginal = String(raw ?? "")
  const norm = normalizePdvSearchText(textoOriginal)
  const tokens = norm
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !QUERY_STOPWORDS.has(t))

  // Categoria: tenta a query inteira, depois token a token.
  let categoriaCanonica = resolveCategoriaCanonica(textoOriginal)
  if (!categoriaCanonica) {
    for (const t of tokens) {
      const hit = resolveCategoriaCanonica(t)
      if (hit) {
        categoriaCanonica = hit
        break
      }
    }
  }

  const marca = detectMarcaAparelho(textoOriginal)
  const modelos = extractModelosCompat(textoOriginal)
  const sinonimos = categoriaCanonica
    ? expandTermoSinonimos(categoriaCanonica).filter((s) => !tokens.includes(s))
    : []

  const termosBusca = [...new Set([...tokens, ...sinonimos, ...modelos].filter(Boolean))]

  return { textoOriginal, tokens, categoriaCanonica, marca, modelos, sinonimos, termosBusca }
}

export type ProdutoBuscaResult<T> = {
  produto: T
  score: number
  /** Quantos tokens "fortes" (da query original, não sinônimos) casaram. */
  tokensCasados: number
}

/**
 * Ranqueia produtos reutilizando `scorePdvSearch` por termo expandido.
 *
 * Modelo de ranqueamento (tolerante a linguagem natural, como o resolver do WhatsApp):
 *  - soma os scores de cada termo; sinônimos contam com peso menor que tokens originais;
 *  - ordena por tokens originais casados → score total → estoque (se houver) → nome.
 *
 * Não exige que todos os termos casem (diferente do `filterPdvCatalogBySearch` do PDV),
 * para suportar buscas conversacionais. Para o comportamento estrito do PDV, continue
 * usando `filterPdvCatalogBySearch`.
 */
export function buscarProdutos<T extends PdvCatalogProduct>(
  produtos: T[],
  raw: string,
  opts?: { parse?: ProdutoQueryParse; limit?: number },
): ProdutoBuscaResult<T>[] {
  const parse = opts?.parse ?? parseProdutoQuery(raw)
  if (parse.termosBusca.length === 0) return []

  const tokenSet = new Set(parse.tokens)
  const results: ProdutoBuscaResult<T>[] = []

  for (const p of produtos) {
    let score = 0
    let tokensCasados = 0
    for (const termo of parse.termosBusca) {
      const s = scorePdvSearch(p, termo)
      if (s <= 0) continue
      const original = tokenSet.has(termo)
      score += original ? s : s * 0.4 // sinônimos/modelos pesam menos
      if (original) tokensCasados += 1
    }
    if (score > 0) results.push({ produto: p, score: Number(score.toFixed(3)), tokensCasados })
  }

  results.sort(
    (a, b) =>
      b.tokensCasados - a.tokensCasados ||
      b.score - a.score ||
      (b.produto.stock ?? 0) - (a.produto.stock ?? 0) ||
      String(a.produto.name ?? "").localeCompare(String(b.produto.name ?? "")),
  )

  const limit = opts?.limit
  return typeof limit === "number" && limit >= 0 ? results.slice(0, limit) : results
}
