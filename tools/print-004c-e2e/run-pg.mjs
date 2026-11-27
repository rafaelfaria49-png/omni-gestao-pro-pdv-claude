/**
 * Resets a disposable print_lab_* database (main baseline + 004B + 004C migrations) and runs the
 * PostgreSQL-backed vitest suites with PRINT_PG_URL. Requires PRINT_LAB_DIR (see pg-lab.mjs) and a started lab.
 * Usage: node tools/print-004c-e2e/run-pg.mjs [db=print_lab_e2e] [vitest files...]
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const db = process.argv[2] && !process.argv[2].endsWith(".ts") ? process.argv[2] : "print_lab_e2e"
const files = process.argv.slice(2).filter(a => a.endsWith(".ts"))
const port = Number(process.env.PRINT_LAB_PORT || 55474)
const step = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
step([path.join(root, "tools/print-004c-e2e/pg-lab.mjs"), "reset", db])
const url = `postgresql://omni_print_lab_owner:lab@127.0.0.1:${port}/${db}`
// Only lab variables reach the test process: no .env, no commercial DATABASE_URL.
step([path.join(root, "node_modules/vitest/vitest.mjs"), "run", ...(files.length ? files : ["tools/print-004c-e2e/scenarios.pg.test.ts"])],
  { PRINT_PG_URL: url, DATABASE_URL: url, DIRECT_URL: url, NODE_ENV: "test" })
