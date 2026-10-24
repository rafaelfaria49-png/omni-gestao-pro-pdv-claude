import { expect, test } from "@playwright/test"
import { USERS, closeDb, evidence, field, login, noHorizontalOverflow, openNewProduct, productModal, readDb, STORES, switchStore } from "./support"

test.afterAll(closeDb)

for (const width of [1440, 390, 320]) {
  test(`Viewport ${width}px: editor de ramo e ficha de produto sem overflow, sem gravar`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", locale: "pt-BR" })
    const page = await context.newPage()
    const before = await (await readDb()).produto.count({ where: { storeId: STORES.padaria } })
    await login(page, USERS.admin)
    await switchStore(page, "Padaria Sintética A")
    await page.goto("/dashboard/configuracoes?sec=geral")
    const card = page.locator("#ramo-recursos")
    await expect(card.getByRole("combobox", { name: "Ramo principal" })).toHaveValue("padaria")
    await card.scrollIntoViewIfNeeded()
    await noHorizontalOverflow(page)
    await page.screenshot({ path: evidence(`configuracoes-${width}.png`), fullPage: true })
    await page.goto("/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Produtos", exact: true }).click()
    const modal = await openNewProduct(page)
    await expect(field(modal, "Nome")).toHaveAttribute("placeholder", "Ex.: Pão francês")
    await expect(modal.getByLabel("Nome", { exact: true })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(modal.getByLabel("Categoria", { exact: true })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(modal.getByLabel("Código de barras", { exact: true })).toBeVisible()
    await expect(modal.getByLabel("Preço venda (R$ / UN)", { exact: true })).toBeVisible()
    await expect(modal.getByText("Garantia (dias)")).toBeHidden()
    await modal.getByRole("combobox", { name: "Forma de venda" }).scrollIntoViewIfNeeded()
    await noHorizontalOverflow(page)
    expect(await modal.locator('[data-omni-ui-kit="modal-body"]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: evidence(`produto-${width}.png`), fullPage: true })
    await modal.getByRole("button", { name: "Cancelar" }).click()
    await expect(productModal(page)).toHaveCount(0)
    expect(await (await readDb()).produto.count({ where: { storeId: STORES.padaria } })).toBe(before)
    await context.close()
  })
}
