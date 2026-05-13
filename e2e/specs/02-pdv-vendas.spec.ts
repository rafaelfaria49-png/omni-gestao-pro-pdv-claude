import type { Page } from "@playwright/test"
import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/** Abre o caixa com saldo 0 e fecha o comprovante (PDV exige caixa aberto para pagamento). */
async function ensureCaixaAberto(page: Page) {
  const fechado = page.getByText("Caixa Fechado", { exact: false })
  if (!(await fechado.isVisible().catch(() => false))) return

  await page.getByRole("button", { name: /Abrir Caixa/i }).first().click()
  const dlg = page.getByRole("dialog", { name: /Abertura de Caixa/i })
  await expect(dlg).toBeVisible({ timeout: 15_000 })
  await dlg.getByRole("button", { name: /^Abrir Caixa$/i }).click()
  const fecharComprovante = page.getByRole("dialog").getByRole("button", { name: /^Fechar$/i })
  if (await fecharComprovante.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await fecharComprovante.click()
  }
  await expect(page.getByText("Caixa Aberto", { exact: false }).first()).toBeVisible({ timeout: 20_000 })
}

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
