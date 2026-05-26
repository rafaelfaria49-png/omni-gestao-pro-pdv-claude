import type { PdvClassicLayoutKind } from "@/lib/store-settings-types"
import {
  LEGACY_GLOBAL_PDV_CLASSIC_LAYOUT_KEY,
  readStoreScopedString,
  storeScopedKey,
  STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY,
  writeStoreScopedString,
} from "@/lib/store-scoped-storage"

/** @deprecated Prefer {@link STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY} com storeId. */
export const PDV_CLASSIC_LAYOUT_STORAGE_KEY = LEGACY_GLOBAL_PDV_CLASSIC_LAYOUT_KEY

export const PDV_CLASSIC_LAYOUT_CHANGED_EVENT = "omni-pdv-classic-layout-changed"

export function readPdvClassicLayout(storeId?: string | null): PdvClassicLayoutKind {
  if (typeof window === "undefined") return "lovable"
  try {
    const raw = readStoreScopedString(
      STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY,
      storeId,
      LEGACY_GLOBAL_PDV_CLASSIC_LAYOUT_KEY,
    )
    if (raw === "services") return "services"
    if (raw === "venda-completa") return "venda-completa"
    return "lovable"
  } catch {
    return "lovable"
  }
}

export function writePdvClassicLayout(kind: PdvClassicLayoutKind, storeId?: string | null) {
  if (!storeId?.trim()) return
  writeStoreScopedString(STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, storeId, kind)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PDV_CLASSIC_LAYOUT_CHANGED_EVENT))
  }
}

export function pdvClassicLayoutStorageEventKey(storeId?: string | null): string | null {
  return storeScopedKey(STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, storeId)
}

/** Disparado após gravar layout PDV por unidade; mesma aba não recebe `storage`. */
export const PDV_MAIN_LAYOUT_CHANGED_EVENT = "omnigestao-pdv-main-layout-changed"

export function notifyPdvMainLayoutChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PDV_MAIN_LAYOUT_CHANGED_EVENT))
}
