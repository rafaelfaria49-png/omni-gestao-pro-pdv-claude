import type { InventoryItem, ProdutoAtributoDef } from "@/lib/operations-store"

export type PdvCatalogProduct = {
  id: string
  name: string
  /** Código de barras (EAN/GTIN). */
  barcode?: string
  price: number
  stock: number
  category: string
  vendaPorPeso?: boolean
  precoPorKg?: number
  atributos?: ProdutoAtributoDef[]
  complementos?: { id: string; name: string; price: number }[]
}

export const PDV_PRODUCTS_BASE: PdvCatalogProduct[] = [
  // ── Telas ──────────────────────────────────────────────────────────────
  { id: "1",   name: "Tela iPhone 13",             price: 350.0, stock: 5,  category: "Telas",     barcode: "7891234560001",
    complementos: [{ id: "c1", name: "Película de Vidro 3D", price: 25.0 }, { id: "c2", name: "Capinha de Silicone", price: 35.0 }] },
  { id: "10",  name: "Tela iPhone 12",             price: 290.0, stock: 4,  category: "Telas",     barcode: "7891234560002" },
  { id: "11",  name: "Tela Samsung A54",           price: 240.0, stock: 6,  category: "Telas",     barcode: "7891234560003" },
  { id: "12",  name: "Tela Motorola G84",          price: 180.0, stock: 8,  category: "Telas",     barcode: "7891234560004" },
  { id: "13",  name: "Tela Xiaomi Redmi 12",       price: 160.0, stock: 3,  category: "Telas",     barcode: "7891234560005" },

  // ── Baterias ───────────────────────────────────────────────────────────
  { id: "2",   name: "Bateria Samsung S21",        price: 180.0, stock: 8,  category: "Baterias",  barcode: "7891234560010",
    complementos: [{ id: "c3", name: "Carregador Turbo 25W", price: 45.0 }] },
  { id: "20",  name: "Bateria iPhone 13",          price: 210.0, stock: 5,  category: "Baterias",  barcode: "7891234560011" },
  { id: "21",  name: "Bateria Motorola G60",       price: 120.0, stock: 10, category: "Baterias",  barcode: "7891234560012" },
  { id: "22",  name: "Bateria Xiaomi Redmi Note 11", price: 110.0, stock: 7, category: "Baterias", barcode: "7891234560013" },

  // ── Conectores ─────────────────────────────────────────────────────────
  { id: "3",   name: "Conector de Carga Motorola", price: 45.0,  stock: 12, category: "Conectores", barcode: "7891234560020",
    complementos: [{ id: "c4", name: "Cabo USB-C 1m", price: 20.0 }] },
  { id: "30",  name: "Conector de Carga Samsung",  price: 40.0,  stock: 15, category: "Conectores", barcode: "7891234560021" },
  { id: "31",  name: "Conector de Carga iPhone (Lightning)", price: 55.0, stock: 8, category: "Conectores", barcode: "7891234560022" },

  // ── Cabos ──────────────────────────────────────────────────────────────
  { id: "40",  name: "Cabo USB-C 1m Nylon",        price: 25.0,  stock: 40, category: "Cabos",     barcode: "7891234560030" },
  { id: "41",  name: "Cabo USB-C 2m Nylon",        price: 35.0,  stock: 30, category: "Cabos",     barcode: "7891234560031" },
  { id: "42",  name: "Cabo Lightning iPhone 1m",   price: 30.0,  stock: 25, category: "Cabos",     barcode: "7891234560032" },
  { id: "43",  name: "Cabo Micro-USB 1m",          price: 18.0,  stock: 50, category: "Cabos",     barcode: "7891234560033" },
  { id: "44",  name: "Cabo 3 em 1 (USB-C/Micro/iPhone)", price: 45.0, stock: 20, category: "Cabos", barcode: "7891234560034" },

  // ── Películas ──────────────────────────────────────────────────────────
  { id: "4",   name: "Película de Vidro 3D iPhone 13", price: 30.0, stock: 35, category: "Peliculas", barcode: "7891234560040" },
  { id: "50",  name: "Película de Vidro 3D Samsung A54", price: 28.0, stock: 40, category: "Peliculas", barcode: "7891234560041" },
  { id: "51",  name: "Película de Vidro Samsung A14",    price: 22.0, stock: 50, category: "Peliculas", barcode: "7891234560042" },
  { id: "52",  name: "Película de Vidro Motorola G84",   price: 22.0, stock: 45, category: "Peliculas", barcode: "7891234560043" },
  { id: "53",  name: "Película de Vidro Universal 6.5''", price: 18.0, stock: 60, category: "Peliculas", barcode: "7891234560044" },
  { id: "54",  name: "Película HPrime Full Cover iPhone 14", price: 55.0, stock: 15, category: "Peliculas", barcode: "7891234560045" },

  // ── Capinhas ───────────────────────────────────────────────────────────
  { id: "5",   name: "Capinha Anti-Impacto iPhone 13",   price: 45.0, stock: 25, category: "Capinhas",  barcode: "7891234560050" },
  { id: "60",  name: "Capinha Silicone Samsung A54",      price: 30.0, stock: 30, category: "Capinhas",  barcode: "7891234560051" },
  { id: "61",  name: "Capinha Militar Motorola G84",      price: 38.0, stock: 20, category: "Capinhas",  barcode: "7891234560052" },
  { id: "62",  name: "Capinha Transparente Universal",    price: 15.0, stock: 80, category: "Capinhas",  barcode: "7891234560053" },
  { id: "63",  name: "Capinha Carteira Couro Samsung",    price: 65.0, stock: 10, category: "Capinhas",  barcode: "7891234560054" },

  // ── Carregadores ───────────────────────────────────────────────────────
  { id: "70",  name: "Carregador Turbo 25W USB-C",       price: 65.0,  stock: 20, category: "Carregadores", barcode: "7891234560060" },
  { id: "71",  name: "Carregador Turbo 65W GaN",         price: 120.0, stock: 10, category: "Carregadores", barcode: "7891234560061" },
  { id: "72",  name: "Carregador Wireless 15W",          price: 85.0,  stock: 15, category: "Carregadores", barcode: "7891234560062" },
  { id: "73",  name: "Carregador Veicular USB-C",        price: 45.0,  stock: 25, category: "Carregadores", barcode: "7891234560063" },
  { id: "74",  name: "Power Bank 10000mAh",              price: 95.0,  stock: 12, category: "Carregadores", barcode: "7891234560064" },

  // ── Fones ──────────────────────────────────────────────────────────────
  { id: "80",  name: "Fone Bluetooth In-Ear",            price: 79.9,  stock: 20, category: "Fones",        barcode: "7891234560070" },
  { id: "81",  name: "Fone com Fio P2 3.5mm",           price: 25.0,  stock: 35, category: "Fones",        barcode: "7891234560071" },
  { id: "82",  name: "Fone USB-C com Microfone",         price: 45.0,  stock: 18, category: "Fones",        barcode: "7891234560072" },

  // ── Serviços ───────────────────────────────────────────────────────────
  { id: "90",  name: "Mão de Obra — Troca de Tela",      price: 50.0,  stock: 999, category: "Servicos" },
  { id: "91",  name: "Mão de Obra — Troca de Bateria",   price: 30.0,  stock: 999, category: "Servicos" },
  { id: "92",  name: "Mão de Obra — Conector de Carga",  price: 40.0,  stock: 999, category: "Servicos" },
  { id: "93",  name: "Limpeza e Higienização",           price: 25.0,  stock: 999, category: "Servicos" },
  { id: "94",  name: "Diagnóstico Técnico",              price: 0.0,   stock: 999, category: "Servicos" },
  { id: "95",  name: "Desbloqueio de Celular",           price: 50.0,  stock: 999, category: "Servicos" },
]

