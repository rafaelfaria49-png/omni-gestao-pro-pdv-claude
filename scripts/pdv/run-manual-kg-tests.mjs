/** Reproducible migration + transaction proof, only on the dedicated fresh local database. */
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "../../generated/prisma/index.js"
const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
if (process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.MIGRATION_AUTHORITY_ENABLED !== "false") throw Error("MANUAL_KG_DISPOSABLE_DATABASE_REQUIRED")
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  try { await readFile(name); throw Error("ENV_FILES_FORBIDDEN") } catch (e) { if (e.code !== "ENOENT") throw e }
}
const out = "test-results/manual-kg"
await mkdir(out, { recursive: true })
const db = new PrismaClient({ datasourceUrl: url })
function run(args, extra = {}) {
  const result = spawnSync(process.execPath, args, { env: { ...process.env, ...extra }, stdio: "inherit", windowsHide: true })
  if (result.error || result.status !== 0) throw Error("MANUAL_KG_TEST_STEP_FAILED: " + args.join(" "))
}
try {
  const [identity] = await db.$queryRawUnsafe("SELECT current_database() AS db, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port")
  if (identity.db !== "manual_kg_sale_isolated" || identity.role !== "manual_kg" || identity.host !== "127.0.0.1" || identity.port !== 55479) throw Error("DATABASE_IDENTITY_MISMATCH")
  const [{ count }] = await db.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
  if (count !== 0) throw Error("FRESH_DATABASE_REQUIRED")
  let schema = await readFile("prisma/schema.prisma", "utf8")
  for (const [model, fields] of [["Produto", ["stock"]], ["ProdutoDeposito", ["quantidade"]], ["MovimentacaoEstoque", ["quantidade", "estoqueAntes", "estoqueDepois"]]]) {
    const regex = new RegExp("model " + model + " \\{[\\s\\S]*?\\n\\}")
    const match = schema.match(regex)
    if (!match) throw Error("MODEL_NOT_FOUND: " + model)
    let block = match[0]
    for (const field of fields) {
      const column = new RegExp("(\\n\\s*" + field + "\\s+)Float(\\s)")
      if (!column.test(block)) throw Error("FLOAT_COLUMN_NOT_FOUND: " + field)
      block = block.replace(column, "$1Int$2")
    }
    schema = schema.replace(match[0], block)
  }
  schema = schema.replace(/(quantidade\s+)Int\?/, "$1Int").replace(/^.*quantidadeKg\s+Decimal.*\r?\n/m, "")
  const baseline = out + "/schema-before.prisma"
  await writeFile(baseline, schema)
  run(["node_modules/prisma/build/index.js", "db", "push", "--schema", baseline, "--skip-generate"])
  await db.$executeRawUnsafe("INSERT INTO stores (id, name, \"updatedAt\") VALUES ('kg-historical', 'Histórico sintético', now())")
  await db.$executeRawUnsafe("INSERT INTO estoque_produtos (id, \"storeId\", name, stock, \"updatedAt\") VALUES ('kg-historical-un', 'kg-historical', 'UN histórica', 2147483647, now())")
  await db.$executeRawUnsafe("INSERT INTO vendas (id, \"storeId\", \"pedidoId\", total, at) VALUES ('kg-historical-sale', 'kg-historical', 'KG-HISTORY-UN', 20, now())")
  await db.$executeRawUnsafe("INSERT INTO venda_itens (id, \"vendaId\", \"inventoryId\", nome, quantidade, \"precoUnitario\", \"lineTotal\") VALUES ('kg-historical-item', 'kg-historical-sale', 'kg-historical-un', 'UN histórica', 2147483647, 20, 20)")
  const snapshot = () => db.$queryRawUnsafe("SELECT (SELECT stock::text FROM estoque_produtos WHERE id = 'kg-historical-un') AS stock, (SELECT quantidade::text FROM venda_itens WHERE id = 'kg-historical-item') AS quantity")
  const before = await snapshot()
  for (const migration of ["20261025120000_estoque_quantidade_fracionada", "20261029120000_manual_kg_sale_quantity", "20261106120000_manual_kg_title_guard_indexed"]) {
    run(["node_modules/prisma/build/index.js", "db", "execute", "--schema", "prisma/schema.prisma", "--file", "prisma/migrations/" + migration + "/migration.sql"])
  }
  const after = await snapshot()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("HISTORICAL_INTEGER_VALUES_CHANGED")
  await writeFile(out + "/migration.json", JSON.stringify({ identity, before, after, historicalUnPreserved: true, newMigration: "20261029120000_manual_kg_sale_quantity", productionWrites: 0 }, null, 2))
} finally { await db.$disconnect() }
run(["scripts/pdv/verify-manual-kg-migration.mjs"])
run(["node_modules/vitest/vitest.mjs", "run", "lib/vendas/manual-kg-contract.test.ts", "lib/vendas/manual-kg-hardening.test.ts", "lib/vendas/manual-kg-sale.pg.test.ts", "lib/vendas/manual-kg-padaria-flow.pg.test.ts", "lib/pdv/devolucao/f8-venda-kg.pg.test.ts", "--maxWorkers=1", "--reporter=json", "--outputFile=test-results/manual-kg/integration.json"], {
  MANUAL_KG_TEST_DATABASE_URL: url, PDV_MANUAL_KG_RELEASE: "PDV-PADARIA-KG-RELEASE-HARDENING-002", PDV_MANUAL_KG_STORES: "kg-sale-a,kg-sale-b,kg-pad-a,kg-pad-b,kg-f8-a,kg-f8-b",
})
