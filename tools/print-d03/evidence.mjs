/** Consolidate actual exit-bearing logs; missing evidence is PENDING, never PASS. */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/print-004c-e2e/evidence/d03")
const provenanceFile = path.join(dir, "RUN.json")
if (process.argv.includes("--reset")) {
  // Only derived evidence files in this fixed directory; never recurse or touch sources/other worktrees.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && (/\.log$/.test(entry.name) || /^summary.*\.json$/.test(entry.name) ||
      ["RUN.json", "VALIDACAO_D03.json", "mutations.json", "two-agents.jsonl"].includes(entry.name))) unlinkSync(path.join(dir, entry.name))
  }
  writeFileSync(provenanceFile, JSON.stringify({ startedAt: new Date().toISOString(), platform: process.platform,
    githubRunId: process.env.GITHUB_RUN_ID ?? null, githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null, commit: process.env.GITHUB_SHA ?? null }, null, 2) + "\n")
  console.log("D03 evidence initialized for this run")
  process.exit(0)
}
const provenance = existsSync(provenanceFile) ? JSON.parse(readFileSync(provenanceFile, "utf8")) : null
const thisRun = process.env.GITHUB_ACTIONS !== "true" || (provenance?.githubRunId === process.env.GITHUB_RUN_ID && provenance?.githubRunAttempt === process.env.GITHUB_RUN_ATTEMPT)
const expected = ["generator", "d02-generator", "unit", "offline-regression", "retention-pg", "offline-pg", "scenarios-pg", "two-agents-pg", "synthetic-pg", "d02-pg", "d02-rehearsal", "playwright", "typecheck", "eslint", "build"]
const steps = expected.map(step => {
  const file = path.join(dir, step + ".log")
  if (!thisRun || !existsSync(file)) return { step, status: "PENDING" }
  const log = readFileSync(file, "utf8").replace(/\r\n/g, "\n"), exit = /(?:^|\n)exit=(-?\d+|null)\s*$/.exec(log)
  return { step, status: exit ? exit[1] === "0" ? "PASS" : "FAIL" : "PENDING", exit: exit && exit[1] !== "null" ? Number(exit[1]) : null,
    tests: /Tests\s+([^\n]+)/.exec(log)?.[1] ?? /(\d+ passed[^\n]*)/.exec(log)?.[1] ?? null,
    sha256: createHash("sha256").update(log).digest("hex") }
})
const mutationFile = path.join(dir, "mutations.json")
const mutations = existsSync(mutationFile) ? JSON.parse(readFileSync(mutationFile, "utf8")) : null
steps.push({ step: "mutation", status: !thisRun || !mutations ? "PENDING" : mutations.sourceRestored && mutations.results.length === 8 && mutations.results.every(r => r.status === "KILLED" && Number.isInteger(r.exit) && r.exit !== 0) ? "PASS" : "FAIL" })
const status = steps.some(s => s.status === "FAIL") ? "FAIL" : steps.every(s => s.status === "PASS") ? "PASS" : "PENDING"
writeFileSync(path.join(dir, "VALIDACAO_D03.json"), JSON.stringify({ goal: "OMNI-PRINT-D03-EXPURGO-RETENCAO-CHAVES-001", at: new Date().toISOString(),
  status, provenance: provenance ?? { source: "LOCAL_LOGS" }, productionExecution: false, physicalHomologation: "PENDING", steps }, null, 2) + "\n")
console.log(`D03 evidence: ${status}`)
