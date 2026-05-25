/**
 * Normalização de SKU na persistência de importadores.
 * Remove prefixo gc- antes de gravar; não altera barcode, id nem inventoryId.
 */

const GC_PREFIX_RE = /^(?:gc-)+/i

/** Remove prefixo gc- repetível do início do SKU (case-insensitive). */
export function stripGcSkuPrefix(sku: unknown): string {
  const s = String(sku ?? "").trim()
  if (!s) return ""
  return s.replace(GC_PREFIX_RE, "").trim()
}

/** Normaliza SKU imediatamente antes de create/update/upsert de produto. */
export function normalizeSkuForSave(sku: unknown): string {
  return stripGcSkuPrefix(sku)
}
