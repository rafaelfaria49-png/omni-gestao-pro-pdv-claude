import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { PDFDocument } from "pdf-lib"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { snapshotSchema } from "../../lib/identificacao/contracts"

const A = "e2e-vest-a", B = "e2e-vest-b", OFF = "e2e-vest-off", LOJA_KEY = "assistec-pro-loja-ativa-v1"
const url = process.env.VESTUARIO_P02_E2E_DATABASE_URL || ""
if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/vest_p02_e2e[a-z0-9_]*$/.test(url)) throw new Error("E2E P03 somente PG descartável loopback.")
const db = new PrismaClient({ datasourceUrl: url })
test.afterAll(() => db.$disconnect())
let pageErrors: string[] = []
test.beforeEach(() => { pageErrors = [] })
test.afterEach(() => { expect(pageErrors).toEqual([]) })
const shot = (name: string) => path.join(__dirname, "../../test-results/vestuario-p03-e2e/screens", name)
async function session(browser: Browser, store = A, user: "dono" | "lojaB" = "dono"): Promise<Page> {
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "allow", viewport: { width: 1440, height: 1000 } })
  ctx.on("page", p => p.on("pageerror", e => pageErrors.push(e.stack || e.message)))
  await ctx.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem("p03-e2e-store")) { localStorage.setItem(key, value); sessionStorage.setItem("p03-e2e-store", "1") }
  }, [LOJA_KEY, store] as const)
  const page = await ctx.newPage()
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async d => { await d.getByRole("button", { name: /^Voltar depois$/i }).click() })
  await page.goto("/login")
  await page.getByLabel("Email").fill(user === "dono" ? "dono@e2e-vestuario.invalid" : "gerente-b@e2e-vestuario.invalid")
  const pw = process.env[user === "dono" ? "VESTUARIO_P02_E2E_PW_DONO" : "VESTUARIO_P02_E2E_PW_LOJA_B"]
  if (!pw) throw new Error("Credencial sintética ausente")
  await page.getByRole("textbox", { name: "Senha" }).evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }, pw)
  await Promise.all([page.waitForURL(/\/dashboard(\/|\?|$)/), page.getByRole("button", { name: "Entrar" }).click()])
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  return page
}
async function open(page: Page) {
  await page.goto("/dashboard/cadastros-v2?aba=etiquetas")
  await expect(page.getByRole("heading", { name: "Identificação e etiquetas" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText("Consultando catálogo…")).toHaveCount(0)
}
const panel = (p: Page) => p.getByRole("region", { name: "Identificação e etiquetas" })
const row = (p: Page, sku: string) => panel(p).getByRole("listitem").filter({ has: p.getByRole("spinbutton", { name: `Quantidade ${sku}`, exact: true }) })
async function issue(page: Page, sku: string) {
  await row(page, sku).getByRole("button", { name: "Códigos", exact: true }).click()
  await page.getByRole("button", { name: "Emitir código interno", exact: true }).click()
  await expect(row(page, sku).getByText(/OGV-[0-9]{12}/)).toBeVisible()
  await page.getByRole("button", { name: "Fechar", exact: true }).click()
}
test("HUB → emissão real → lookup → lote → PDF → impressão incerta e reimpressão auditada", async ({ browser }) => {
  const page = await session(browser)
  await open(page)
  await issue(page, "LEGADO-E2E")
  await issue(page, "P03-PRE-M")
  const identifier = await db.identificadorProduto.findFirstOrThrow({ where: { storeId: A, produtoId: "e2e-vest-legado", tipo: "INTERNO" } })
  await page.getByRole("textbox", { name: "Ler código", exact: true }).fill(identifier.valor)
  await page.getByRole("textbox", { name: "Ler código", exact: true }).press("Enter")
  await expect(page.getByText("Código identificado nesta loja.")).toBeVisible()
  await expect(row(page, "LEGADO-E2E")).toBeVisible()
  await page.getByRole("button", { name: "Buscar", exact: true }).click()
  await row(page, "LEGADO-E2E").getByRole("spinbutton").fill("2")
  await row(page, "P03-PRE-M").getByRole("spinbutton").fill("3")
  await page.getByRole("checkbox", { name: "Incluir preço de venda" }).check()
  await page.getByRole("button", { name: "Salvar lote para conferência" }).click()
  await expect(page.getByText("Lote salvo. Gere o PDF para conferir o conteúdo antes de imprimir.")).toBeVisible()
  const original = await db.etiquetaLote.findFirstOrThrow({ where: { storeId: A }, orderBy: { createdAt: "desc" } })
  expect(original.total).toBe(5)
  const response = page.waitForResponse(r => r.url().includes(`/api/identificacao/etiquetas/${original.id}`) && r.request().method() === "GET")
  await page.getByRole("button", { name: "Gerar prévia / PDF" }).click()
  const pdf = await response
  expect(pdf.status()).toBe(200); expect(pdf.headers()["content-type"]).toBe("application/pdf")
  // APIRequest lê o transporte binário sem a interceptação PDF do Chromium/CDP.
  const transport = await page.request.get(`/api/identificacao/etiquetas/${original.id}?storeId=${A}`)
  expect(transport.status()).toBe(200)
  const body = await transport.body()
  expect(body.subarray(0, 5).toString()).toBe("%PDF-")
  expect((await PDFDocument.load(body)).getPageCount()).toBe(5)
  expect(Number(transport.headers()["content-length"])).toBe(body.byteLength)
  await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible()
  const clientBytes = await page.getByRole("link", { name: "Baixar PDF" }).evaluate(async link => {
    const data = await (await fetch((link as HTMLAnchorElement).href)).arrayBuffer()
    return Array.from(new Uint8Array(data))
  })
  expect(Buffer.from(clientBytes).equals(body)).toBe(true)
  const visual = page.frameLocator('iframe[title="Prévia das etiquetas"]')
  await expect(visual.getByRole("img")).toHaveCount(5)
  await expect(visual.getByRole("img").first()).toBeVisible()
  await visual.locator("body").evaluate(async () => { await document.fonts.ready })
  await mkdir(path.join(__dirname, "../../test-results/vestuario-p03-e2e/pdf"), { recursive: true })
  await writeFile(path.join(__dirname, "../../test-results/vestuario-p03-e2e/pdf/lote-real-api.pdf"), body)
  const snapshot = snapshotSchema.parse(original.snapshot)
  await writeFile(path.join(__dirname, "../../test-results/vestuario-p03-e2e/pdf/expected.json"), JSON.stringify({ codes: snapshot.items.flatMap(i => Array.from({ length: i.quantidade }, () => i.codigo)) }))
  await page.screenshot({ path: shot("01-lote-pdf-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: shot("02-etiquetas-mobile.png"), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  // Stub SOMENTE do boundary físico. Toda solicitação/estado passa pela app/NextAuth/PG real.
  await page.evaluate(() => { window.open = () => null })
  await page.getByRole("button", { name: "Solicitar impressão" }).click()
  await expect(page.getByText("Falha antes do envio", { exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByRole("heading", { name: "Identificação e etiquetas" })).toBeVisible()
  await page.getByRole("button", { name: /5 etiquetas · Lote original/ }).click()
  await page.getByRole("button", { name: "Gerar prévia / PDF" }).click()
  await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible()
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window)
    window.open = (...args) => { const popup = originalOpen(...args); if (popup) popup.print = () => { localStorage.setItem("p03-print-boundary-calls", String(Number(localStorage.getItem("p03-print-boundary-calls") || 0) + 1)) }; return popup }
  })
  await page.getByRole("button", { name: "Solicitar impressão" }).click()
  await expect(page.getByText("Resultado desconhecido · confira a saída física")).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("p03-print-boundary-calls"))).toBe("1")
  page.once("dialog", dialog => dialog.accept())
  await page.getByRole("button", { name: "Confirmei a saída física" }).click()
  await expect(page.getByText("Saída confirmada manualmente")).toBeVisible()
  await page.getByRole("textbox", { name: "Motivo da reimpressão" }).fill("Papel sintético amassado em QA")
  await page.getByRole("button", { name: "Criar reimpressão", exact: true }).click()
  await expect(page.getByRole("button", { name: /5 etiquetas · Reimpressão/ })).toBeVisible()
  const reprint = await db.etiquetaLote.findFirstOrThrow({ where: { storeId: A, originalId: original.id } })
  expect(reprint.snapshot).toEqual(original.snapshot)
  expect(await db.identificadorProduto.count({ where: { storeId: A, tipo: "INTERNO" } })).toBe(2)
  expect((await db.produto.findUniqueOrThrow({ where: { id: "e2e-vest-legado" } })).stock).toBe(4)
  expect(await db.movimentacaoEstoque.count({ where: { produtoId: { in: ["e2e-vest-legado", "p03-e2e-camiseta"] } } })).toBe(0)
  const cachedPrivate = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
      if (new URL(request.url).pathname.startsWith("/api/identificacao/")) urls.push(request.url)
    }
    return urls
  })
  expect(cachedPrivate).toEqual([])
  await page.context().close()
})
test("resposta perdida após commit recupera a mesma emissão; consentimento preserva código P02", async ({ browser }) => {
  const page = await session(browser); await open(page)
  await row(page, "P03-AZU-GG").getByRole("button", { name: "Códigos", exact: true }).click()
  await expect(page.getByRole("button", { name: "Emitir código interno" })).toBeDisabled()
  await page.getByRole("checkbox", { name: /Preservar o código existente/ }).check()
  let lost = false
  await page.context().route("**/dashboard/cadastros-v2*", async route => {
    if (!lost && route.request().method() === "POST" && route.request().postData()?.includes("preservarCodigoExistente")) {
      lost = true; await route.fetch(); await route.abort("failed")
    } else await route.continue()
  })
  await page.getByRole("button", { name: "Emitir código interno" }).click()
  await expect(page.getByRole("button", { name: "Consultar resultado" })).toBeVisible()
  expect(lost).toBe(true)
  await page.getByRole("button", { name: "Consultar resultado" }).click()
  await expect(page.getByText(/Resultado recuperado/)).toBeVisible()
  const v = await db.vestuarioVariante.findFirstOrThrow({ where: { storeId: A, sku: "P03-AZU-GG" } })
  expect(await db.identificadorProduto.count({ where: { storeId: A, varianteId: v.id, tipo: "INTERNO" } })).toBe(1)
  expect(await db.identificadorProduto.findFirst({ where: { storeId: A, varianteId: v.id, tipo: "ALIAS", valor: "P03-CODIGO-ANTERIOR" } })).not.toBeNull()
  await page.context().close()
})
test("PDF e HUB exigem sessão/loja; loja desligada e conta B não acessam dados A", async ({ browser, request }) => {
  const original = await db.etiquetaLote.findFirstOrThrow({ where: { storeId: A }, orderBy: { createdAt: "asc" } })
  expect((await request.get(`/api/identificacao/etiquetas/${original.id}?storeId=${A}`)).status()).toBe(403)
  const page = await session(browser, B, "lojaB"); await open(page)
  await expect(page.getByText("Produto isolado B P03", { exact: true })).toBeVisible()
  await expect(page.getByText("Camiseta Algodão P03", { exact: true })).toHaveCount(0)
  expect((await page.request.get(`/api/identificacao/etiquetas/${original.id}?storeId=${A}`)).status()).toBe(403)
  expect((await page.request.get(`/api/identificacao/etiquetas/${original.id}?storeId=${B}`)).status()).toBe(404)
  await page.context().close()
  const off = await session(browser, OFF)
  await off.goto("/dashboard/cadastros-v2?aba=etiquetas")
  await expect(off.getByRole("heading", { name: "Cadastros HUB" })).toBeVisible()
  await expect(off.getByRole("button", { name: "Etiquetas", exact: true })).toHaveCount(0)
  await expect(off.getByRole("heading", { name: "Identificação e etiquetas" })).toHaveCount(0)
  await off.context().close()
})
