/** Consolidate actual exit-bearing logs; missing evidence is PENDING, never PASS. */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/print-004c-e2e/evidence/d03")
const expected = ["generator", "d02-generator", "unit", "offline-regression", "retention-pg", "offline-pg", "scenarios-pg", "two-agents-pg", "synthetic-pg", "d02-pg", "d02-rehearsal", "playwright", "typecheck", "eslint", "build"]
const steps = expected.map(step => {
  const file = path.join(dir, step + ".log")
  if (!existsSync(file)) return { step, status: "PENDING" }
  const log = readFileSync(file, "utf8").replace(/\r\n/g, "\n"), exit = /\nexit=(\d+)\s*$/.exec(log)
  return { step, status: exit ? exit[1] === "0" ? "PASS" : "FAIL" : "PENDING", exit: exit ? Number(exit[1]) : null,
    tests: /Tests\s+([^\n]+)/.exec(log)?.[1] ?? /(\d+ passed[^\n]*)/.exec(log)?.[1] ?? null,
    sha256: createHash("sha256").update(log).digest("hex") }
})
const mutationFile = path.join(dir, "mutations.json")
const mutations = existsSync(mutationFile) ? JSON.parse(readFileSync(mutationFile, "utf8")) : null
steps.push({ step: "mutation", status: !mutations ? "PENDING" : mutations.sourceRestored && mutations.results.length === 8 && mutations.results.every(r => r.status === "KILLED") ? "PASS" : "FAIL" })
const status = steps.some(s => s.status === "FAIL") ? "FAIL" : steps.every(s => s.status === "PASS") ? "PASS" : "PENDING"
writeFileSync(path.join(dir, "VALIDACAO_D03.json"), JSON.stringify({ goal: "OMNI-PRINT-D03-EXPURGO-RETENCAO-CHAVES-001", at: new Date().toISOString(),
  status, productionExecution: false, physicalHomologation: "PENDING", steps }, null, 2) + "\n")
console.log(`D03 evidence: ${status}`)
