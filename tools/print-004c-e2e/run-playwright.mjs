/**
 * Resets a disposable print_lab_* database and runs the 004C Playwright suite (PDV Clássico real + API real + agent
 * with SIMULATED spooler). Requires PRINT_LAB_DIR and a started lab (pg-lab.mjs). No .env is loaded.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const db = "print_lab_pw"
const port = Number(process.env.PRINT_LAB_PORT || 55474)
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } }).status ?? 1
if (run([path.join(root, "tools/print-004c-e2e/pg-lab.mjs"), "reset", db]) !== 0) process.exit(1)
const url = `postgresql://omni_print_lab_owner:lab@127.0.0.1:${port}/${db}`
process.exitCode = run([path.join(root, "node_modules/@playwright/test/cli.js"), "test", "-c", "e2e/print-direct.playwright.config.ts", ...process.argv.slice(2)],
  { PRINT_PG_URL: url, DATABASE_URL: url, DIRECT_URL: url })
