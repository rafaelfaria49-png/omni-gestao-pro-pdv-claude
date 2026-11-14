/** Targeted destructive mutants of critical invariants, restored in finally. Disposable database only. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const source = path.join(root, "lib/printing/direct/retention.ts"), original = readFileSync(source, "utf8")
const out = path.join(root, "docs/print-004c-e2e/evidence/d03")
mkdirSync(out, { recursive: true })
const mutants = [
  ["seven-days", "R01", [["nowMs - RETENTION_MS", "nowMs"]]],
  ["held-egress", "R05", [["heldIds.has(a.id)", "false"]]],
  ["evidence-details", "R05", [["SAFE_DETAIL_TYPES.has(e.event_type)", "true"], ["e.safe_empty_details &&", "true &&"]]],
  ["idempotent", "R02", [["c.has_content && !c.payload_purged_at", "true"]]],
  ["document-lock", "R11", [["FOR UPDATE SKIP LOCKED", ""]]],
  ["unknown-is-not-final", "R15", [['"BROWSER_AVAILABLE", "PRE_SEND_FAILED", "CANCELLED", "EXPIRED"', '"BROWSER_AVAILABLE", "PRE_SEND_FAILED", "CANCELLED", "EXPIRED", "UNKNOWN"'],
    ['["STARTED", "UNKNOWN"].includes(a.result)', 'a.result === "STARTED"']]],
  ["key-reference", "R02", [["snapshotKeyRef: jobContent ? j.snapshot_key_ref : null", "snapshotKeyRef: null"]]],
  ["exact-cancellation-date", "R14", [[
    'e.copy_id === c.id && e.event_type === "COPY_" + c.state',
    '(e.copy_id === c.id && e.event_type === "COPY_" + c.state) || (c.state === "CANCELLED" && e.event_type === "BROWSER_FALLBACK_PRINTED")']]],
]
const results = []
const port = Number(process.env.PRINT_LAB_PORT || 55474)
if (!process.env.PRINT_LAB_DIR || !Number.isInteger(port) || port < 1024) throw new Error("DISPOSABLE_LAB_REQUIRED")
try {
  for (const [name, test, replacements] of mutants) {
    let changed = original
    for (const [from, to] of replacements) {
      if (!changed.includes(from)) throw new Error("MUTATION_SOURCE_MISMATCH: " + name)
      changed = changed.replace(from, to)
    }
    writeFileSync(source, changed)
    const reset = spawnSync(process.execPath, ["tools/print-004c-e2e/pg-lab.mjs", "reset", "print_lab_d03_mutation"],
      { cwd: root, encoding: "utf8", windowsHide: true, env: process.env, timeout: 120000, maxBuffer: 16 << 20 })
    if (reset.status !== 0) throw new Error("MUTATION_LAB_RESET_FAILED")
    const url = `postgresql://omni_print_lab_owner:lab@127.0.0.1:${port}/print_lab_d03_mutation`
    const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tools/print-d03/retention.pg.test.ts", "-t", test],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 180000, maxBuffer: 16 << 20,
        env: { ...process.env, PRINT_PG_URL: url, DATABASE_URL: url, DIRECT_URL: url, FORCE_COLOR: "0", NO_COLOR: "1" } })
    const log = ((r.stdout ?? "") + (r.stderr ?? "")).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    // A collection error, crash or timeout never counts as killing a mutant.
    const killed = Number.isInteger(r.status) && r.status !== 0 && /AssertionError|expected .* to |promise resolved .* instead of rejecting/.test(log) && /1 failed/.test(log)
    results.push({ mutant: name, test, status: killed ? "KILLED" : "SURVIVED_OR_INVALID", exit: r.status })
    writeFileSync(path.join(out, `mutation-${name}.log`), log + `\nexit=${r.status}\n`)
    console.log(`${name}: ${results.at(-1).status}`)
    writeFileSync(source, original)
  }
} finally { writeFileSync(source, original) }
writeFileSync(path.join(out, "mutations.json"), JSON.stringify({ at: new Date().toISOString(), sourceRestored: readFileSync(source, "utf8") === original, results }, null, 2) + "\n")
process.exitCode = results.length === mutants.length && results.every(r => r.status === "KILLED") ? 0 : 1
