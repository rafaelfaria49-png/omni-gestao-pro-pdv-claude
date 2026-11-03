/** SHA-256 manifest of the 004C candidate (sources, candidate migrations, docs and evidence). LF-normalized for text. */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const roots = ["lib/printing/direct", "tools/omni-print-agent", "tools/print-004c-e2e", "app/api/print/direct", "app/api/print/agent", "docs/print-004c-e2e",
  "components/dashboard/vendas/pdv-direct-print-feedback.tsx", "components/configuracoes-v3/features/settings/sections/ImpressaoDiretaAgenteCard.tsx",
  "components/configuracoes-v3/features/settings/sections/PdvSection.tsx", "components/dashboard/vendas/pdv-classic.tsx", "lib/pdv-impressao-config.ts",
  "e2e/specs/print-direct-004c.spec.ts", "e2e/fixtures/print-direct.ts", "e2e/print-direct.playwright.config.ts", "prisma/schema.prisma"]
const files = []
const walk = (rel) => {
  const abs = path.join(root, rel)
  if (statSync(abs).isDirectory()) for (const n of readdirSync(abs).sort()) walk(path.posix.join(rel, n))
  else if (!rel.endsWith("HASHES.json")) files.push(rel)
}
roots.forEach(walk)
const sha = (rel) => {
  const buf = readFileSync(path.join(root, rel))
  const text = /\.(ts|tsx|mjs|js|json|md|sql|log|jsonl|prisma)$/.test(rel) ? Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n")) : buf
  return createHash("sha256").update(text).digest("hex")
}
const entries = Object.fromEntries(files.map(f => [f, sha(f)]))
// Battery summary log hashes refer to the normalized logs on disk.
const summaryPath = path.join(root, "docs/print-004c-e2e/evidence/battery-summary.json")
const summary = JSON.parse(readFileSync(summaryPath, "utf8"))
for (const s of summary.steps) s.logSha256 = entries[`docs/print-004c-e2e/evidence/${s.step}.log`] ?? s.logSha256
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n")
entries["docs/print-004c-e2e/evidence/battery-summary.json"] = sha("docs/print-004c-e2e/evidence/battery-summary.json")
writeFileSync(path.join(root, "docs/print-004c-e2e/evidence/HASHES.json"), JSON.stringify({ algorithm: "sha256 (text files LF-normalized)", files: entries }, null, 2) + "\n")
console.log(`HASHES.json: ${Object.keys(entries).length} files`)
