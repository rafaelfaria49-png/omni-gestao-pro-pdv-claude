// Teste de INSTALAÇÃO REAL do pacote MSIX (canal Microsoft Store) no Windows do runner de CI.
//
// Uso (em apps/desktop, Windows com Windows SDK e permissão de administrador — runner windows-latest):
//   node tests/packaged/msix-test.mjs --msix out/msix/OmniGestaoPro-1.0.4-x64.msix \
//        --upgrade-msix out/msix-upgrade/OmniGestaoPro-1.0.5-x64.msix
//
// Fora da Store o Windows só instala MSIX assinado por certificado confiável. O teste cria um
// certificado AUTOASSINADO descartável, assina CÓPIAS dos pacotes (o original segue sem assinatura,
// como a Store recebe), confia nele só durante o teste e remove tudo no fim.
//
// Roteiro: instala → confere identidade/versão → abre pelo Menu Iniciar (AppsFolder) → confere janela,
// canal/origem de Produção, `package=msix`, primeira carga e que o programa NÃO consulta o manifesto do
// Setup.exe → grava um marcador no perfil do pacote → fecha → atualiza para a versão maior → confere
// versão nova e marcador preservado → desinstala → limpa certificado.
// Também confere que o perfil do Setup.exe (%AppData%\OmniGestão Pro) não foi usado pelo MSIX.
//
// Nunca roda numa máquina com o pacote já instalado e recusa a identidade da Store (só a de teste).
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs"
import path from "node:path"
import { CI_TEST_IDENTITY } from "../../scripts/lib/msix-manifest.mjs"

if (process.platform !== "win32") throw new Error("teste de MSIX só roda no Windows")
if (process.env.GITHUB_ACTIONS !== "true" && process.env.OMNI_MSIX_TEST_ALLOW_LOCAL !== "1") {
  throw new Error("teste de MSIX instala certificado de teste na máquina: só no runner de CI (ou OMNI_MSIX_TEST_ALLOW_LOCAL=1)")
}
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
)
const msix = args.msix
const upgradeMsix = args["upgrade-msix"]
if (!msix || !existsSync(msix)) throw new Error("--msix <arquivo> obrigatório")

