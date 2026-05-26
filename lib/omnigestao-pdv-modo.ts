import {
  LEGACY_GLOBAL_PDV_MODO_KEY,
  readStoreScopedString,
  STORE_SCOPED_PDV_MODO_KEY,
  writeStoreScopedString,
} from "@/lib/store-scoped-storage"

/** @deprecated Prefer {@link STORE_SCOPED_PDV_MODO_KEY} com storeId. */
export const OMNIGESTAO_PDV_MODO_KEY = LEGACY_GLOBAL_PDV_MODO_KEY

export type OmnigestaoPdvModoPreferencia = "rapido" | "normal"

/** Flag futura: bip ao adicionar item no modo rápido (`"1"` = ativo). */
export const OMNIGESTAO_PDV_RAPIDO_BEEP_KEY = "omnigestao-pdv-rapido-beep" as const

export function readOmnigestaoPdvModoPreferencia(
  storeId?: string | null,
): OmnigestaoPdvModoPreferencia | null {
  if (typeof window === "undefined") return null
  try {
    const v = readStoreScopedString(STORE_SCOPED_PDV_MODO_KEY, storeId, LEGACY_GLOBAL_PDV_MODO_KEY)
    if (v === "rapido" || v === "normal") return v
    return null
  } catch {
    return null
  }
}

export function writeOmnigestaoPdvModoPreferencia(
  m: OmnigestaoPdvModoPreferencia,
  storeId?: string | null,
): void {
  if (!storeId?.trim()) return
  writeStoreScopedString(STORE_SCOPED_PDV_MODO_KEY, storeId, m)
}
