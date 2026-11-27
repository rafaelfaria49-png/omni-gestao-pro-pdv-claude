/**
 * Gera (ou confere com --check) as três pastas de migration D02-A em tools/print-d02/migrations/, no formato do Prisma
 * (<nome>/migration.sql), com LF. Ficam FORA de prisma/migrations até a aplicação manual autorizada (RUNBOOK_D02.md).
 * Usage: node tools/print-d02/generate.mjs [--check]
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { buildMigrations, STAGED } from "./cut.mjs"

const check = process.argv.includes("--check")
let bad = 0
for (const [name, sql] of Object.entries(buildMigrations())) {
  const file = path.join(STAGED, name, "migration.sql")
  const sha = createHash("sha256").update(sql).digest("hex")
  if (check) {
    const same = existsSync(file) && readFileSync(file).equals(Buffer.from(sql))
    if (!same) bad++
    console.log(`${same ? "OK  " : "DIFF"} ${name} ${sha}`)
  } else {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, sql)
    console.log(`wrote ${name} ${sha}`)
  }
}
if (bad) { console.error(`${bad} migration(s) differ from the generator`); process.exit(1) }
