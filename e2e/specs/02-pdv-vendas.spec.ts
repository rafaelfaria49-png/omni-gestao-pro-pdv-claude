import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent, ensureCaixaAberto } from "../helpers"

test.describe("PDV / Vendas", () => {
  test("abre vendas, área de caixa e fluxo leve de pagamento (modal)", async ({ page }) => {
    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(
      page.getByPlaceholder(/Código \/ Bipe|Buscar produto|Digite produto|código/i),
    ).toBeVisible({ timeout: 45_000 })

    await ensureCaixaAberto(page)

    const sku = process.env.PLAYWRIGHT_PDV_SKU?.trim()
    const busca = page.getByPlaceholder(/Código \/ Bipe|Buscar produto|Digite produto|código/i)
    if (sku) {
      await busca.fill(sku)
      await busca.press("Enter")
      await page.waitForTimeout(800)
    }

    const pix = page.getByRole("button", { name: /PIX/i }).first()
    if (await pix.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await pix.click()
      await expect(page.getByRole("heading", { name: /Finalizar Pagamento/i })).toBeVisible({ timeout: 15_000 })
      await page.keyboard.press("Escape")
      await expect(page.getByRole("heading", { name: /Finalizar Pagamento/i })).toBeHidden({ timeout: 10_000 })
    } else {
      await expect(page.getByRole("button", { name: /Finalizar/i }).first()).toBeVisible()
    }
  })
})
