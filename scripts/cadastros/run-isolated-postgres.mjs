/** Only the fresh GitHub Actions PostgreSQL service; no .env, migrations or backfill. */
import { spawnSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { assertIsolatedCadastrosDatabase } from "./isolated-postgres-guard.mjs"

const database = assertIsolatedCadastrosDatabase(process.env)
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" })
  if (result.error || result.status !== 0) throw new Error("CAD_R2_021_ISOLATED_CHECK_FAILED")
}
// db push materializes the unchanged schema in an empty disposable database.
// It never runs migrate deploy, existing migrations, seeds or the 019 backfill.
run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"])
const { PrismaClient } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
try {
  if (await db.store.count() || await db.cliente.count() || await db.produto.count()) {
    throw new Error("CAD_R2_021_DATABASE_MUST_BE_EMPTY")
  }
  await db.store.createMany({ data: [{ id: "loja-1", name: "Synthetic CI 1" }, { id: "loja-2", name: "Synthetic CI 2" }] })
  const now = new Date().toISOString()
  const old = "2020-01-01T12:00:00.000Z"
  // Deliberately nontrivial corpus for the unchanged 16 SQL integration tests:
  // >5000 rows, both review states, legacy/null fiscal metadata, missing barcodes,
  // valid and synthetic SKUs, distinct store batches and competing search ranks.
  const data = Array.from({ length: 5102 }, (_, i) => {
    const lote = { batchId: i % 2 ? "ci-batch-a" : "ci-batch-b", importadoEm: i % 2 ? old : now, statusRevisao: i % 3 ? "pendente" : "revisado" }
    const fiscal = i % 4 === 0 ? { ncm: "85061020", cest: "2101900" } : i % 4 === 1 ? { ncm: "85061020" } : {}
    return {
      id: `ci-product-${i}`, storeId: "loja-2", name: i === 0 ? "PILHA Synthetic" : `Item Synthetic ${i}`,
      sku: i === 1 ? "IMP-4471" : i === 2 ? "IMP-9902" : i < 8 ? `gc-linha-${i}` : `CI${i}`,
      barcode: i === 0 ? "7892840819170" : i % 5 ? `999${String(i).padStart(10, "0")}` : null,
      category: "CI", brand: i === 1 ? "PILH Marca" : "Synthetic", supplierName: i % 2 ? "FORNECEDOR ALFA CORR001" : "CI Supplier",
      price: i % 3 ? 10 : 0, stock: 0,
      metadata: i % 17 === 0 ? { ncm: "85061020", importacao: { ultimoLote: lote } } : { fiscal, importacao: { ultimoLote: lote } },
    }
  })
  for (let i = 0; i < data.length; i += 500) await db.produto.createMany({ data: data.slice(i, i + 500) })
  await db.produto.create({ data: {
    id: "ci-other-store", storeId: "loja-1", name: "Synthetic other store", barcode: "7892840819170", price: 10,
    metadata: { importacao: { ultimoLote: { batchId: "ci-other-batch", importadoEm: now, statusRevisao: "revisado" } } },
  } })
} finally { await db.$disconnect() }

const evidence = "docs/ai-execution/_evidence/CAD-R2-021-CLIENTE-TEXTO-VOZ"
await mkdir(evidence, { recursive: true })
run(["node_modules/vitest/vitest.mjs", "run",
  "lib/cadastros/client-document-unique-concurrency.integration.test.ts",
  "lib/cadastros/produtos-listagem-sql.integration.test.ts", "--maxWorkers=1", "--reporter=default", "--reporter=json", `--outputFile=${evidence}/postgres-integration.json`,
], { ...process.env, CAD_R2_019_TEST_DATABASE_URL: database, PRODUTOS_LISTAGEM_SQL_IT: "1" })
await writeFile(`${evidence}/postgres-isolation.json`, JSON.stringify({
  target: "Fresh GitHub Actions PostgreSQL service on loopback", syntheticProducts: 5103,
  schemaSourceChanged: false, schemaMaterialization: "prisma db push in disposable CI only",
  migrationsExecuted: false, backfillExecuted: false, productionDbWrites: 0,
}, null, 2) + "\n")
