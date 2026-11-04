/**
 * OMNI-PRINT-004C — full local battery (disposable PostgreSQL only). Writes one log per step and a summary JSON to
 * docs/print-004c-e2e/evidence/. Requires PRINT_LAB_DIR (started lab, see pg-lab.mjs).
 * Usage: node tools/print-004c-e2e/run-all.mjs
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const out = path.join(root, "docs/print-004c-e2e/evidence")
mkdirSync(out, { recursive: true })
const node = process.execPath
const t = (f) => path.join(root, f)
const steps = [
  ["generator-check", [t("tools/print-004c-e2e/generate-agent-migration.mjs"), "--check"], {}],
  ["source-hygiene", [t("tools/print-004c-e2e/source-hygiene.mjs"), ...process.argv.slice(2)], {}],
  ["unit-and-windows-agent", [t("node_modules/vitest/vitest.mjs"), "run", "lib/printing/direct", "tools/omni-print-agent"], { PRINT_WINDOWS_SPOOLER_TEST: "1" }],
  ["pg-scenarios", [t("tools/print-004c-e2e/run-pg.mjs"), "print_lab_e2e", "tools/print-004c-e2e/scenarios.pg.test.ts"], {}],
  ["pg-synthetic-004b-regression", [t("tools/print-004c-e2e/run-pg.mjs"), "print_lab_syn", "tools/print-004c-e2e/synthetic-regression.pg.test.ts"], {}],
  ["pg-two-agent-processes", [t("tools/print-004c-e2e/run-pg.mjs"), "print_lab_two", "tools/print-004c-e2e/two-agents.pg.test.ts"], { PRINT_EVIDENCE_FILE: path.join(out, "p1-1-two-processes.jsonl") }],
  ["pg-index-strategy", [t("tools/print-004c-e2e/run-pg.mjs"), "print_lab_idx", "tools/print-004c-e2e/index-strategy.pg.test.ts"], { PRINT_LAB_LAYOUT: "baseline" }],
  ["pg-d02-rehearsal", [t("tools/print-004c-e2e/run-pg.mjs"), "print_lab_d02", "tools/print-004c-e2e/d02-rehearsal.pg.test.ts"], { PRINT_LAB_LAYOUT: "baseline" }],
  ["pg-future-layout-apply", [t("tools/print-004c-e2e/pg-lab.mjs"), "reset", "print_lab_future"], { PRINT_LAB_LAYOUT: "future" }],
  ["playwright-pdv-classic", [t("tools/print-004c-e2e/run-playwright.mjs")], {}],
]
const summary = []
for (const [name, args, env] of steps) {
  const started = Date.now()
  const r = spawnSync(node, args, { cwd: root, env: { ...process.env, ...env, FORCE_COLOR: "0", NO_COLOR: "1" }, encoding: "utf8", maxBuffer: 64 << 20, timeout: 900_000 })
  const log = (r.stdout ?? "") + (r.stderr ?? "")
  writeFileSync(path.join(out, `${name}.log`), log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""))
  const tests = /Tests\s+(\d+ passed[^\n]*)/.exec(log)?.[1] ?? /(\d+ passed[^\n]*)/.exec(log)?.[1] ?? null
  summary.push({ step: name, status: r.status === 0 ? "PASS" : "FAIL", exitCode: r.status, tests, seconds: Math.round((Date.now() - started) / 1000),
    logSha256: createHash("sha256").update(readFileSync(path.join(out, `${name}.log`))).digest("hex") })
  console.log(`${name}: ${r.status === 0 ? "PASS" : "FAIL"} ${tests ?? ""}`)
}
writeFileSync(path.join(out, "battery-summary.json"), JSON.stringify({ goal: "OMNI-PRINT-004C-INTEGRACAO-END-TO-END-001", at: new Date().toISOString(),
  transport: "SIMULATED (FakeSpooler) + real Windows PowerShell host without printer", physicalPrint: "NOT_TESTED_NO_PRINTER", steps: summary }, null, 2))
process.exitCode = summary.every(s => s.status === "PASS") ? 0 : 1
