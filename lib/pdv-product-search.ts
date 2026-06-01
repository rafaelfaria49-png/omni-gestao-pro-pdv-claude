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
 *
 * 4 = nome COMEÇA com o termo  (máxima prioridade — PDV operacional)
 * 3 = nome CONTÉM o termo
 * 2 = categoria começa ou contém o termo  (abaixo de qualquer match por nome)
 * 1 = SKU / código / EAN / id contém o termo
 */
export function scorePdvSearch(p: PdvCatalogProduct, rawQuery: string): number {
  const term = normalizePdvSearchText(rawQuery)
  if (!term) return 4

  const nameN = norm(p.name)

  if (nameN.startsWith(term)) return 4
  if (nameN.includes(term)) return 3

  const catN = norm(p.category)
  if (catN.startsWith(term) || catN.includes(term)) return 2

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
 * Multi-termos (separados por espaço): todos os termos devem ter match em algum campo.
 * Exemplo: "cabo KD11C" → produto precisa ter "cabo" E "KD11C" em qualquer campo.
 */
export function filterPdvCatalogBySearch(products: PdvCatalogProduct[], rawQuery: string): PdvCatalogProduct[] {
  const q = rawQuery.trim()
  if (!q) return products

  const terms = q.split(/\s+/).filter(Boolean)

  if (terms.length <= 1) {
    const scored = products
      .map((p) => ({ p, s: scorePdvSearch(p, q) }))
      .filter((x) => x.s > 0)
    scored.sort((a, b) => b.s - a.s)
    return scored.map((x) => x.p)
  }

  // Multi-termos: todos os termos devem bater em pelo menos um campo
  return products
    .filter((p) => terms.every((term) => scorePdvSearch(p, term) > 0))
    .sort((a, b) => {
      const sA = terms.reduce((sum, t) => sum + scorePdvSearch(a, t), 0)
      const sB = terms.reduce((sum, t) => sum + scorePdvSearch(b, t), 0)
      return sB - sA
    })
}
