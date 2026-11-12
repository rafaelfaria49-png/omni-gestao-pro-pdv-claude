/**
 * E2E do processo principal com Electron real (app não empacotado, canal development,
 * origem = servidor-fixture local). Diálogos nativos e shell.openExternal são substituídos
 * por gravadores dentro do processo principal — nada abre fora do teste.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import type http from "node:http"
import os from "node:os"
import path from "node:path"
import { FIXTURE_ORIGIN, startFixtureServer } from "./fixture-server"

const root = path.resolve(__dirname, "..", "..")
let server: http.Server
let app: ElectronApplication
let userData: string
let proc: ReturnType<ElectronApplication["process"]> | undefined

async function launch(): Promise<ElectronApplication> {
  const a = await electron.launch({
    args: ["."],
    cwd: root,
    env: { ...process.env, OMNI_DESKTOP_TEST_USER_DATA: userData },
  })
  // Gravadores no processo principal: diálogos respondem "não/cancelar", externos não abrem.
  await a.evaluate(({ dialog, shell }) => {
    const g = globalThis as unknown as Record<string, unknown[]>
    g.__dialogs = []
    g.__external = []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      g.__dialogs.push(args.find((x) => x && typeof x === "object" && "message" in (x as object)))
      return { response: 1, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      g.__dialogs.push(args.find((x) => x && typeof x === "object" && "message" in (x as object)))
      return 0
    }) as typeof dialog.showMessageBoxSync
    shell.openExternal = (async (url: string) => {
      g.__external.push(url)
    }) as typeof shell.openExternal
  })
  return a
}

async function findPage(a: ElectronApplication, match: (url: string) => boolean): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const p = a.windows().find((w) => match(w.url()))
    if (p) return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`página não encontrada; abertas: ${a.windows().map((w) => w.url()).join(", ")}`)
}

const appPage = (a: ElectronApplication) => findPage(a, (u) => u.startsWith(FIXTURE_ORIGIN))
const statusPage = (a: ElectronApplication) => findPage(a, (u) => u === "omni-app://status/status.html")

async function statusVisible(a: ElectronApplication): Promise<boolean> {
  return a.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow())
    return (w?.contentView.children.length ?? 0) > 0
  })
}

const recorded = (a: ElectronApplication) =>
  a.evaluate(() => {
    const g = globalThis as unknown as Record<string, unknown[]>
    return { dialogs: g.__dialogs as Array<{ message: string }>, external: g.__external as string[] }
  })

test.beforeAll(async () => {
  server = await startFixtureServer()
})
test.afterAll(async () => {
  await new Promise((r) => server.close(r))
})
test.beforeEach(async () => {
  userData = mkdtempSync(path.join(os.tmpdir(), "omni-desktop-e2e-"))
  app = await launch()
  proc = app.process()
})
test.afterEach(async () => {
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))])
  if (proc && proc.exitCode === null) proc.kill()
  rmSync(userData, { recursive: true, force: true })
})

test("abre a origem fixa em /login, com título fixo e janela segura", async () => {
  const page = await appPage(app)
  await expect(page.locator("#page")).toHaveText("login")
  await expect.poll(() => statusVisible(app)).toBe(false)

  const info = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const prefs = (w.webContents as unknown as { getLastWebPreferences: () => Electron.WebPreferences }).getLastWebPreferences()
    return {
      title: w.getTitle(),
      min: w.getMinimumSize(),
      prefs: {
        nodeIntegration: prefs.nodeIntegration,
        contextIsolation: prefs.contextIsolation,
        sandbox: prefs.sandbox,
        webSecurity: prefs.webSecurity,
        preload: prefs.preload ?? null,
      },
    }
  })
  expect(info.title).toBe("OmniGestão Pro — Desenvolvimento (127.0.0.1:47613)")
  expect(info.min).toEqual([1024, 640])
  expect(info.prefs).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, preload: null })

  // Página remota não enxerga Node nem a ponte da tela de status.
  const exposed = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    omniStatus: typeof (window as unknown as { omniStatus?: unknown }).omniStatus,
  }))
  expect(exposed).toEqual({ require: "undefined", process: "undefined", omniStatus: "undefined" })

  // Maximizar / restaurar / minimizar.
  const states = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const wait = () => new Promise((r) => setTimeout(r, 400))
    w.maximize(); await wait()
    const max = w.isMaximized()
    w.unmaximize(); await wait()
    const restored = !w.isMaximized()
    w.minimize(); await wait()
    const min = w.isMinimized()
    w.restore(); await wait()
    return { max, restored, min }
  })
  expect(states).toEqual({ max: true, restored: true, min: true })
})

test("bloqueia navegação perigosa e manda externo para o navegador com confirmação", async () => {
  const page = await appPage(app)
  for (const target of ["file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,<b>x</b>"]) {
    await page.evaluate((t) => {
      const a = document.createElement("a")
      a.href = t
      document.body.appendChild(a)
      a.click()
    }, target)
  }
  await page.evaluate(() => {
    location.href = "https://example.com/phish"
  })
  await page.waitForTimeout(800)
  expect(page.url()).toBe(`${FIXTURE_ORIGIN}/login`)
  const rec = await recorded(app)
  // example.com não é host confiável → pergunta; o gravador responde "Cancelar" → não abre.
  expect(rec.dialogs.some((d) => d?.message?.includes("example.com"))).toBe(true)
  expect(rec.external).toEqual([])

  // Host confiável (WhatsApp) abre direto no navegador do sistema, nunca dentro do app.
  await page.evaluate(() => window.open("https://wa.me/5500000000000", "_blank"))
  await expect.poll(async () => (await recorded(app)).external).toEqual(["https://wa.me/5500000000000"])
  expect(app.windows().filter((w) => w.url().includes("wa.me"))).toHaveLength(0)
})

test("popup de impressão (about:blank + document.write) abre isolado; popups perigosos são negados", async () => {
  const page = await appPage(app)
  await page.click("#enter")
  await expect(page.locator("#page")).toHaveText("dashboard")

  const popupPromise = app.waitForEvent("window")
  expect(await page.evaluate(() => (window as unknown as { __printPopup: () => string }).__printPopup())).toBe("opened")
  const popup = await popupPromise
  await expect(popup.locator("#cupom")).toHaveText("CUPOM TESTE 80mm")
  expect(await popup.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe("undefined")
  const popupPrefs = await app.evaluate(({ BrowserWindow }) => {
    const child = BrowserWindow.getAllWindows().find((w) => w.getParentWindow())!
    const p = (child.webContents as unknown as { getLastWebPreferences: () => Electron.WebPreferences }).getLastWebPreferences()
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, menu: child.isMenuBarVisible() }
  })
  expect(popupPrefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false, menu: false })

  // A janela de documento não pode ser levada para file: nem javascript:.
  await popup.evaluate(() => {
    location.href = "file:///C:/Windows/win.ini"
  })
  await popup.waitForTimeout(500)
  expect(popup.url()).toBe("about:blank")

  const denied = await page.evaluate(() => [
    window.open("file:///C:/", "_blank") === null,
    window.open("data:text/html,x", "_blank") === null,
  ])
  expect(denied).toEqual([true, true])
  // javascript: em window.open: o Chromium entrega ao handler como about:blank e roda o script
  // com o privilégio da própria página (sem ganho). Nenhuma janela fica em javascript:/file:/data:.
  await page.evaluate(() => window.open("javascript:void(0)", "_blank"))
  await page.waitForTimeout(300)
  const urls = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()))
  expect(urls.filter((u) => /^(javascript|file|data):/.test(u))).toEqual([])
})

test("atalhos do PDV chegam à página; F5 não recarrega; acorde do desktop abre Sobre", async () => {
  const page = await appPage(app)
  await page.click("#enter")
  await expect(page.locator("#page")).toHaveText("dashboard")
  const marker = await page.evaluate(() => (window as unknown as { __marker: number }).__marker)
  await page.locator("body").click()

  const keys = ["F1", "F2", "F3", "F5", "F6", "F8", "F9", "F10", "F12", "Control+l", "Control+r", "Control+w", "NumpadAdd", "Enter"]
  for (const k of keys) await page.keyboard.press(k)
  // Leitor de código de barras = teclado: dígitos rápidos + Enter.
  await page.keyboard.type("7891234567895", { delay: 5 })
  await page.keyboard.press("Enter")

  const got = await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)
  expect(got.slice(0, 14)).toEqual(["F1", "F2", "F3", "F5", "F6", "F8", "F9", "F10", "F12", "Ctrl+l", "Ctrl+r", "Ctrl+w", "+", "Enter"])
  expect(got.slice(14).join("")).toBe("7891234567895Enter")
  // Nenhum recarregamento/fechamento: mesma página viva e janela aberta.
  expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(marker)
  expect(page.url()).toBe(`${FIXTURE_ORIGIN}/dashboard`)

  // Caminho de teclado real do Electron (sendInputEvent passa por before-input-event, como o teclado físico).
  await page.evaluate(() => ((window as unknown as { __keys: string[] }).__keys.length = 0))
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!.webContents
    const send = (keyCode: string, modifiers: Array<"control"> = []) => {
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers })
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers })
    }
    for (const k of ["F1", "F2", "F3", "F5", "F6", "F8", "F9", "F10", "F12"]) send(k)
    send("L", ["control"])
    send("R", ["control"])
  })
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __keys: string[] }).__keys))
    .toEqual(["F1", "F2", "F3", "F5", "F6", "F8", "F9", "F10", "F12", "Ctrl+l", "Ctrl+r"])
  expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(marker)

  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!.webContents
    wc.sendInputEvent({ type: "keyDown", keyCode: "V", modifiers: ["control", "shift", "alt"] })
  })
  await expect.poll(() => statusVisible(app)).toBe(true)
  const status = await statusPage(app)
  await expect(status.locator("#title")).toHaveText("OmniGestão Pro para Windows")
  await expect(status.locator("#channel-strip")).toContainText("Desenvolvimento")
  await expect(status.locator("#meta")).toContainText("Versão 0.1.0")
  await status.keyboard.press("Escape")
  await expect.poll(() => statusVisible(app)).toBe(false)
})

test("logout limpa Cache Storage do SW e cookie de sessão, preservando o resto", async () => {
  const page = await appPage(app)
  await page.click("#enter")
  await expect(page.locator("#page")).toHaveText("dashboard")
  expect(await page.evaluate(() => (window as unknown as { __fillCache: () => Promise<number> }).__fillCache())).toBe(1)
  await page.evaluate(() => localStorage.setItem("pdv-pendentes", "venda-offline-1"))

  const cookieNames = () =>
    app.evaluate(async ({ session }, origin) => {
      const ses = session.fromPartition("persist:omnigestao-development")
      return (await ses.cookies.get({ url: origin })).map((c) => c.name).sort()
    }, FIXTURE_ORIGIN)
  expect(await cookieNames()).toEqual(["authjs.session-token", "pref"])

  await page.click("#to-login")
  await expect(page.locator("#page")).toHaveText("login")
  await expect.poll(cookieNames).toEqual(["pref"])
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBe(0)
  // Vendas pendentes do PDV (localStorage) nunca são apagadas pelo desktop.
  expect(await page.evaluate(() => localStorage.getItem("pdv-pendentes"))).toBe("venda-offline-1")
})

test("download da mesma origem salva; câmera pede consentimento; serial negado", async () => {
  const page = await appPage(app)
  await page.click("#enter")
  const target = path.join(userData, "relatorio.csv")
  await app.evaluate(({ session }, savePath) => {
    session.fromPartition("persist:omnigestao-development").on("will-download", (_e, item) => item.setSavePath(savePath))
  }, target)
  await page.click("#download")
  await expect.poll(() => existsSync(target) && readFileSync(target, "utf8")).toBe("a;b\n1;2\n")

  const cam = await page.evaluate(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
      return "granted"
    } catch (e) {
      return (e as Error).name
    }
  })
  expect(cam).toBe("NotAllowedError")
  expect((await recorded(app)).dialogs.some((d) => d?.message?.includes("câmera"))).toBe(true)

  const serial = await page.evaluate(async () => {
    const nav = navigator as unknown as { serial?: { requestPort: () => Promise<unknown> } }
    if (!nav.serial) return "sem-api"
    try {
      await nav.serial.requestPort()
      return "granted"
    } catch (e) {
      return (e as Error).name
    }
  })
  expect(["NotFoundError", "SecurityError", "sem-api"]).toContain(serial)
})

test("sem servidor mostra tela offline e volta sozinho quando o servidor responde", async () => {
  const page = await appPage(app)
  await expect(page.locator("#page")).toHaveText("login")
  const closed = new Promise((r) => server.close(r))
  server.closeAllConnections()
  await closed
  await page.evaluate(() => {
    location.href = "/dashboard"
  })
  await expect.poll(() => statusVisible(app), { timeout: 15_000 }).toBe(true)
  const status = await statusPage(app)
  await expect(status.locator("#title")).toHaveText("Sem conexão com o servidor")
  await expect(status.locator("#retry")).toBeVisible()

  server = await startFixtureServer()
  await expect.poll(() => statusVisible(app), { timeout: 15_000 }).toBe(false)
  await expect(page.locator("#page")).toHaveText("dashboard")
})

test("abrir sem servidor mostra a tela offline (não a página de erro do Chromium)", async () => {
  await appPage(app)
  // Reinicia o app com o servidor fora do ar.
  await app.close()
  const closed = new Promise((r) => server.close(r))
  server.closeAllConnections()
  await closed
  app = await launch()
  proc = app.process()
  await expect.poll(() => statusVisible(app), { timeout: 15_000 }).toBe(true)
  const status = await statusPage(app)
  await expect(status.locator("#title")).toHaveText("Sem conexão com o servidor")
  await page_wait(1500)
  expect(await statusVisible(app)).toBe(true)
  server = await startFixtureServer()
  await expect.poll(() => statusVisible(app), { timeout: 15_000 }).toBe(false)
  await expect((await appPage(app)).locator("#page")).toHaveText("login")
})

const page_wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test("HTTP 5xx mostra erro do servidor e o botão tenta de novo", async () => {
  const page = await appPage(app)
  await page.evaluate(() => {
    location.href = "/boom"
  })
  await expect.poll(() => statusVisible(app)).toBe(true)
  const status = await statusPage(app)
  await expect(status.locator("#title")).toHaveText("O servidor respondeu com erro")
  await expect(status.locator("#detail")).toHaveText("HTTP 503")
})

test("instância única: segunda abertura sai e foca a primeira", async () => {
  await appPage(app)
  const electronPath = require("electron") as unknown as string
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(electronPath, ["."], {
      cwd: root,
      env: { ...process.env, OMNI_DESKTOP_TEST_USER_DATA: userData },
      stdio: "ignore",
    })
    const t = setTimeout(() => {
      child.kill()
      resolve(-999)
    }, 15_000)
    child.on("exit", (c) => {
      clearTimeout(t)
      resolve(c)
    })
  })
  expect(code).toBe(0)
  expect(app.windows().filter((w) => w.url().startsWith(FIXTURE_ORIGIN))).toHaveLength(1)
})

test("fechar com operação em andamento pergunta antes de sair", async () => {
  const page = await appPage(app)
  await page.evaluate(() => {
    window.addEventListener("beforeunload", (e) => {
      e.preventDefault()
      e.returnValue = ""
    })
  })
  await page.locator("body").click() // beforeunload exige gesto do usuário
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(async () => (await recorded(app)).dialogs.some((d) => d?.message?.includes("operação em andamento"))).toBe(true)
  // O gravador respondeu "Continuar no sistema": a janela continua aberta.
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBeGreaterThan(0)

  // Agora o operador escolhe "Sair mesmo assim": a janela fecha.
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect.poll(() => app.windows().filter((w) => w.url().startsWith("http")).length).toBe(0)
})
