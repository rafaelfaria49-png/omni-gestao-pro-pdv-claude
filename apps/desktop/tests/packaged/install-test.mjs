// Teste de INSTALAÇÃO REAL do Setup.exe no Windows (por usuário, Squirrel.Windows).
//
// Uso (em apps/desktop):
//   node tests/packaged/install-test.mjs --channel production --setup out/make/.../OmniGestaoPro-Setup.exe \
//        [--upgrade-setup <Setup.exe de versão MAIOR>] [--keep-installed]
//
// Roteiro: instala → confere pasta, atalhos (Área de Trabalho + Menu Iniciar), entrada em
// "Aplicativos instalados" e ícone → abre PELO ATALHO da Área de Trabalho → confere janela, canal,
// origem e primeira carga no log do app → fecha pela janela (sem processo órfão) → abre de novo →
// reinstala a mesma versão → (opcional) atualiza para a versão maior → desinstala (ou mantém com
// --keep-installed) → confere que o perfil (dados locais, vendas pendentes) foi preservado.
//
// Não faz login nem usa porta de depuração (Produção recusa). Só abre /login (GET), como um navegador.
// Recusa rodar se o canal já estiver instalado neste Windows: o teste nunca desinstala o app de alguém.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.platform !== "win32") throw new Error("teste de instalação só roda no Windows")

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (!cur.startsWith("--")) return acc
    const next = all[i + 1]
    return [...acc, [cur.slice(2), next && !next.startsWith("--") ? next : true]]
  }, []),
)
const channel = args.channel
if (channel !== "production" && channel !== "qa") throw new Error("--channel production|qa obrigatório")
const setup = path.resolve(String(args.setup ?? ""))
if (!existsSync(setup)) throw new Error(`--setup não encontrado: ${setup}`)
const upgradeSetup = args["upgrade-setup"] ? path.resolve(String(args["upgrade-setup"])) : null
if (upgradeSetup && !existsSync(upgradeSetup)) throw new Error(`--upgrade-setup não encontrado: ${upgradeSetup}`)
const keepInstalled = args["keep-installed"] === true
const allowExistingProfile = args["allow-existing-profile"] === true
// Versão esperada do Setup.exe (padrão: package.json deste checkout) — nunca deduzida da pasta instalada.
const expectVersion = String(
  args["expect-version"] ?? JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8")).version,
)

