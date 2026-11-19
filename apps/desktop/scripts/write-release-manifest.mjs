// Grava release.json (manifesto imutável da versão). latest.json e versions.json são do passo "promote".
//
// Uso (workflow desktop-release.yml, depois da verificação do download público e da instalação):
//   node scripts/write-release-manifest.mjs --base https://<downloads> --artifacts <artifacts.json> \
//        --public-check <relatório de verify-published-release> --install-test passed \
//        --out-dir <pasta> [--notes "texto"]
//
// Recusa (exit 1) instalador sem assinatura válida, download público divergente ou instalação reprovada.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { buildReleaseManifest } from "./lib/release-manifest-builder.mjs"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
)
const readJson = (f) => JSON.parse(readFileSync(path.resolve(f), "utf8").replace(/^﻿/, ""))

try {
  const release = buildReleaseManifest({
    base: args.base,
    artifacts: readJson(args.artifacts),
    publicCheck: readJson(args["public-check"]),
    installTest: args["install-test"],
    publishedAt: new Date().toISOString(),
    notes: args.notes,
  })
  const outDir = path.resolve(args["out-dir"] ?? ".")
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, "release.json"), JSON.stringify(release, null, 2) + "\n")
  console.log(`release.json → ${release.version} ${release.installer.sha256} (${release.signature.signer})`)
} catch (err) {
  console.error(`FAIL ${err.message}`)
  process.exit(1)
}
