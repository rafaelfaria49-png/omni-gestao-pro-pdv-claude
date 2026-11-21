/**
 * Impressão direta (spooler do Windows): segurança da ponte e, com OMNI_PRINT_TEST_DEVICE definido,
 * um cupom SINTÉTICO real (sem venda). Sem a variável (CI), nada vai para papel.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type http from "node:http"
import os from "node:os"
import path from "node:path"
import { FIXTURE_ORIGIN, startFixtureServer } from "./fixture-server"

const root = path.resolve(__dirname, "..", "..")
const DEVICE = process.env.OMNI_PRINT_TEST_DEVICE?.trim() || ""
let server: http.Server
let app: ElectronApplication
let userData: string

type Bridge = {
  listPrinters: () => Promise<Array<{ name: string }>>
  getStation: () => Promise<unknown>
  setStation: (s: unknown) => Promise<{ ok: boolean; error?: string }>
  print: (r: unknown) => Promise<{ ok: boolean; status: string; duplicate?: boolean; error?: string }>
}
declare global {
  interface Window {
    omniDesktopPrint?: Bridge
  }
}

async function appPage(a: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const p = a.windows().find((w) => w.url().startsWith(FIXTURE_ORIGIN))
    if (p) return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("página do app não abriu")
}

test.beforeAll(async () => {
  server = await startFixtureServer()
})
test.afterAll(async () => {
  await new Promise((r) => server.close(r))
})
test.beforeEach(async () => {
  userData = mkdtempSync(path.join(os.tmpdir(), "omni-desktop-print-"))
  app = await electron.launch({ args: ["."], cwd: root, env: { ...process.env, OMNI_DESKTOP_TEST_USER_DATA: userData } })
})
test.afterEach(async () => {
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))])
  rmSync(userData, { recursive: true, force: true })
})

test("ponte expõe só 4 operações e nada de Node", async () => {
  const page = await appPage(app)
  const shape = await page.evaluate(() => ({
    keys: Object.keys(window.omniDesktopPrint ?? {}).sort(),
    frozen: Object.isFrozen(window.omniDesktopPrint),
    require: typeof (window as unknown as { require?: unknown }).require,
  }))
  expect(shape).toEqual({ keys: ["getStation", "listPrinters", "print", "setStation", "version"], frozen: true, require: "undefined" })
})

test("sem estação configurada não imprime; dados inválidos e impressora inexistente são recusados", async () => {
  const page = await appPage(app)
  const r = await page.evaluate(async () => {
    const b = window.omniDesktopPrint!
    return {
      station: await b.getStation(),
      notConfigured: await b.print({ html: "<p>x</p>" }),
      badStation: await b.setStation({ deviceName: "Impressora-Que-Nao-Existe-123", bobina: "80mm" }),
      badBobina: await b.setStation({ deviceName: "x", bobina: "100mm" }),
      badKind: await b.print({ html: "<p>x</p>", kind: "shell" }),
      tooBig: await b.print({ html: "x".repeat(300 * 1024) }),
    }
  })
  expect(r.station).toBeNull()
  expect(r.notConfigured.status).toBe("not-configured")
  expect(r.badStation).toEqual({ ok: false, error: "Impressora não encontrada no Windows." })
  expect(r.badBobina.ok).toBe(false)
  expect(r.badKind.status).toBe("invalid")
  // O preload corta em 256 KiB; o principal valida o resto (sem estação = not-configured, nunca imprime).
  expect(r.tooBig.ok).toBe(false)
})

test("popup (window.open) não recebe a ponte", async () => {
  const page = await appPage(app)
  const popupPromise = app.waitForEvent("window")
  await page.evaluate(() => window.open("/dashboard", "_blank"))
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(await popup.evaluate(() => typeof window.omniDesktopPrint)).toBe("undefined")
})

test("IPC de impressão recusa remetente que não é a janela principal", async () => {
  const res = await app.evaluate(async ({ BrowserWindow }) => {
    const other = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await other.loadURL("data:text/html,<p>x</p>")
    const ok = await other.webContents
      .executeJavaScript("typeof window.omniDesktopPrint")
      .catch(() => "erro")
    other.destroy()
    return ok
  })
  expect(res).toBe("undefined")
})

test("PC real: escolhe a impressora, persiste e imprime cupom sintético sem diálogo", async () => {
  test.skip(!DEVICE, "OMNI_PRINT_TEST_DEVICE não definido (CI sem impressora)")
  const page = await appPage(app)
  const r = await page.evaluate(async (device) => {
    const b = window.omniDesktopPrint!
    const names = (await b.listPrinters()).map((p) => p.name)
    const set = await b.setStation({ deviceName: device, bobina: "80mm" })
    const test1 = await b.print({ html: "", kind: "test" })
    return { names, set, test1 }
  }, DEVICE)
  expect(r.names).toContain(DEVICE)
  expect(r.set.ok).toBe(true)
  expect(r.test1).toMatchObject({ ok: true, status: "queued" })
  expect(JSON.parse(readFileSync(path.join(userData, "print-station.json"), "utf8"))).toEqual({ deviceName: DEVICE, bobina: "80mm" })
})