const isQa = channel === "qa"
const squirrelId = isQa ? "OmniGestaoProQA" : "OmniGestaoPro"
const productName = isQa ? "OmniGestão Pro QA" : "OmniGestão Pro"
const expectedOrigin = isQa ? null : "https://omni-gestao-pro.vercel.app"
const localAppData = process.env.LOCALAPPDATA
const appData = process.env.APPDATA
const installDir = path.join(localAppData, squirrelId)
const profileDir = path.join(appData, productName)
const logFile = path.join(profileDir, "logs", "desktop.log")
const sentinel = path.join(profileDir, "omni-install-test-sentinel.txt")

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  return !!ok
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** PowerShell com entrada por variáveis de ambiente (acentos sem depender da página de código) e saída JSON UTF-8. */
function ps(script, env = {}) {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`],
    { env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true, timeout: 120_000 },
  )
  if (r.status !== 0) throw new Error(`powershell falhou: ${r.stderr || r.stdout}`)
  const out = r.stdout.trim()
  return out ? JSON.parse(out) : null
}

const env = { OMNI_INSTALL_DIR: installDir, OMNI_PRODUCT: productName, OMNI_SQUIRREL_ID: squirrelId }

function appProcesses() {
  const list = ps(
    "$d=$env:OMNI_INSTALL_DIR; ConvertTo-Json -Compress -InputObject @(Get-Process -Name OmniGestaoPro -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { [pscustomobject]@{ id=$_.Id; title=$_.MainWindowTitle; mem=$_.PagedMemorySize64; path=$_.Path } })",
    env,
  )
  return Array.isArray(list) ? list : list ? [list] : []
}

function installState() {
  return ps(
    `$d=$env:OMNI_INSTALL_DIR; $p=$env:OMNI_PRODUCT
$sh=New-Object -ComObject WScript.Shell
$desk=Join-Path ([Environment]::GetFolderPath('Desktop')) ($p + '.lnk')
$start=Join-Path ([Environment]::GetFolderPath('Programs')) ('RAFACELL\\' + $p + '.lnk')
function lnk($f){ if(Test-Path -LiteralPath $f){ $s=$sh.CreateShortcut($f); [pscustomobject]@{ path=$f; target=$s.TargetPath } } else { $null } }
$key='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $env:OMNI_SQUIRREL_ID
$reg=$null; if(Test-Path $key){ $k=Get-ItemProperty $key; $reg=[pscustomobject]@{ name=$k.DisplayName; version=$k.DisplayVersion; publisher=$k.Publisher; icon=$k.DisplayIcon; quiet=$k.QuietUninstallString } }
$apps=@(); if(Test-Path -LiteralPath $d){ $apps=@(Get-ChildItem -LiteralPath $d -Directory -Filter 'app-*' | ForEach-Object { $_.Name }) }
[pscustomobject]@{ dir=(Test-Path -LiteralPath $d); stub=(Test-Path -LiteralPath (Join-Path $d 'OmniGestaoPro.exe')); update=(Test-Path -LiteralPath (Join-Path $d 'Update.exe')); icon=(Test-Path -LiteralPath (Join-Path $d 'app.ico')); apps=$apps; desktop=(lnk $desk); startMenu=(lnk $start); reg=$reg } | ConvertTo-Json -Compress -Depth 4`,
    env,
  )
}

function readLog() {
  try {
    return readFileSync(logFile, "utf8")
  } catch {
    return ""
  }
}

async function waitFor(fn, ms, step = 500) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) return null
    await sleep(step)
  }
}

async function runSetup(file, label) {
  // O Squirrel apaga/troca a pasta da versão: com o app ainda encerrando, o .exe está em uso e a
  // instalação falha ("acesso negado"). O app precisa estar fechado antes do Setup.
  const idle = await waitFor(() => appProcesses().length === 0, 60_000)
  check(`${label}: app fechado antes do Setup`, idle)
  const t = Date.now()
  // --silent: sem tela do instalador. O Squirrel instala, roda os ganchos (atalhos) e pode abrir o app.
  const r = spawnSync(file, ["--silent"], { windowsHide: true, timeout: 300_000 })
  check(`${label}: Setup.exe terminou com sucesso`, r.status === 0, `exit ${r.status} em ${Date.now() - t} ms`)
}

/** Fecha o app pela janela (WM_CLOSE, como o X) e confirma que nenhum processo do app sobrou. */
async function closeApp(label) {
  ps("$d=$env:OMNI_INSTALL_DIR; Get-Process -Name OmniGestaoPro -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d,[StringComparison]::OrdinalIgnoreCase) -and $_.MainWindowHandle -ne 0 } | ForEach-Object { [void]$_.CloseMainWindow() }", env)
  // O processo principal grava cookies/armazenamento antes de sair; com pouca memória livre isso
  // leva alguns segundos. Órfão = processo do app ainda vivo depois de 60 s.
  const t = Date.now()
  const gone = await waitFor(() => appProcesses().length === 0, 60_000)
  const secs = Math.round((Date.now() - t) / 1000)
  return check(`${label}: fechou pela janela sem processo órfão`, gone, gone ? `encerrou em ${secs} s` : JSON.stringify(appProcesses().map((p) => p.id)))
}

/** Abre pelo atalho da Área de Trabalho e confere janela + log do próprio app. */
async function launchFromShortcut(label, expectedVersion) {
  const st = installState()
  if (!check(`${label}: atalho da Área de Trabalho existe`, st.desktop, st.desktop?.path)) return
  // Um processo antigo (ex.: instância do --squirrel-firstrun) seguraria o lock de instância única
  // e a janela vista seria a dele: só vale janela de um processo NOVO, iniciado pelo atalho.
  const oldPids = new Set(appProcesses().map((p) => p.id))
  check(`${label}: nenhuma instância anterior aberta`, oldPids.size === 0, [...oldPids].join(","))
  const before = readLog().length
  ps("Start-Process -FilePath $env:OMNI_LNK", { OMNI_LNK: st.desktop.path })
  const win = await waitFor(() => appProcesses().find((p) => p.title && !oldPids.has(p.id)), 30_000)
  check(`${label}: janela aberta por processo novo`, win, win ? `"${win.title}" pid ${win.id}` : "sem janela em 30 s")
  check(`${label}: título é do produto/canal`, win && (isQa ? win.title.startsWith("OmniGestão Pro — QA") : win.title === "OmniGestão Pro"), win?.title)
  const started = await waitFor(() => {
    const fresh = readLog().slice(before)
    return /started channel=(\S+) origin=(\S+) version=(\S+)/.exec(fresh)
  }, 30_000)
  check(`${label}: log do app registrou a inicialização`, started, started?.[0])
  if (started) {
    check(`${label}: canal ${channel}`, started[1] === channel)
    if (expectedOrigin) check(`${label}: origem fixa de Produção`, started[2] === expectedOrigin, started[2])
    else check(`${label}: origem QA não é Produção`, started[2] !== "https://omni-gestao-pro.vercel.app", started[2])
    if (expectedVersion) check(`${label}: versão ${expectedVersion} em execução`, started[3] === expectedVersion, started[3])
  }
  const loaded = await waitFor(() => /first-load (\d+)ms/.exec(readLog().slice(before)), 45_000)
  check(`${label}: tela do sistema (login) carregou da nuvem`, loaded, loaded ? `${loaded[1]} ms desde o início` : "sem first-load em 45 s (rede/servidor?)")
  const offline = /status (offline|certificate|server-error)/.exec(readLog().slice(before))
  check(`${label}: sem tela de erro de conexão/certificado`, !offline, offline?.[0])
  const procs = appProcesses()
  const mb = Math.round(procs.reduce((a, p) => a + Number(p.mem || 0), 0) / 1048576)
  check(`${label}: memória privada total`, mb > 0 && mb < 1500, `${mb} MB em ${procs.length} processos`)
}

// ---------------------------------------------------------------------------------------------

const report = { channel, productName, setup: path.basename(setup), upgradeSetup: upgradeSetup && path.basename(upgradeSetup), startedAt: new Date().toISOString() }
const pre = installState()
if (pre.dir || pre.reg) {
  throw new Error(`${productName} já está instalado neste Windows (${installDir}). O teste não desinstala instalações existentes — rode numa máquina/conta sem o app.`)
}
if (appProcesses().length) throw new Error("há processos do app em execução")
const hadProfile = existsSync(profileDir)
if (hadProfile && !allowExistingProfile) {
  // Perfil de uma instalação anterior pode ter sessão e vendas pendentes reais: o teste não o usa sem ordem expressa.
  throw new Error(`perfil ${profileDir} já existe — use --allow-existing-profile só se ele for de teste`)
}
let installedByTest = false

try {
  // 1. Instalação
  await runSetup(setup, "instalação")
  const st = await waitFor(() => {
    const s = installState()
    return s.desktop && s.startMenu && s.reg ? s : null
  }, 30_000)
  const s1 = st ?? installState()
  installedByTest = s1.dir || !!s1.reg
  check("pasta por usuário em %LocalAppData%", s1.dir && s1.stub && s1.update, installDir)
  const version = expectVersion
  check(`versão instalada = ${version} (esperada do Setup)`, s1.apps.length === 1 && s1.apps[0] === `app-${version}`, s1.apps.join(","))
  check("ícone do app instalado", s1.icon)
  check("atalho na Área de Trabalho", s1.desktop && /OmniGestaoPro\.exe$/i.test(s1.desktop.target), s1.desktop?.path)
  check("atalho no Menu Iniciar (RAFACELL)", s1.startMenu && /OmniGestaoPro\.exe$/i.test(s1.startMenu.target), s1.startMenu?.path)
  check("entrada em Aplicativos instalados", s1.reg && s1.reg.name === productName && s1.reg.publisher === "RAFACELL", s1.reg && `${s1.reg.name} ${s1.reg.version}`)
  check("versão em Aplicativos instalados", s1.reg?.version === version, s1.reg?.version)
  // O Squirrel abre o app no fim da instalação (--squirrel-firstrun), às vezes com atraso: espera
  // essa instância aparecer e a fecha, para a abertura seguinte ser de fato pelo atalho.
  if (await waitFor(() => appProcesses().length > 0, 15_000)) await closeApp("pós-instalação (firstrun)")

  // 2. Abertura pelo atalho, fechamento e nova abertura
  await launchFromShortcut("1ª abertura", version)
  await closeApp("1ª abertura")
  await launchFromShortcut("2ª abertura (reinício)", version)
  await closeApp("2ª abertura")

  // Dados locais: o perfil do Chromium existe e recebe um marcador (simula vendas pendentes).
  check("perfil local criado em %AppData%", existsSync(path.join(profileDir, "Partitions")) || existsSync(path.join(profileDir, "Local State")), profileDir)
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(sentinel, `install-test ${report.startedAt}\n`)

  // 3. Reinstalação da mesma versão
  await runSetup(setup, "reinstalação")
  if (await waitFor(() => appProcesses().length > 0, 15_000)) await closeApp("pós-reinstalação (firstrun)")
  const s2 = installState()
  check("reinstalação: mesma versão e atalhos íntegros", s2.apps.includes(`app-${version}`) && s2.desktop && s2.startMenu && s2.reg?.version === version, s2.apps.join(","))
  check("reinstalação: dados locais preservados", existsSync(sentinel))
  await launchFromShortcut("abertura após reinstalação", version)
  await closeApp("abertura após reinstalação")

  // 4. Atualização para versão posterior (novo Setup.exe)
  if (upgradeSetup) {
    await runSetup(upgradeSetup, "atualização")
    const s3 = await waitFor(() => {
      const s = installState()
      return s.reg && s.reg.version !== version ? s : null
    }, 30_000)
    const nv = s3?.reg?.version
    check("atualização: nova versão registrada", nv && nv !== version, `${version} → ${nv}`)
    check("atualização: pasta da nova versão", s3?.apps.includes(`app-${nv}`), s3?.apps.join(","))
    if (await waitFor(() => appProcesses().length > 0, 15_000)) await closeApp("pós-atualização (firstrun)")
    check("atualização: dados locais preservados", existsSync(sentinel))
    await launchFromShortcut("abertura após atualização", nv)
    await closeApp("abertura após atualização")
  } else {
    console.log("INFO atualização para versão posterior não testada (sem --upgrade-setup)")
  }

  // 5. Desinstalação (a menos que o operador queira manter instalado)
  if (!keepInstalled) {
    const r = spawnSync(path.join(installDir, "Update.exe"), ["--uninstall", "-s"], { windowsHide: true, timeout: 120_000 })
    check("desinstalação concluída", r.status === 0, `exit ${r.status}`)
    const s4 = await waitFor(() => {
      const s = installState()
      return !s.desktop && !s.startMenu && !s.reg ? s : null
    }, 30_000)
    const fin = s4 ?? installState()
    check("desinstalação: atalhos removidos", !fin.desktop && !fin.startMenu)
    check("desinstalação: removido de Aplicativos instalados", !fin.reg)
    const gone = await waitFor(() => installState().apps.length === 0, 30_000)
    const left = gone ? [] : installState().apps
    if (left.length) {
      const files = ps(
        "$d=$env:OMNI_INSTALL_DIR; ConvertTo-Json -Compress -InputObject @(Get-ChildItem -LiteralPath $d -Recurse -Force -File -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { $_.FullName.Substring($d.Length) })",
        env,
      )
      console.log(`INFO restos em ${installDir}: ${JSON.stringify(files)}`)
      const procs = ps(
        "$d=$env:OMNI_INSTALL_DIR; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($d,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId.ToString() + ' ' + $_.CommandLine })",
        env,
      )
      console.log(`INFO processos vivos da pasta: ${JSON.stringify(procs)}`)
      for (const log of [path.join(installDir, "SquirrelSetup.log"), path.join(localAppData, "SquirrelTemp", "SquirrelSetup.log")]) {
        try {
          console.log(`INFO ${log} (fim):\n${readFileSync(log, "utf8").split(/\r?\n/).slice(-40).join("\n")}`)
        } catch {
          /* sem log */
        }
      }
    }
    check("desinstalação: versões removidas", left.length === 0, left.join(","))
    check("desinstalação: nenhum processo do app", appProcesses().length === 0)
    check("desinstalação: perfil local preservado (vendas pendentes)", existsSync(sentinel), profileDir)
  } else {
    console.log(`INFO mantido instalado (--keep-installed): ${installDir}`)
  }
} finally {
  for (const p of appProcesses()) spawnSync("taskkill", ["/PID", String(p.id), "/T", "/F"], { stdio: "ignore" })
  // Falha no meio: não deixa para trás o app que ESTE teste instalou (o perfil continua intocado).
  if (installedByTest && !keepInstalled && existsSync(path.join(installDir, "Update.exe")) && installState().reg) {
    const r = spawnSync(path.join(installDir, "Update.exe"), ["--uninstall", "-s"], { windowsHide: true, timeout: 120_000 })
    console.log(`INFO desinstalação de limpeza após falha: exit ${r.status}`)
  }
  // Remove só o marcador deste teste; o perfil do operador nunca é apagado.
  rmSync(sentinel, { force: true })
  report.hadProfileBefore = hadProfile
  report.finishedAt = new Date().toISOString()
  report.results = results
  const failed = results.filter((r) => !r.ok)
  report.status = failed.length ? "FAIL" : "PASS"
  const out = path.join(process.cwd(), "test-results", `install-test-${channel}.json`)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n")
  console.log(`\n${results.length - failed.length}/${results.length} verificações de instalação passaram → ${path.relative(process.cwd(), out)}`)
  process.exitCode = failed.length ? 1 : 0
}
