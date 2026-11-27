/** Reuse the established offline-sale integration suite, on a separate DB in this disposable cluster only. */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
const port = Number(process.env.PRINT_LAB_PORT), dir = process.env.PRINT_LAB_DIR
if (!dir || !path.isAbsolute(dir) || !Number.isInteger(port) || port < 1024 || port === 5432 ||
  !existsSync(path.join(dir, "pgdata/PG_VERSION")) || !existsSync(path.join(dir, "baseline-main.sql"))) throw new Error("DISPOSABLE_LAB_REQUIRED")
const bin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin"
const psql = path.join(bin, process.platform === "win32" ? "psql.exe" : "psql")
const run = (args, role = "pgadmin") => {
  const r = spawnSync(psql, ["-h", "127.0.0.1", "-p", String(port), "-U", role, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { stdio: "inherit", windowsHide: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run(["-d", "postgres", "-c", "DROP DATABASE IF EXISTS pdv_offline_sync_disposable WITH (FORCE)"])
run(["-d", "postgres", "-c", "CREATE DATABASE pdv_offline_sync_disposable OWNER omni_print_lab_owner"])
run(["-d", "pdv_offline_sync_disposable", "-1", "-f", path.join(dir, "baseline-main.sql")], "omni_print_lab_owner")
const url = `postgresql://omni_print_lab_owner:lab@127.0.0.1:${port}/pdv_offline_sync_disposable`
const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "lib/vendas/offline-sync.integration.test.ts"], { stdio: "inherit", windowsHide: true,
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PDV_OFFLINE_SYNC_PG_URL: url, RAMOS_TEST_DATABASE_URL: "", MIGRATION_AUTHORITY_ENABLED: "false" } })
process.exitCode = r.status ?? 1
