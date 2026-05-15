import type { PdvCatalogProduct } from "@/lib/pdv-catalog"

/** Normaliza texto para busca: trim, minúsculas, sem acentos. */
export function normalizePdvSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

const norm = (v: string | undefined | null) =>
  v == null || v === "" ? "" : normalizePdvSearchText(String(v))

/**
 * Pontua o produto contra o termo. 0 = não bate. >0 = bate (maior = prioridade maior).
 * 3 = começa com termo (nome/categoria), 2 = contém termo (nome/categoria), 1 = código/SKU/EAN contém termo.
 */
export function scorePdvSearch(p: PdvCatalogProduct, rawQuery: string): number {
  const term = normalizePdvSearchText(rawQuery)
  if (!term) return 3

  const nameN = norm(p.name)
  const catN = norm(p.category)

  if (nameN.startsWith(term) || catN.startsWith(term)) return 3
  if (nameN.includes(term) || catN.includes(term)) return 2

  const codeParts = [p.sku, p.codigo, p.codigoBarras, p.barcode, p.id].map(norm).filter(Boolean)
  if (codeParts.some((c) => c.includes(term))) return 1

  return 0
}

/** @deprecated Prefer scorePdvSearch + filterPdvCatalogBySearch for ordered results. */
export function productMatchesPdvSearch(p: PdvCatalogProduct, rawQuery: string): boolean {
  return scorePdvSearch(p, rawQuery) > 0
}

/**
 * Lista filtrada e ordenada por relevância (começa-com > contém > código).
 * Query vazia retorna a lista completa sem reordenar.
 */
export function filterPdvCatalogBySearch(products: PdvCatalogProduct[], rawQuery: string): PdvCatalogProduct[] {
  const q = rawQuery.trim()
  if (!q) return products
  const scored = products
    .map((p) => ({ p, s: scorePdvSearch(p, q) }))
    .filter((x) => x.s > 0)
  scored.sort((a, b) => b.s - a.s)
  return scored.map((x) => x.p)
}
