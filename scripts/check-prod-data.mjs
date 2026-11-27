import { PrismaClient } from "../generated/prisma/index.js"
import { productionAuditDatasource } from "../lib/db/datasource-policy.mjs"

function topN(obj, n = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

async function main() {
  const datasourceUrl = productionAuditDatasource()
  const prisma = new PrismaClient({ datasourceUrl, log: [] })

  try {
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SET TRANSACTION READ ONLY`
      const [storesCount, clientesCount, produtosCount, vendasCount] = await Promise.all([
        db.store.count(),
        db.cliente.count(),
        db.produto.count(),
        db.venda.count(),
      ])

      console.log("")
      console.log("counts:", { stores: storesCount, clientes: clientesCount, produtos: produtosCount, vendas: vendasCount })

      const stores = await db.store.findMany({
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
        db.cliente.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
        db.produto.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
        db.venda.groupBy({ by: ["storeId"], _count: { _all: true } }).catch(() => []),
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
    })
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error.name === "DatasourcePolicyError" ? error.message : "PRODUCTION_READ_ONLY_AUDIT_FAILED")
  process.exitCode = 1
})
