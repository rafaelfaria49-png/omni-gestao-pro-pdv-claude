import { test, expect, type Page } from "@playwright/test"
import { CUSTOMER, ORIGIN, OPS_KEY, STORE, SURFACES, SyntheticBackend, seedStorage, type Surface } from "../fixtures/pdv-core"
import type { SaleRecord } from "../../lib/operations-sale-types"
import type { useOperationsStore } from "../../lib/operations-store"

declare global {
  interface Window { __n5: { ops: ReturnType<typeof useOperationsStore>; events: Array<{ event: string; payload: unknown }> } }
}
let backend: SyntheticBackend
let errors: string[]
test.beforeEach(async ({ context, page }) => {
  backend = new SyntheticBackend(); errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== ORIGIN) { backend.unexpected.push(request.url()); await route.abort(); return }
    if (request.method() === "GET" && ["/", "/fixture.js", "/favicon.ico"].includes(url.pathname)) { await route.continue(); return }
    try {
      const response = await backend.respond(request.url(), request.method(), request.postData())
      await route.fulfill({ status: response.status, json: response.body })
    } catch { await route.abort("failed") }
  })
})
test.afterEach(() => { backend.releaseWrite?.(); expect(backend.unexpected).toEqual([]); expect(errors).toEqual([]) })

async function state(page: Page) {
  return page.evaluate((doc) => ({
    sales: window.__n5.ops.sales,
    credit: window.__n5.ops.getSaldoCreditoCliente(doc),
    caixa: window.__n5.ops.caixa,
    events: window.__n5.events.filter((event) => event.event === "venda_finalizada"),
  }), CUSTOMER.document)
}
async function mount(page: Page, surface: Surface) {
  const storage: Record<string, string> = {}
  seedStorage({ setItem: (key, value) => { storage[key] = value } }, surface)
  await page.addInitScript((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value) }, storage)
  await page.goto(`/?surface=${surface}`)
  await expect.poll(async () => page.evaluate(() => window.__n5?.ops.caixa.isOpen)).toBe(true)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.press("Insert")
  const avulso = page.getByRole("dialog", { name: /Item Avulso/i })
  await avulso.getByPlaceholder("Ex.: Suporte de TV universal").fill("Linha sintética N5-C")
  await avulso.getByPlaceholder("0,00").first().fill("100")
  await avulso.getByRole("button", { name: /Adicionar ao carrinho/i }).click()
  await expect(avulso).toHaveCount(0)
  if (surface !== "venda-completa") {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    // Supermercado reserva F2 para dinheiro; cliente usa F10 no keymap oficial.
    await page.keyboard.press(surface === "supermercado" ? "F10" : "F2")
    const picker = page.getByRole("dialog", { name: /(Selecionar|Pesquisar) Cliente/i })
    await picker.getByPlaceholder("Nome, CPF/CNPJ ou telefone…").fill("Cliente")
    await picker.getByRole("button", { name: /Cliente sintético/ }).click()
    await expect(picker).toHaveCount(0)
  } else {
    // O draft vazio não restaura cliente; selecioná-lo pela busca real da superfície.
    const customerInput = page.getByPlaceholder("Nome, CPF ou telefone… [F2]")
    const searched = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/clientes/search")
    await customerInput.fill("Cliente")
    await searched
    // O autofoco pós-Item Avulso pode ter fechado o dropdown enquanto a busca carregava.
    await customerInput.focus()
    await page.getByRole("button", { name: /Cliente sintético/ }).click()
  }
}
async function open(page: Page, surface: Surface) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  // F12 is intentionally absent from Venda Completa's keymap.
  if (surface === "venda-completa") await page.getByRole("button", { name: /Finalizar Venda/i }).click()
  else await page.keyboard.press("F12")
  await expect(page.getByRole("dialog", { name: "Finalizar Pagamento" })).toBeVisible()
}
async function pix(page: Page, amount?: number) {
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  if (amount !== undefined) await modal.getByPlaceholder("100,00", { exact: true }).fill(String(amount * 100))
  await modal.getByRole("button", { name: /^PIX$/i }).click()
}
async function finish(page: Page) {
  await page.getByRole("dialog", { name: "Finalizar Pagamento" }).getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await expect.poll(() => backend.posts.length).toBeGreaterThan(0)
}
async function confirmed(page: Page) {
  await expect.poll(async () => (await state(page)).sales.filter((sale) => sale.syncPending === false).length).toBe(1)
  expect((await state(page)).events).toHaveLength(1)
  const sale = (await state(page)).sales[0]
  expect(sale.total).toBe(100)
  expect(sale.id).toBe("VDA-N5C-1")
  return sale
}
const audits = () => backend.audits.filter((entry) => entry.action === "sale_finalized")

