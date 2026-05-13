import { test, expect } from "@playwright/test"

test.describe("PDV / Vendas", () => {
  test("abre vendas, área de caixa e fluxo leve de pagamento (modal)", async ({ page }) => {
    await page.goto("/dashboard/vendas")

    await expect(page.getByPlaceholder(/Buscar produto|Digite produto|código/i)).toBeVisible({
      timeout: 45_000,
    })

    const caixaFechado = page.getByText("Caixa Fechado", { exact: false })
    const caixaAberto = page.getByText(/Caixa aberto|Operações de Caixa/i)

    if (await caixaFechado.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /Abrir Caixa/i }).click()
      await expect(page.getByRole("heading", { name: /Abertura de Caixa/i })).toBeVisible()
      await page.getByRole("button", { name: /^Cancelar$/i }).click()
      await expect(page.getByRole("heading", { name: /Abertura de Caixa/i })).toBeHidden()
    } else {
      await expect(caixaAberto.first()).toBeVisible({ timeout: 15_000 })
    }

    const sku = process.env.PLAYWRIGHT_PDV_SKU?.trim()
    const busca = page.getByPlaceholder(/Buscar produto|Digite produto|código/i)
    if (sku) {
      await busca.fill(sku)
      await busca.press("Enter")
      await page.waitForTimeout(800)
    }

    await page.getByRole("button", { name: /PIX/i }).first().click()
    await expect(page.getByRole("heading", { name: /Finalizar Pagamento/i })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: /Finalizar Pagamento/i })).toBeHidden()
  })
})