export function mergePdvCatalogWithInventory(
  base: PdvCatalogProduct[],
  inventory: InventoryItem[]
): PdvCatalogProduct[] {
  // Guard: if inventory is not yet loaded, return base as-is
  const safeInventory: InventoryItem[] = Array.isArray(inventory) ? inventory : []

  const baseIds = new Set(base.map((p) => p.id))

  // 1. Update base products with live inventory data
  const merged = base.map((p) => {
    const inv = safeInventory.find((i) => i.id === p.id)
    if (!inv) return p
    const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
    return {
      ...p,
      stock: inv.stock,
      price: unit,
      barcode: inv.barcode || p.barcode,
      precoPorKg: inv.precoPorKg ?? inv.price,
      vendaPorPeso: inv.vendaPorPeso,
      atributos: inv.atributos?.length ? inv.atributos : p.atributos,
    }
  })

  // 2. Append inventory items NOT present in base (e.g., products added via Estoque panel)
  for (const inv of safeInventory) {
    if (baseIds.has(inv.id)) continue
    const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
    merged.push({
      id: inv.id,
      name: inv.name,
      barcode: inv.barcode,
      price: unit,
      stock: inv.stock,
      category: inv.category ?? "Outros",
      vendaPorPeso: inv.vendaPorPeso,
      precoPorKg: inv.precoPorKg,
      atributos: inv.atributos,
    })
  }

  return merged
}

export function newPdvLineId(inventoryId: string) {
  return `${inventoryId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
