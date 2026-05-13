import { test, expect } from "@playwright/test"

test.describe("WhatsApp inbox", () => {
  test("carrega inbox e busca; troca de loja se o seletor existir", async ({ page }) => {
    await page.goto("/dashboard/whatsapp")

    await expect(page.getByRole("heading", { name: /^WhatsApp$/ })).toBeVisible({ timeout: 45_000 })

    const loading = page.getByText("Carregando conversas da loja ativa", { exact: false })
    await loading.waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {})

    await expect(
      page.getByPlaceholder("Buscar contato ou mensagem…"),
    ).toBeVisible({ timeout: 15_000 })

    const storeTrigger = page.getByRole("combobox").first()
    if (await storeTrigger.isVisible().catch(() => false)) {
      await storeTrigger.click()
      const opt = page.getByRole("option").nth(1)
      if (await opt.isVisible().catch(() => false)) {
        await opt.click()
        await page.waitForTimeout(500)
      } else {
        await page.keyboard.press("Escape")
      }
    }
  })
})
