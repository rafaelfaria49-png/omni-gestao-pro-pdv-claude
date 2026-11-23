// Gera o pacote MSIX (canal Microsoft Store) a partir do MESMO app empacotado pelo electron-forge.
//
// Uso (em apps/desktop, depois de `electron-forge package` ou `make` no canal production):
//   node scripts/make-msix.mjs                      → identidade de TESTE do CI (só para instalar no runner)
//   node scripts/make-msix.mjs --store              → identidade da Store (env abaixo); recusa a de teste
//
// Identidade da Store (emitida pelo Partner Center → Gerenciamento do produto → Identidade do produto):
//   OMNI_MSIX_IDENTITY_NAME, OMNI_MSIX_PUBLISHER (CN=...), OMNI_MSIX_PUBLISHER_DISPLAY_NAME
//
// O pacote sai SEM assinatura: na Store, a Microsoft assina na publicação. Para instalar fora da Store
// (só teste), quem instala assina com certificado próprio (ver tests/packaged/msix-test.mjs).
// O Setup.exe (Squirrel) não é tocado: os dois canais saem do mesmo pacote do forge.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildAppxManifest, CI_TEST_IDENTITY, msixVersion } from "./lib/msix-manifest.mjs"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const store = process.argv.includes("--store")
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const config = JSON.parse(readFileSync(path.join(root, "build-config.json"), "utf8"))
if (config.channel !== "production") throw new Error(`MSIX só no canal production (build-config: ${config.channel})`)

const identity = store
  ? {
      name: (process.env.OMNI_MSIX_IDENTITY_NAME ?? "").trim(),
      publisher: (process.env.OMNI_MSIX_PUBLISHER ?? "").trim(),
      publisherDisplayName: (process.env.OMNI_MSIX_PUBLISHER_DISPLAY_NAME ?? "").trim(),
    }
  : CI_TEST_IDENTITY

const appDir = path.join(root, "out", "OmniGestaoPro-win32-x64")
if (!existsSync(path.join(appDir, "OmniGestaoPro.exe"))) throw new Error(`app empacotado ausente: ${appDir} (rode electron-forge package/make)`)

const manifest = buildAppxManifest({
  identity,
  version: pkg.version,
  displayName: pkg.productName,
  description: "OmniGestão Pro para Windows — vendas, caixa, estoque e impressão direta na impressora da loja.",
  store,
})

const outDir = path.join(root, "out", "msix")
const stage = path.join(outDir, "stage")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(appDir, stage, { recursive: true })
cpSync(path.join(root, "assets", "msix"), path.join(stage, "assets", "msix"), { recursive: true })
writeFileSync(path.join(stage, "AppxManifest.xml"), manifest)

/** makeappx.exe da versão mais nova do Windows SDK instalada (vem no runner windows-latest). */
function findMakeAppx() {
  const kits = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin")
  if (!existsSync(kits)) throw new Error("Windows SDK não encontrado (makeappx.exe)")
  const versions = readdirSync(kits).filter((d) => /^10\.\d+\.\d+\.\d+$/.test(d)).sort((a, b) => {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number)
    for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]
    return 0
  })
  for (const v of versions) {
    const exe = path.join(kits, v, "x64", "makeappx.exe")
    if (existsSync(exe)) return exe
  }
  throw new Error("makeappx.exe não encontrado no Windows SDK")
}

const fileName = `OmniGestaoPro-${pkg.version}-x64.msix`
const target = path.join(outDir, fileName)
// makeappx valida o AppxManifest contra o esquema oficial antes de empacotar.
const r = spawnSync(findMakeAppx(), ["pack", "/d", stage, "/p", target, "/o", "/h", "SHA256"], { encoding: "utf8", windowsHide: true })
if (r.status !== 0) {
  console.error(r.stdout, r.stderr)
  throw new Error(`makeappx falhou (exit ${r.status})`)
}
rmSync(stage, { recursive: true, force: true })

const sha256 = createHash("sha256").update(readFileSync(target)).digest("hex")
const report = {
  file: fileName,
  sha256,
  version: msixVersion(pkg.version),
  identity: { name: identity.name, publisher: identity.publisher },
  forStore: store,
  signed: false,
  channel: config.channel,
  origin: config.origin,
  buildCommit: config.buildCommit,
}
writeFileSync(path.join(outDir, "msix.json"), JSON.stringify(report, null, 2) + "\n")
writeFileSync(path.join(outDir, "SHA256SUMS.txt"), `${sha256}  ${fileName}\n`)
console.log(`MSIX ${fileName} · versão ${report.version} · identidade ${identity.name} (${store ? "Store" : "TESTE do CI"}) · sha256 ${sha256}`)
