// Remove saídas reconstruíveis do desktop (dist, out). Nunca toca fora de apps/desktop.
import { rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["dist", "out", "test-results"]
for (const t of targets) {
  if (!["dist", "out", "test-results", "playwright-report"].includes(t)) throw new Error(`alvo não permitido: ${t}`)
  rmSync(path.join(root, t), { recursive: true, force: true })
}
