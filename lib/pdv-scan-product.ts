import type { PdvCatalogProduct } from "@/lib/pdv-catalog"

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "")
}

/** Chaves textuais usadas para bipe / código (exceto nome). */
function collectCodeKeys(p: PdvCatalogProduct): string[] {
  const raw = [p.id, p.dbId, p.sku, p.codigo, p.barcode, p.codigoBarras]
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== "string") continue
    const t = v.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * Localiza produto no PDV rápido / bipe: id, SKU, código interno, EAN, id Prisma, nome exato
 * ou nome único por substring (evita ambiguidade).
 */
export function findPdvProductByScan(raw: string, products: PdvCatalogProduct[]): PdvCatalogProduct | null {
  const t = raw.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  const td = onlyDigits(t)

  for (const p of products) {
    for (const k of collectCodeKeys(p)) {
      if (k === t) return p
    }
  }

  for (const p of products) {
    for (const k of collectCodeKeys(p)) {
      if (k.toLowerCase() === lower && k.length > 0) return p
    }
  }

  if (td.length >= 4) {
    for (const p of products) {
      for (const k of collectCodeKeys(p)) {
        const kd = onlyDigits(k)
        if (kd.length >= 4 && kd === td) return p
      }
    }
  }

  for (const p of products) {
    if (p.name.trim().toLowerCase() === lower) return p
  }

  const nameHits = products.filter((p) => p.name.toLowerCase().includes(lower))
  if (nameHits.length === 1) return nameHits[0]!

  return null
}
