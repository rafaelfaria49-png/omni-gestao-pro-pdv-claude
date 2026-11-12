// Smoke do EXECUTÁVEL REAL (instalado ou de out/), canal QA.
//
// Uso: node tests/packaged/smoke.mjs "<caminho do OmniGestaoPro.exe>"
//
// Abre o app com porta de depuração (permitida só fora de Produção), conecta por CDP e verifica:
// janela, origem fixa, tela de status, isolamento da página remota, bloqueio de navegação,
// tempo de abertura e memória. Só faz GETs de páginas públicas (/login). Não faz login.
import { chromium } from "@playwright/test"
import { spawn, execSync } from "node:child_process"
import path from "node:path"

const exe = process.argv[2]
if (!exe) throw new Error("informe o caminho do OmniGestaoPro.exe")
const port = 9411
const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}

const t0 = Date.now()
const child = spawn(exe, [`--remote-debugging-port=${port}`], { stdio: "ignore" })
let browser
try {
  for (let i = 0; i < 60 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (!browser) throw new Error("CDP não respondeu")
  const pages = () => browser.contexts().flatMap((c) => c.pages())
  let app
  for (let i = 0; i < 80 && !app; i++) {
    app = pages().find((p) => p.url().startsWith("https://"))
    if (!app) await new Promise((r) => setTimeout(r, 250))
  }
  if (!app) throw new Error(`página remota não abriu: ${pages().map((p) => p.url())}`)
  await app.waitForLoadState("domcontentloaded")
  const openMs = Date.now() - t0
  const origin = new URL(app.url()).origin
  check("abre na origem fixa em /login", new URL(app.url()).pathname.startsWith("/login"), app.url())
  check("origem QA não é Produção", origin !== "https://omni-gestao-pro.vercel.app", origin)
  check("tempo até a tela de login", openMs < 15000, `${openMs} ms`)

  const status = pages().find((p) => p.url() === "omni-app://status/status.html")
  check("tela de status carregou do pacote (omni-app://)", !!status)
  if (status) {
    const strip = await status.locator("#channel-strip").textContent()
    check("faixa de QA visível na tela de status", /QA/.test(strip ?? ""), strip?.trim())
  }

  const exposed = await app.evaluate(() => [typeof window.require, typeof window.process, typeof window.omniStatus])
  check("página remota sem Node/IPC", exposed.every((t) => t === "undefined"), exposed.join(","))

  await app.evaluate(() => {
    location.href = "file:///C:/Windows/win.ini"
  })
  await new Promise((r) => setTimeout(r, 800))
  check("navegação file:// bloqueada", app.url().startsWith(origin), app.url())

  const swOk = await app.evaluate(async () => "serviceWorker" in navigator)
  check("Service Worker disponível (PWA)", swOk)

  // Memória: soma do working set dos processos do app.
  const exeName = path.basename(exe)
  const csv = execSync(`tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, { encoding: "utf8" })
  const kb = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => Number((l.split('","')[4] ?? "0").replace(/[^\d]/g, "")))
    .reduce((a, b) => a + b, 0)
  check("memória total (working set)", kb > 0 && kb < 900_000, `${Math.round(kb / 1024)} MB em ${csv.trim().split(/\r?\n/).length} processos`)
} finally {
  await browser?.close().catch(() => {})
  child.kill()
  try {
    execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" })
  } catch {
    /* já saiu */
  }
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`)
process.exit(failed.length ? 1 : 0)
