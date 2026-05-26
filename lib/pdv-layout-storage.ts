import {
  LEGACY_GLOBAL_PDV_LAYOUT_KEY,
  readStoreScopedString,
  storeScopedKey,
  STORE_SCOPED_PDV_LAYOUT_KEY,
  writeStoreScopedString,
} from "@/lib/store-scoped-storage"

export type PdvMainLayout = "classic" | "supermercado" | "next"

export function readPdvMainLayout(storeId: string | null | undefined): PdvMainLayout | null {
  const raw = readStoreScopedString(
    STORE_SCOPED_PDV_LAYOUT_KEY,
    storeId,
    LEGACY_GLOBAL_PDV_LAYOUT_KEY,
  )
  if (raw === "classic" || raw === "supermercado" || raw === "next") return raw
  return null
}

export function writePdvMainLayout(storeId: string | null | undefined, layout: PdvMainLayout): boolean {
  return writeStoreScopedString(STORE_SCOPED_PDV_LAYOUT_KEY, storeId, layout)
}

export function pdvMainLayoutStorageEventKey(storeId: string | null | undefined): string | null {
  return storeScopedKey(STORE_SCOPED_PDV_LAYOUT_KEY, storeId)
}
