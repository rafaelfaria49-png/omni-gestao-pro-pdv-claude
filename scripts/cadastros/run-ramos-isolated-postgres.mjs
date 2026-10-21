/** Mesmo guard restrito da CI existente; novo serviço vazio, sem ambiente produtivo. */
import { spawnSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { assertIsolatedCadastrosDatabase } from "./isolated-postgres-guard.mjs"

const database = assertIsolatedCadastrosDatabase(process.env)
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" })
  if (result.error || result.status !== 0) throw new Error("RAMOS_ISOLATED_CHECK_FAILED")
}
// Materializa somente o schema inalterado no Postgres vazio deste job.
// Não executa migrations, seeds, backfill nem lê .env.
run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"])
const { PrismaClient } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
try {
  if (await db.store.count() || await db.produto.count() || await db.venda.count()) throw new Error("RAMOS_DATABASE_MUST_BE_EMPTY")
} finally { await db.$disconnect() }
await mkdir("test-results/ramos", { recursive: true })
run(["node_modules/vitest/vitest.mjs", "run", "lib/cadastros/business-sales.integration.test.ts", "--maxWorkers=1", "--reporter=default", "--reporter=json", "--outputFile=test-results/ramos/postgres-integration.json"], { ...process.env, RAMOS_TEST_DATABASE_URL: database })
await writeFile("test-results/ramos/postgres-isolation.json", JSON.stringify({ target: "Fresh CI PostgreSQL service on loopback", schemaChanged: false, schemaMaterialization: "db push on empty disposable database", migrationsExecuted: false, productionWrites: 0 }, null, 2) + "\n")
