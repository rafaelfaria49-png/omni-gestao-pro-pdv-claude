import type { InventoryItem, ProdutoAtributoDef } from "@/lib/operations-store"
import type { ProdutoAcessoriosMetadataV1 } from "@/lib/acessorios/types"
import { sanitizeInventoryItems } from "@/lib/pdv-mount-guards"

export type PdvCatalogProduct = {
  id: string
  name: string
  /** Código de barras (EAN/GTIN). */
  barcode?: string
  /** Id Prisma (cuid) do produto, quando `id` operacional é SKU. */
  dbId?: string
  sku?: string
  codigo?: string
  codigoBarras?: string
  price: number
  stock: number
  category: string
  vendaPorPeso?: boolean
  precoPorKg?: number
  atributos?: ProdutoAtributoDef[]
  complementos?: { id: string; name: string; price: number }[]
  accessoryConfig?: ProdutoAcessoriosMetadataV1
}

/**
 * Catálogo mock REMOVIDO. O PDV é 100% server-driven: todo produto vem do estoque
 * real da loja (`/api/ops/inventory` → `inventory`). Passe sempre `[]` como base:
 * `mergePdvCatalogWithInventory([], inventory)`. NÃO reintroduzir array de seed/demo.
 */
export function mergePdvCatalogWithInventory(
  base: PdvCatalogProduct[],
  inventory: InventoryItem[]
): PdvCatalogProduct[] {
  // Guard: if inventory is not yet loaded, return base as-is.
  // P0 PDV-RAFACELL-LOAD-CRASH: entradas nulas/não-objeto (restore parcial ou
  // payload legado da loja) são normalizadas aqui — UMA entrada inválida não
  // pode derrubar o catálogo (e a rota) da loja inteira.
  const safeInventory: InventoryItem[] = sanitizeInventoryItems<InventoryItem>(inventory)

  const baseIds = new Set(base.filter((p) => p && typeof p.id === "string").map((p) => p.id))

  // 1. Update base products with live inventory data
  const merged = base.map((p) => {
    const inv = safeInventory.find((i) => i.id === p.id)
    if (!inv) return p
    const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
    const next: PdvCatalogProduct = {
      ...p,
      stock: inv.stock,
      price: unit,
      barcode: inv.barcode || p.barcode,
      precoPorKg: inv.precoPorKg ?? inv.price,
      vendaPorPeso: inv.vendaPorPeso,
      atributos: inv.atributos?.length ? inv.atributos : p.atributos,
      dbId: inv.dbId ?? p.dbId,
      sku: inv.sku ?? p.sku,
      codigo: inv.codigo ?? inv.sku ?? p.codigo,
      codigoBarras: inv.codigoBarras ?? inv.barcode ?? p.codigoBarras,
    }
    if (inv.accessoryConfig) next.accessoryConfig = inv.accessoryConfig
    else delete next.accessoryConfig
    return next
  })

  // 2. Append inventory items NOT present in base (e.g., products added via Estoque panel)
  for (const inv of safeInventory) {
    if (baseIds.has(inv.id)) continue
    const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
    merged.push({
      id: inv.id,
      name: inv.name,
      barcode: inv.barcode,
      dbId: inv.dbId,
      sku: inv.sku,
      codigo: inv.codigo ?? inv.sku ?? inv.id,
      codigoBarras: inv.codigoBarras ?? inv.barcode,
      price: unit,
      stock: inv.stock,
      category: inv.category ?? "Outros",
      vendaPorPeso: inv.vendaPorPeso,
      precoPorKg: inv.precoPorKg,
      atributos: inv.atributos,
      ...(inv.accessoryConfig ? { accessoryConfig: inv.accessoryConfig } : {}),
    })
  }

  return merged
}

export function newPdvLineId(inventoryId: string) {
  return `${inventoryId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
