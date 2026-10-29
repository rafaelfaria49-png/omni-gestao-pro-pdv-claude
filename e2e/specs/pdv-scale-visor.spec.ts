import { test, expect, type Page } from "@playwright/test"
import { ORIGIN, STORE, SyntheticBackend, seedStorage } from "../fixtures/pdv-core"

declare global {
  interface Window {
    __scale: { opens: number; closes: number; cancels: number; requests: number; send: (frame: string) => void }
  }
}

let backend: SyntheticBackend
let errors: string[]
test.beforeEach(async ({ context, page }) => {
  backend = new SyntheticBackend(); errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== ORIGIN) { backend.unexpected.push(request.url()); await route.abort(); return }
    if (request.method() === "GET" && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) {
      await route.continue(); return
    }
    try { const result = await backend.respond(request.url(), request.method(), request.postData()); await route.fulfill({ status: result.status, json: result.body }) }
    catch { await route.abort("failed") }
  })
})
test.afterEach(() => {
  expect(backend.unexpected).toEqual([])
  expect(backend.posts).toEqual([])
  expect(errors).toEqual([])
})

async function mount(page: Page, mode: string) {
  const storage: Record<string, string> = {}
  seedStorage({ setItem: (key, value) => { storage[key] = value } }, "classic")
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
    const state = window.__scale = { opens: 0, closes: 0, cancels: 0, requests: 0, send: (_frame: string) => {} }
    let controller: ReadableStreamDefaultController<Uint8Array>
    const port = {
      readable: null as ReadableStream<Uint8Array> | null,
      async open() {
        state.opens++
        port.readable = new ReadableStream({ start(value) { controller = value }, cancel() { state.cancels++ } })
      },
      async close() {
        if (port.readable?.locked) throw new Error("reader_still_locked")
        state.closes++; port.readable = null
      },
    }
    state.send = (frame) => controller.enqueue(new TextEncoder().encode(frame))
    const serial = Object.assign(new EventTarget(), { async requestPort() { state.requests++; return port } })
    Object.defineProperty(navigator, "serial", { configurable: true, value: serial })
  }, storage)
  await page.goto(`/?surface=classic&modo=${mode}`)
  await expect(page.getByTestId("pdv-scale-visor")).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__n5?.ops.caixa.isOpen)).toBe(true)
}

async function transactionState(page: Page) {
  return page.evaluate((key) => ({
    sales: window.__n5.ops.sales, inventory: window.__n5.ops.inventory, caixa: window.__n5.ops.caixa,
    cart: localStorage.getItem(`omnigestao:pdv-classic-cart:${key}`), events: window.__n5.events,
    ledger: JSON.parse(localStorage.getItem(`assistec-pro-ops-v1-${key}`) ?? "{}").sales,
  }), STORE)
}

for (const mode of ["normal", "rapido"]) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`${mode} ${viewport.width}px: visor real, estados, layout e nenhuma mutação transacional`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await mount(page, mode)
      const before = await transactionState(page)
      expect(await page.evaluate(() => window.__scale.requests)).toBe(0)
      const visor = page.getByTestId("pdv-scale-visor")
      await expect(visor.getByLabel("Peso recebido da balança")).toHaveText("— kg")
      await page.screenshot({ path: testInfo.outputPath("desconectada.png"), fullPage: true })
      await visor.getByLabel("Protocolo da balança").selectOption("and-hvg-stream")
      await visor.getByRole("button", { name: "Conectar balança" }).click()
      const status = visor.getByRole("status", { name: "Estado da balança" })
      await expect(status).toHaveText("Conectada, aguardando leitura")
      await page.evaluate(() => window.__scale.send("US,+0001.234 kg\r\n"))
      await expect(status).toHaveText("Peso instável")
      await expect(visor.getByLabel("Peso recebido da balança")).toHaveText("1,234 kg")
      await page.evaluate(() => window.__scale.send("ST,+0000.000 kg\r\n"))
      await expect(status).toHaveText("Peso estável")
      await expect(visor.getByLabel("Peso recebido da balança")).toHaveText("0,000 kg")
      await page.screenshot({ path: testInfo.outputPath("zero-valido.png"), fullPage: true })
      await expect(status).toHaveText("Leitura desatualizada", { timeout: 5000 })
      await expect(visor.getByLabel("Peso recebido da balança")).toHaveText("— kg")
      await visor.getByRole("button", { name: "Desconectar" }).click()
      await expect(status).toHaveText("Desconectada")
      expect(await page.evaluate(() => ({ closes: window.__scale.closes, cancels: window.__scale.cancels }))).toEqual({ closes: 1, cancels: 1 })
      expect(await transactionState(page)).toEqual(before)
      const control = page.getByRole("button", { name: /Finalizar Venda/ }).first()
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeVisible()
      await expect(page.getByLabel("Código / Bipe")).toBeAttached()
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width)
      await expect(page.getByLabel("Quantidade")).toHaveValue("1")
      await expect(page.getByText("Nenhum item bipado")).toBeAttached()
      await expect(page.getByRole("dialog")).toHaveCount(0)
      expect(await page.evaluate(() => window.__n5.ops.inventory.length)).toBe(1)
    })
  }
}