for (const surface of SURFACES) test.describe(surface, () => {
  test("A split — múltiplos pagamentos conservam meios, soma e confirmação", async ({ page }) => {
    await mount(page, surface); await open(page, surface)
    await pix(page, 40)
    const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
    await modal.getByRole("button", { name: /^Dinheiro$/i }).click()
    // Venda Completa enters through the normal modal (cash has two steps).
    const cashConfirm = modal.getByRole("button", { name: /Confirmar (Dinheiro|valor exato)/i })
    if (await cashConfirm.count()) { await modal.getByPlaceholder("60,00", { exact: true }).fill("6000"); await cashConfirm.click() }
    await expect(modal.getByRole("button", { name: "Confirmar Pagamento", exact: true })).toBeEnabled()
    expect(audits()).toHaveLength(0)
    await finish(page)
    const sale = await confirmed(page)
    expect(sale.paymentBreakdown).toMatchObject({ pix: 40, dinheiro: 60 })
    expect(backend.posts[0].sale.paymentBreakdown).toEqual(sale.paymentBreakdown)
    expect(Object.values(sale.paymentBreakdown!).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(audits()).toHaveLength(1)
  })
  test("B vale/crédito — titular, saldo local e readback sintético", async ({ page }) => {
    await mount(page, surface); await open(page, surface)
    const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
    await modal.getByRole("button", { name: /^(Crédito \/ Vale|Créd\.\/Vale)$/i }).click()
    // A known customer's credit is already loaded. A click may apply it directly.
    const apply = modal.getByRole("button", { name: /Aplicar .* em crédito/ })
    if (await apply.count()) await apply.click()
    await finish(page)
    const sale = await confirmed(page)
    expect(sale.customerCpf).toBe(CUSTOMER.document)
    expect(sale.clienteId).toBe(CUSTOMER.id)
    expect(sale.paymentBreakdown?.creditoVale).toBe(100)
    expect((await state(page)).credit).toBe(50)
    expect(backend.credit).toBe(50)
    // Read the same synthetic route used by the UI; no claim of DB persistence.
    const readback = await page.evaluate(async ({ store, doc }) => fetch(`/api/ops/credito-cliente?lojaId=${store}&doc=${doc}`).then((r) => r.json()), { store: STORE, doc: CUSTOMER.document })
    expect(readback.creditos[CUSTOMER.document].saldo).toBe(50)
  })
  test("C À Prazo — cliente, entrada, três parcelas e títulos locais reais", async ({ page }) => {
    await mount(page, surface); await open(page, surface)
    const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
    await modal.getByRole("button", { name: /^À prazo$/i }).click()
    await modal.getByRole("combobox").first().click()
    await page.getByRole("option", { name: /^3x/ }).click()
    await modal.getByPlaceholder("0,00", { exact: true }).last().fill("2500")
    await modal.locator('input[type="date"]').fill("2026-12-10")
    await modal.getByRole("button", { name: /Confirmar À Prazo 3x/i }).click()
    await finish(page)
    const sale = await confirmed(page)
    expect(sale.paymentBreakdown).toMatchObject({ dinheiro: 25, aPrazo: 75 })
    expect(sale.aPrazoConfig).toMatchObject({ parcelas: 3, primeiroVencimento: "10/12/2026" })
    const titles = await page.evaluate((opsKey) => Object.entries(localStorage).filter(([key]) => key !== opsKey && key.includes("receber")).flatMap(([, value]) => { try { return JSON.parse(value) } catch { return [] } }), OPS_KEY) as Array<{ valor: number; vendas?: Array<{ saleId: string }> }>
    const own = titles.filter((title) => title.vendas?.some((venda) => venda.saleId === sale.id))
    expect(own).toHaveLength(3)
    expect(own.map((title) => title.valor)).toEqual([25, 25, 25])
  })
  test("D PENDING/retry — Reenviar conserva identidade e aplica confirmação uma vez", async ({ page }) => {
    backend.failWrites = true
    await mount(page, surface); await open(page, surface); await pix(page); await finish(page)
    await expect.poll(async () => (await state(page)).sales[0]?.syncPending).toBe(true)
    const pending = await state(page), identity = pending.sales[0].clientSaleId!
    expect(pending.events).toHaveLength(0); expect(audits()).toHaveLength(0)
    expect(pending.caixa.totalEntradas).toBe(0)
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    await page.keyboard.press("F1")
    await expect(page.getByRole("dialog", { name: "Finalizar Pagamento" })).toHaveCount(0)
    expect(backend.posts).toHaveLength(1)
    backend.failWrites = false
    // Synthetic driver only: dispatch to its real callback without depending on
    // the unrelated shell's stacking styles. The callback calls real retrySyncSale.
    await page.getByRole("button", { name: "Reenviar mesma venda" }).dispatchEvent("click")
    await confirmed(page)
    expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
    expect((await state(page)).sales).toHaveLength(1)
    await page.getByRole("button", { name: "Reenviar mesma venda" }).dispatchEvent("click")
    expect((await state(page)).events).toHaveLength(1)
    expect(backend.posts).toHaveLength(2)
    // This is a positive assertion: zero events after a confirmed retry is a gap.
    expect(audits()).toHaveLength(1)
  })
  test("E sale_finalized — zero antes de CONFIRMED e um log com os valores efetivos", async ({ page }) => {
    backend.pauseWrites = true
    await mount(page, surface); await open(page, surface); await pix(page)
    expect(audits()).toHaveLength(0)
    await finish(page)
    expect(audits()).toHaveLength(0)
    backend.releaseWrite!()
    const sale: SaleRecord = await confirmed(page)
    await expect.poll(() => audits().length).toBe(1)
    expect(audits()[0].detail).toContain(sale.id)
    expect(audits()[0].detail).toContain("100,00")
    expect(sale.paymentBreakdown?.pix).toBe(100)
  })
})
