import { PrismaClient } from "../generated/prisma/index.js"

function maskUrl(input) {
  try {
    const u = new URL(input)
    const host = u.host
    const db = u.pathname?.replace(/^\//, "") || ""
    const user = u.username ? `${u.username.slice(0, 2)}***` : ""
    return `${u.protocol}//${user}${user ? "@" : ""}${host}/${db ? db.slice(0, 2) + "***" : ""}`
  } catch {
    return input ? String(input).slice(0, 6) + "***" : "(empty)"
  }
}

function topN(obj, n = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

async function main() {
  const prisma = new PrismaClient()
  const dbUrl = process.env.DATABASE_URL || ""
  const directUrl = process.env.DIRECT_URL || ""

  console.log("=== OmniGestão: check-prod-data ===")
  console.log("node_env:", process.env.NODE_ENV || "(unset)")
  console.log("database_url:", maskUrl(dbUrl))
  console.log("direct_url:", directUrl ? maskUrl(directUrl) : "(unset)")

  try {
    await prisma.$connect()

    const [storesCount, clientesCount, produtosCount, vendasCount] = await Promise.all([
      prisma.store.count(),
      prisma.cliente.count(),
      prisma.produto.count(),
      prisma.venda.count(),
    ])

    console.log("")
    console.log("counts:", { stores: storesCount, clientes: clientesCount, produtos: produtosCount, vendas: vendasCount })

    const stores = await prisma.store.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, createdAt: true },
      take: 25,
    })
    console.log("")
    console.log("stores (first 25):")
    for (const s of stores) {
      console.log("-", s.id, s.name ? `(${String(s.name).slice(0, 60)})` : "", s.createdAt?.toISOString?.() ?? "")
    }

    const [clientesByStore, produtosByStore, vendasByStore] = await Promise.all([
      prisma.cliente.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
      prisma.produto.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
      prisma.venda.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
    ])

    const mapClientes = Object.fromEntries(clientesByStore.map((r) => [r.storeId, r._count._all]))
    const mapProdutos = Object.fromEntries(produtosByStore.map((r) => [r.storeId, r._count._all]))
    const mapVendas = Object.fromEntries(vendasByStore.map((r) => [r.storeId, r._count._all]))

    console.log("")
    console.log("top storeIds by clientes:", topN(mapClientes, 12))
    console.log("top storeIds by produtos:", topN(mapProdutos, 12))
    console.log("top storeIds by vendas:", topN(mapVendas, 12))

    // quick sanity: is loja-1 present?
    const loja1 = stores.some((s) => s.id === "loja-1")
    console.log("")
    console.log("sanity:", {
      has_loja_1: loja1,
      legacy_primary_store_id: "loja-1",
    })
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}

main().catch((e) => {
  console.error("check-prod-data failed:", e?.message || e)
  process.exitCode = 1
})

