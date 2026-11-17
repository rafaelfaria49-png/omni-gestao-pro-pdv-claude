// Grava build-config.json (empacotado dentro do asar).
//
// Uso:
//   node scripts/write-build-config.mjs --channel production
//   node scripts/write-build-config.mjs --channel qa --origin https://<preview>.vercel.app
//   node scripts/write-build-config.mjs --channel development --origin http://127.0.0.1:3000
//
// A validação real é a mesma do app (dist/shared/build-config.js) — rode `npm run build` antes.
import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const { validateBuildConfig, PRODUCTION_ORIGIN } = require(path.join(root, "dist", "shared", "build-config.js"))

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
)
const channel = args.channel
if (!channel) throw new Error("--channel obrigatório (production | qa | development)")
const origin = channel === "production" ? PRODUCTION_ORIGIN : args.origin

let commit = "desconhecido"
try {
  commit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim()
} catch {
  /* fora de um checkout git */
}

const config = validateBuildConfig({
  channel,
  origin,
  updateManifestUrl: args["update-manifest"] ?? null,
  buildCommit: commit,
  buildTime: new Date().toISOString(),
})
writeFileSync(path.join(root, "build-config.json"), JSON.stringify(config, null, 2) + "\n")
console.log(`build-config.json → canal=${config.channel} origem=${config.origin} commit=${commit.slice(0, 7)}`)
