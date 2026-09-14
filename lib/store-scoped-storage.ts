/**
 * Chaves localStorage isoladas por unidade (`baseKey::storeId`).
 * Sem `storeId` válido: não lê/grava (evita vazamento para loja-1 ou global).
 */

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
    if (typeof localStorage !== "undefined") return localStorage
  } catch {
    /* ignore */
  }
  return null
}

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
  if (!key) return null
  const storage = getLocalStorage()
  if (!storage) return null
  try {
    const scoped = storage.getItem(key)
    if (scoped != null && scoped.trim() !== "") return scoped.trim()
    if (legacyGlobalKey) {
      const legacy = storage.getItem(legacyGlobalKey)
      if (legacy != null && legacy.trim() !== "") {
        const trimmed = legacy.trim()
        storage.setItem(key, trimmed)
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
  if (!key) return false
  const storage = getLocalStorage()
  if (!storage) return false
  try {
    storage.setItem(key, value)
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
