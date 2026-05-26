/**
 * Chaves localStorage isoladas por unidade (`baseKey::storeId`).
 * Sem `storeId` válido: não lê/grava (evita vazamento para loja-1 ou global).
 */

export function storeScopedKey(base: string, storeId: string | null | undefined): string | null {
  const sid = String(storeId ?? "").trim()
  if (!sid) return null
  return `${base}::${sid}`
}

export function readStoreScopedString(
  base: string,
  storeId: string | null | undefined,
  legacyGlobalKey?: string,
): string | null {
  const key = storeScopedKey(base, storeId)
  if (!key || typeof window === "undefined") return null
  try {
    const scoped = localStorage.getItem(key)
    if (scoped != null && scoped.trim() !== "") return scoped.trim()
    if (legacyGlobalKey) {
      const legacy = localStorage.getItem(legacyGlobalKey)
      if (legacy != null && legacy.trim() !== "") {
        const trimmed = legacy.trim()
        localStorage.setItem(key, trimmed)
        return trimmed
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoreScopedString(
  base: string,
  storeId: string | null | undefined,
  value: string,
): boolean {
  const key = storeScopedKey(base, storeId)
  if (!key || typeof window === "undefined") return false
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** Layout principal do PDV (classic / supermercado / next). */
export const STORE_SCOPED_PDV_LAYOUT_KEY = "@omnigestao:pdv-layout"
/** Legado global — migrado uma vez para chave scoped. */
export const LEGACY_GLOBAL_PDV_LAYOUT_KEY = "@omnigestao:pdv-layout"

export const STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY = "omni-pdv-classic-layout"
export const LEGACY_GLOBAL_PDV_CLASSIC_LAYOUT_KEY = "omni-pdv-classic-layout"

export const STORE_SCOPED_PDV_MODO_KEY = "omnigestao-pdv-modo"
export const LEGACY_GLOBAL_PDV_MODO_KEY = "omnigestao-pdv-modo"

export const STORE_SCOPED_IMPORTACAO_MODO_KEY = "@omnigestao:importacao-modo"
export const LEGACY_GLOBAL_IMPORTACAO_MODO_KEY = "@omnigestao:importacao-modo"
