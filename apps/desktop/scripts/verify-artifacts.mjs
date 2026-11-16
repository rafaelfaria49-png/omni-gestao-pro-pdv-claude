// Verifica o que o `electron-forge make` produziu e grava SHA256SUMS.txt + artifacts.json.
//
// Uso (em apps/desktop, depois de `npm run build`, write-build-config e `electron-forge make`):
//   node scripts/verify-artifacts.mjs
//
// Falha (exit 1) se: o Setup.exe não existir ou não for um executável PE; o RELEASES não bater com
// o .nupkg (SHA-1 e tamanho, como o Squirrel confere na instalação); o asar trouxer qualquer arquivo
// fora da allowlist (código compilado, ícones, config e package.json); o build-config dentro do asar
// divergir do canal/origem do build; ou o nome do instalador não for o esperado para o canal.
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as asar from "@electron/asar"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const config = JSON.parse(readFileSync(path.join(root, "build-config.json"), "utf8"))
if (config.channel === "development") throw new Error("canal development não gera instalador")

const isQa = config.channel === "qa"
const squirrelId = isQa ? "OmniGestaoProQA" : "OmniGestaoPro"
const setupName = isQa ? "OmniGestaoPro-QA-Setup.exe" : "OmniGestaoPro-Setup.exe"
const makeDir = path.join(root, "out", "make", "squirrel.windows", "x64")
const packagedDir = path.join(root, "out", `${squirrelId}-win32-x64`)
const nupkgName = `${squirrelId}-${pkg.version}-full.nupkg`

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const sha1 = (f) => createHash("sha1").update(readFileSync(f)).digest("hex")

const setup = path.join(makeDir, setupName)
const nupkg = path.join(makeDir, nupkgName)
const releases = path.join(makeDir, "RELEASES")
const exe = path.join(packagedDir, "OmniGestaoPro.exe")
const asarFile = path.join(packagedDir, "resources", "app.asar")

for (const [label, file] of [["Setup.exe", setup], [".nupkg", nupkg], ["RELEASES", releases], ["executável empacotado", exe], ["app.asar", asarFile]]) {
  check(`${label} existe`, existsSync(file), path.relative(root, file))
}
if (results.some((r) => !r.ok)) finish()

// Setup.exe é um PE (MZ) com tamanho plausível (Electron inteiro dentro).
const head = readFileSync(setup).subarray(0, 2).toString("latin1")
const setupSize = statSync(setup).size
check("Setup.exe é executável PE", head === "MZ")
check("Setup.exe com tamanho plausível", setupSize > 50 * 1024 * 1024 && setupSize < 400 * 1024 * 1024, `${(setupSize / 1048576).toFixed(1)} MB`)

// RELEASES: "<SHA1> <arquivo> <tamanho>" — o Squirrel recusa o pacote se não bater.
const line = readFileSync(releases, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).find((l) => l.includes(nupkgName)) ?? ""
const [relSha1, relName, relSize] = line.trim().split(/\s+/)
check("RELEASES aponta o .nupkg desta versão", relName === nupkgName, line.trim())
check("RELEASES: SHA-1 do .nupkg confere", relSha1?.toLowerCase() === sha1(nupkg))
check("RELEASES: tamanho do .nupkg confere", Number(relSize) === statSync(nupkg).size)

// Conteúdo do asar: só a allowlist do forge.config.js.
const ALLOWED = [/^\/package\.json$/, /^\/build-config\.json$/, /^\/dist(\/|$)/, /^\/assets(\/|$)/]
const entries = asar.listPackage(asarFile, { isPack: false }).map((e) => e.replace(/\\/g, "/"))
const extra = entries.filter((e) => !ALLOWED.some((re) => re.test(e)))
check("asar só com arquivos permitidos", extra.length === 0, extra.length ? extra.slice(0, 10).join(", ") : `${entries.length} entradas`)
const forbidden = entries.filter((e) => /(^|\/)(\.env|node_modules|tests?|\.git)(\/|$|\.)|\.(map|ts|pem|pfx|p12|key)$/i.test(e) && !e.endsWith(".d.ts"))
check("asar sem segredos, testes, fontes ou node_modules", forbidden.length === 0, forbidden.slice(0, 10).join(", "))
const required = ["/package.json", "/build-config.json", `/${pkg.main}`, "/dist/preload/status-preload.js", "/dist/renderer/status.html", "/assets/icon.ico"]
const missing = required.filter((r) => !entries.includes(r))
check("asar com os arquivos obrigatórios (main, preload, tela local, ícone)", missing.length === 0, missing.join(", "))
check("sem app.asar.unpacked (nada fora do asar verificado)", !existsSync(path.join(packagedDir, "resources", "app.asar.unpacked")))
const packedConfig = JSON.parse(asar.extractFile(asarFile, "build-config.json").toString("utf8"))
check("build-config do pacote = build atual", packedConfig.channel === config.channel && packedConfig.origin === config.origin && packedConfig.buildCommit === config.buildCommit, `${packedConfig.channel} ${packedConfig.origin}`)
const packedPkg = JSON.parse(asar.extractFile(asarFile, "package.json").toString("utf8"))
check("versão do pacote = package.json", packedPkg.version === pkg.version, packedPkg.version)

// Assinatura Authenticode (informativa: sem certificado o pacote é NÃO ASSINADO, só uso interno).
let signature = "desconhecida"
if (process.platform === "win32") {
  const ps = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-AuthenticodeSignature -LiteralPath $env:OMNI_SIG_FILE).Status.ToString()"], {
    env: { ...process.env, OMNI_SIG_FILE: setup },
    encoding: "utf8",
  })
  signature = ps.stdout.trim() || "desconhecida"
}
const signed = signature === "Valid"
console.log(`INFO assinatura do Setup.exe: ${signature}${signed ? "" : " — NÃO ASSINADO (somente instalação interna/QA)"}`)

const files = [setup, nupkg, releases].map((f) => ({ file: path.basename(f), bytes: statSync(f).size, sha256: sha256(f) }))
writeFileSync(path.join(makeDir, "SHA256SUMS.txt"), files.map((f) => `${f.sha256}  ${f.file}`).join("\n") + "\n")
writeFileSync(
  path.join(makeDir, "artifacts.json"),
  JSON.stringify(
    {
      product: isQa ? "OmniGestão Pro QA" : "OmniGestão Pro",
      version: pkg.version,
      channel: config.channel,
      origin: config.origin,
      buildCommit: config.buildCommit,
      buildTime: config.buildTime,
      arch: "x64",
      signature: signed ? "assinado" : "NAO_ASSINADO",
      files,
      checks: results,
    },
    null,
    2,
  ) + "\n",
)
for (const f of files) console.log(`SHA256 ${f.sha256}  ${f.file}`)
finish()

function finish() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} verificações de artefato passaram`)
  process.exit(failed.length ? 1 : 0)
}