const root = process.cwd()
const out = path.join(root, "test-results")
const work = path.join(root, "out", "msix-test")
mkdirSync(out, { recursive: true })
mkdirSync(work, { recursive: true })
const ORIGIN = "https://omni-gestao-pro.vercel.app"
const PRODUCT = "OmniGestão Pro"
const squirrelLog = path.join(process.env.APPDATA, PRODUCT, "logs", "desktop.log")

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  return !!ok
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms, step = 500) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) return null
    await sleep(step)
  }
}
function ps(script, env = {}) {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; ${script}`],
    { env: { ...process.env, PSModulePath: undefined, ...env }, encoding: "utf8", windowsHide: true, timeout: 300_000 },
  )
  if (r.status !== 0) throw new Error(`powershell falhou: ${r.stderr || r.stdout}`)
  const o = r.stdout.trim()
  return o ? JSON.parse(o) : null
}
function findSdkTool(name) {
  const kits = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin")
  const versions = readdirSync(kits).filter((d) => /^10\./.test(d)).sort().reverse()
  for (const v of versions) {
    const exe = path.join(kits, v, "x64", name)
    if (existsSync(exe)) return exe
  }
  throw new Error(`${name} não encontrado no Windows SDK`)
}

const identity = CI_TEST_IDENTITY
const pkgState = () =>
  ps(
    "$p=Get-AppxPackage -Name $env:OMNI_NAME; if($p){ [pscustomobject]@{ version=$p.Version; publisher=$p.Publisher; arch=[string]$p.Architecture; pfn=$p.PackageFamilyName; location=$p.InstallLocation; signature=[string]$p.SignatureKind; status=[string]$p.Status } | ConvertTo-Json -Compress } else { 'null' }",
    { OMNI_NAME: identity.name },
  )

function appProcesses(location) {
  if (!location) return []
  const list = ps(
    "ConvertTo-Json -Compress -InputObject @(Get-Process -Name OmniGestaoPro -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($env:OMNI_LOC,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { [pscustomobject]@{ id=$_.Id; title=$_.MainWindowTitle } })",
    { OMNI_LOC: location },
  )
  return Array.isArray(list) ? list : list ? [list] : []
}

/** Perfil do app dentro do pacote: o Windows redireciona %AppData% do app MSIX para LocalCache\Roaming. */
const MSIX_PROFILE_DIR = "OmniGestão Pro Store" // = src/shared/distribution.ts
const packageProfile = (pfn) => path.join(process.env.LOCALAPPDATA, "Packages", pfn, "LocalCache", "Roaming", MSIX_PROFILE_DIR)
const realStoreProfile = path.join(process.env.APPDATA, MSIX_PROFILE_DIR)
const readText = (f) => {
  try {
    return readFileSync(f, "utf8")
  } catch {
    return ""
  }
}

let thumbprint = null
const squirrelLogBefore = readText(squirrelLog)

async function launch(label, st, expectVersion) {
  const logFile = path.join(packageProfile(st.pfn), "logs", "desktop.log")
  const before = readText(logFile).length
  ps("Start-Process -FilePath ('shell:AppsFolder\\' + $env:OMNI_PFN + '!OmniGestaoPro')", { OMNI_PFN: st.pfn })
  const win = await waitFor(() => appProcesses(st.location).find((p) => p.title), 45_000)
  check(`${label}: janela aberta pelo Menu Iniciar (AppsFolder)`, win, win ? `"${win.title}" pid ${win.id}` : "sem janela em 45 s")
  check(`${label}: título do produto`, win?.title === PRODUCT, win?.title)
  const started = await waitFor(() => /started channel=(\S+) origin=(\S+) version=(\S+) package=(\S+)/.exec(readText(logFile).slice(before)), 30_000)
  check(`${label}: log no perfil do PACOTE`, started, started ? logFile : `sem log em ${logFile}`)
  if (started) {
    check(`${label}: canal production e origem fixa`, started[1] === "production" && started[2] === ORIGIN, `${started[1]} ${started[2]}`)
    check(`${label}: versão ${expectVersion}`, started[3] === expectVersion, started[3])
    check(`${label}: o app sabe que é MSIX`, started[4] === "msix", started[4])
  }
  const loaded = await waitFor(() => /first-load (\d+)ms/.exec(readText(logFile).slice(before)), 45_000)
  check(`${label}: tela do sistema carregou da nuvem`, loaded, loaded ? `${loaded[1]} ms` : "sem first-load em 45 s")
  const upd = await waitFor(() => /update-check available=(\S+)/.exec(readText(logFile).slice(before)), 20_000)
  check(`${label}: atualização pela Store (não oferece Setup.exe)`, upd?.[1] === "false", upd?.[0])
  return win
}

async function close(label, st) {
  ps("Get-Process -Name OmniGestaoPro -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($env:OMNI_LOC,[StringComparison]::OrdinalIgnoreCase) -and $_.MainWindowHandle -ne 0 } | ForEach-Object { [void]$_.CloseMainWindow() }", { OMNI_LOC: st.location })
  const gone = await waitFor(() => appProcesses(st.location).length === 0, 60_000)
  check(`${label}: fechou sem processo órfão`, gone)
}

function signCopy(file) {
  const copy = path.join(work, path.basename(file))
  copyFileSync(file, copy)
  const r = spawnSync(findSdkTool("signtool.exe"), ["sign", "/fd", "SHA256", "/sha1", thumbprint, copy], { encoding: "utf8", windowsHide: true })
  check(`cópia assinada com certificado de teste: ${path.basename(file)}`, r.status === 0, r.status === 0 ? "" : (r.stdout + r.stderr).slice(-400))
  return copy
}

try {
  const pre = pkgState()
  if (pre) throw new Error(`pacote ${identity.name} já instalado nesta máquina: o teste não remove instalação alheia`)

  const cert = ps(
    `$c=New-SelfSignedCertificate -Type Custom -Subject $env:OMNI_PUB -KeyUsage DigitalSignature -FriendlyName 'OmniGestao MSIX teste de CI (descartável)' -CertStoreLocation 'Cert:\\CurrentUser\\My' -NotAfter (Get-Date).AddDays(1) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
$f=Join-Path $env:RUNNER_TEMP 'omni-msix-test.cer'; if(-not $env:RUNNER_TEMP){ $f=Join-Path $env:TEMP 'omni-msix-test.cer' }
Export-Certificate -Cert $c -FilePath $f | Out-Null
Import-Certificate -FilePath $f -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPeople' | Out-Null
[pscustomobject]@{ thumbprint=$c.Thumbprint } | ConvertTo-Json -Compress`,
    { OMNI_PUB: identity.publisher },
  )
  thumbprint = cert.thumbprint
  check("certificado de teste criado e confiável só nesta máquina", /^[0-9A-F]{40}$/.test(thumbprint ?? ""), thumbprint)

  const v1 = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version
  const signed = signCopy(msix)
  ps("Add-AppxPackage -Path $env:OMNI_MSIX", { OMNI_MSIX: signed })
  let st = pkgState()
  check("instalado (Add-AppxPackage)", st, st?.location)
  check("identidade e versão do manifesto", st?.publisher === identity.publisher && st?.version === `${v1}.0` && st?.arch === "X64", st ? `${st.version} ${st.arch} ${st.publisher}` : "")
  check("instalado em WindowsApps (pasta protegida do pacote)", /\\WindowsApps\\/i.test(st?.location ?? ""), st?.location)

  await launch("1ª abertura", st, v1)
  const profile = packageProfile(st.pfn)
  check("perfil do navegador criado DENTRO do pacote", existsSync(path.join(profile, "Local State")) || existsSync(path.join(profile, "Partitions")), profile)
  check("perfil NÃO ficou no %AppData% real (redirecionado ao pacote)", !existsSync(realStoreProfile), realStoreProfile)
  const sentinel = path.join(profile, "omni-msix-test-sentinel.txt")
  if (!existsSync(profile)) throw new Error(`perfil do pacote ausente: ${profile}`)
  writeFileSync(sentinel, "vendas pendentes / impressora / sessão — devem sobreviver à atualização\n")
  await close("1ª abertura", st)

  const afterLog = readText(squirrelLog)
  check("perfil do Setup.exe (%AppData%) não foi usado pelo MSIX", !afterLog.slice(squirrelLogBefore.length).includes("package=msix"), squirrelLog)

  if (upgradeMsix && existsSync(upgradeMsix)) {
    const v2 = path.basename(upgradeMsix).match(/OmniGestaoPro-(\d+\.\d+\.\d+)-x64\.msix$/)?.[1]
    const signed2 = signCopy(upgradeMsix)
    ps("Add-AppxPackage -Path $env:OMNI_MSIX", { OMNI_MSIX: signed2 })
    st = pkgState()
    check(`atualizado para ${v2}`, st?.version === `${v2}.0`, st?.version)
    check("perfil e marcador preservados na atualização", existsSync(sentinel), sentinel)
    await launch("após atualizar", st, v2)
    await close("após atualizar", st)
  } else {
    console.log("INFO atualização não testada (sem --upgrade-msix)")
  }

  ps("Remove-AppxPackage -Package (Get-AppxPackage -Name $env:OMNI_NAME).PackageFullName", { OMNI_NAME: identity.name })
  check("desinstalado (Remove-AppxPackage)", pkgState() === null)
  check("desinstalar o MSIX remove o perfil do pacote (diferente do Setup.exe)", !existsSync(profile), profile)
} catch (err) {
  check("execução sem erro inesperado", false, err.message.slice(0, 600))
} finally {
  try {
    if (pkgState()) ps("Remove-AppxPackage -Package (Get-AppxPackage -Name $env:OMNI_NAME).PackageFullName", { OMNI_NAME: identity.name })
  } catch {
    /* limpeza */
  }
  if (thumbprint) {
    try {
      ps("Get-ChildItem Cert:\\LocalMachine\\TrustedPeople, Cert:\\CurrentUser\\My | Where-Object Thumbprint -eq $env:OMNI_T | Remove-Item -Force; 'null'", { OMNI_T: thumbprint })
      check("certificado de teste removido", true)
    } catch (e) {
      check("certificado de teste removido", false, e.message.slice(0, 200))
    }
  }
}

const failed = results.filter((r) => !r.ok)
writeFileSync(path.join(out, "msix-test.json"), JSON.stringify({ identity: identity.name, results }, null, 2) + "\n")
console.log(`\n${results.length - failed.length}/${results.length} verificações do MSIX passaram`)
process.exit(failed.length ? 1 : 0)
