/** Reproducible D03 battery. All DB runners reset only print_lab_* on the loopback lab. No .env is loaded. */
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const out = path.join(root, "docs/print-004c-e2e/evidence/d03")
mkdirSync(out, { recursive: true })
const unit = ["node_modules/vitest/vitest.mjs", "run", "lib/printing/direct", "tools/omni-print-agent", "tools/print-d03/options.test.ts", "tools/print-d02/d02-guard.test.ts",
  "components/dashboard/vendas/reimpressao-registrada.static.test.ts", "lib/vendas/venda-cupom-mapper.test.ts"]
const pg = (db, file) => ["tools/print-004c-e2e/run-pg.mjs", db, file]
export const steps = [
  ["generator", ["tools/print-004c-e2e/generate-agent-migration.mjs", "--check"]],
  ["d02-generator", ["tools/print-d02/generate.mjs", "--check"]],
  ["unit", unit, { PRINT_WINDOWS_SPOOLER_TEST: process.platform === "win32" ? "1" : "0" }],
  ["offline-regression", ["node_modules/vitest/vitest.mjs", "run", "lib/vendas/sale-sync-engine.test.ts", "lib/vendas/sale-client-sync.test.ts",
    "lib/vendas/pending-sync-classification.test.ts", "lib/vendas/offline-sync.component.test.ts",
    "lib/pdv/pending-sale-attempt.test.ts", "lib/pdv/pending-local-effects.test.ts", "lib/pdv/pending-identity-restore.test.ts", "lib/pdv/classic-offline-sequence.component.test.ts", "--maxWorkers=1"]],
  ["retention-pg", pg("print_lab_d03", "tools/print-d03/retention.pg.test.ts")],
  ["offline-pg", ["tools/print-d03/offline.mjs"]],
  ["scenarios-pg", pg("print_lab_d03_regression", "tools/print-004c-e2e/scenarios.pg.test.ts")],
  ["two-agents-pg", pg("print_lab_d03_two", "tools/print-004c-e2e/two-agents.pg.test.ts"), { PRINT_EVIDENCE_FILE: path.join(out, "two-agents.jsonl") }],
  ["synthetic-pg", pg("print_lab_d03_synthetic", "tools/print-004c-e2e/synthetic-regression.pg.test.ts")],
  ["d02-pg", pg("print_lab_d03_d02", "tools/print-d02/d02-migrations.pg.test.ts"), { PRINT_LAB_LAYOUT: "baseline" }],
  ["d02-rehearsal", pg("print_lab_d03_d02r", "tools/print-004c-e2e/d02-rehearsal.pg.test.ts"), { PRINT_LAB_LAYOUT: "baseline" }],
  ["playwright", ["tools/print-004c-e2e/run-playwright.mjs"]],
  ["typecheck", ["--max-old-space-size=4096", "node_modules/typescript/lib/tsc.js", "--noEmit"]],
  ["eslint", ["node_modules/eslint/bin/eslint.js", "lib/printing/direct/retention.ts", "lib/printing/direct/core.ts", "lib/printing/direct/status.ts", "lib/printing/direct/codec.ts", "lib/printing/direct/activation.ts", "lib/printing/direct/homologation.mjs", "lib/printing/direct/homologation.test.ts", "tools/print-d05", "tools/print-d03", "tools/print-004c-e2e/pg-lab.mjs", "tools/print-004c-e2e/d02-rehearsal.pg.test.ts", "tools/print-004c-e2e/manifest.mjs", "tools/print-004c-e2e/matrix-80.mjs", "--ignore-pattern", "tools/print-d05/.artifacts/**"]],
  ["build", ["scripts/vercel-build.mjs"]],
]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const summary = { goal: "OMNI-PRINT-D03-EXPURGO-RETENCAO-CHAVES-001", at: new Date().toISOString(), node: process.version,
  productionExecution: false, physicalPrint: "PENDING_NO_HARDWARE", steps: [] }
const selected = process.argv.slice(2)
for (const [name, args, extra] of steps) {
  if (selected.length && !selected.includes(name)) continue
  const started = Date.now()
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, timeout: 1200000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: "postgresql://test:test@127.0.0.1:1/isolated", DIRECT_URL: "postgresql://test:test@127.0.0.1:1/isolated",
      MIGRATION_AUTHORITY_ENABLED: "false", VERCEL: "0", VERCEL_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: "isolated-d03-build-only", AUTH_TRUST_HOST: "true", NEXTAUTH_URL: "http://localhost:3000", FORCE_COLOR: "0", NO_COLOR: "1", ...extra } })
  const log = ((r.stdout ?? "") + (r.stderr ?? "")).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/[\t ]+$/gm, "")
  writeFileSync(path.join(out, name + ".log"), log + `\nexit=${r.status}\n`)
  summary.steps.push({ step: name, status: r.status === 0 ? "PASS" : "FAIL", exit: r.status, seconds: Math.round((Date.now() - started) / 1000),
    tests: /Tests\s+([^\n]+)/.exec(log)?.[1] ?? /(\d+ passed[^\n]*)/.exec(log)?.[1] ?? null })
  console.log(`${name}: ${r.status === 0 ? "PASS" : "FAIL"} (${Math.round((Date.now() - started) / 1000)}s)`)
  writeFileSync(path.join(out, selected.length ? `summary-${selected.join("-")}.json` : "summary.json"), JSON.stringify(summary, null, 2) + "\n")
}
process.exitCode = summary.steps.every(s => s.status === "PASS") ? 0 : 1
}
