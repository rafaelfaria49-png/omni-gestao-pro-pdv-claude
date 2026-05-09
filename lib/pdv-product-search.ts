import type { PdvCatalogProduct } from "@/lib/pdv-catalog"

/** Normaliza texto para busca: trim, minúsculas, sem acentos. */
export function normalizePdvSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

/**
 * Verifica se o produto combina com o termo digitado (nome, categoria, SKU, códigos, EAN, id).
 * Termo vazio: considerado compatível (o chamador decide listar tudo ou não).
 */
export function productMatchesPdvSearch(p: PdvCatalogProduct, rawQuery: string): boolean {
  const term = normalizePdvSearchText(rawQuery)
  if (!term) return true

  const norm = (v: string | undefined | null) => (v == null || v === "" ? "" : normalizePdvSearchText(String(v)))

  const codeParts = [p.sku, p.codigo, p.codigoBarras, p.barcode, p.id].map((x) => norm(x)).filter(Boolean)
  for (const cf of codeParts) {
    if (cf.includes(term)) return true
  }

  const nameN = norm(p.name)
  const catN = norm(p.category)

  if (term.length < 2) {
    return nameN.startsWith(term) || catN.startsWith(term)
  }

  return nameN.includes(term) || catN.includes(term)
}

/** Lista filtrada; query vazia retorna a lista completa (grade padrão). */
export function filterPdvCatalogBySearch(products: PdvCatalogProduct[], rawQuery: string): PdvCatalogProduct[] {
  const q = rawQuery.trim()
  if (!q) return products
  return products.filter((p) => productMatchesPdvSearch(p, q))
}
