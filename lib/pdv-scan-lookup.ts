import type { Dispatch, SetStateAction } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { mergePdvCatalogWithInventory, type PdvCatalogProduct } from "@/lib/pdv-catalog"
import type { InventoryItem } from "@/lib/operations-store"

/**
 * Resolução de bipe no catálogo INTEIRO da loja ativa, via backend autoritativo.
 *
 * Cada PDV tenta primeiro o match local (`findPdvProductByScan` sobre o estoque já carregado).
 * Quando o match local falha, este helper consulta `GET /api/ops/inventory/lookup` — que busca
 * o código exato direto no banco, sem depender da página/snapshot em memória — e injeta o item
 * encontrado no estoque local (`setInventory`) para que carrinho e fechamento funcionem.
 *
 * Isolamento multi-loja garantido no servidor (filtro por `storeId` + `canAccessStore`); aqui o
 * `storeId` da loja ativa é sempre enviado no header e na query.
 */
export type RemoteScanResult =
  | { kind: "single"; product: PdvCatalogProduct }
  | { kind: "multiple"; products: PdvCatalogProduct[] }
  | { kind: "none" }
  | { kind: "error" }

type LookupRow = {
  id?: unknown
  name?: unknown
  barcode?: unknown
  sku?: unknown
  dbId?: unknown
  codigo?: unknown
  codigoBarras?: unknown
  stock?: unknown
  cost?: unknown
  price?: unknown
  category?: unknown
}

function rowToInventoryItem(raw: LookupRow): InventoryItem | null {
  const id = typeof raw.id === "string" ? raw.id : ""
  const name = typeof raw.name === "string" ? raw.name : ""
  if (!id || !name) return null
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  return {
    id,
    name,
    barcode: str(raw.barcode),
    sku: str(raw.sku),
    dbId: str(raw.dbId),
    codigo: str(raw.codigo),
    codigoBarras: str(raw.codigoBarras),
    stock: num(raw.stock),
    cost: num(raw.cost),
    price: num(raw.price),
    category: typeof raw.category === "string" ? raw.category : "",
  }
}

export async function lookupPdvScanRemote(params: {
  code: string
  storeId: string
  setInventory: Dispatch<SetStateAction<InventoryItem[]>>
}): Promise<RemoteScanResult> {
  const code = params.code.trim()
  const storeId = params.storeId.trim()
  if (!code || !storeId) return { kind: "none" }

  let rows: LookupRow[]
  try {
    const res = await fetch(
      `/api/ops/inventory/lookup?code=${encodeURIComponent(code)}&lojaId=${encodeURIComponent(storeId)}`,
      { credentials: "include", headers: { [ASSISTEC_LOJA_HEADER]: storeId } }
    )
    if (!res.ok) return { kind: "error" }
    const json = (await res.json()) as { items?: LookupRow[] }
    rows = Array.isArray(json.items) ? json.items : []
  } catch {
    return { kind: "error" }
  }

  const items = rows.map(rowToInventoryItem).filter((i): i is InventoryItem => i !== null)
  if (items.length === 0) return { kind: "none" }

  // Injeta no estoque local os itens ausentes (snapshot defasado) — idempotente por id.
  params.setInventory((prev) => {
    const known = new Set(prev.map((i) => i.id))
    const missing = items.filter((i) => !known.has(i.id))
    return missing.length ? [...prev, ...missing] : prev
  })

  const products = mergePdvCatalogWithInventory([], items)
  if (products.length === 1) return { kind: "single", product: products[0]! }
  return { kind: "multiple", products }
}
