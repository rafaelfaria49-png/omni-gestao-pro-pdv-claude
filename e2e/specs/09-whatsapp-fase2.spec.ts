import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("WhatsApp — Fase 2 (inbox, loja, respostas e etiquetas)", () => {
  test("inbox carregada; loja, respostas rápidas e etiquetas quando existirem", async ({ page }) => {
    await page.goto("/dashboard/whatsapp")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByRole("heading", { name: /^WhatsApp$/ })).toBeVisible({ timeout: 45_000 })

    const loading = page.getByText("Carregando conversas da loja ativa", { exact: false })
    await loading.waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {})

    await expect(
      page.getByPlaceholder("Buscar contato ou mensagem…"),
    ).toBeVisible({ timeout: 20_000 })

    const storeTrigger = page.getByRole("combobox").first()
    if (await storeTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await storeTrigger.click()
      const opt = page.getByRole("option").nth(1)
      if (await opt.isVisible().catch(() => false)) {
        await opt.click({ force: true }).catch(async () => {
          await page.keyboard.press("Escape")
        })
        await page.waitForTimeout(400)
      } else {
        await page.keyboard.press("Escape")
      }
    }

    const qrBtn = page.getByRole("button", { name: /Respostas rápidas/i })
    if (await qrBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(qrBtn).toBeVisible()
    }

    const etiquetasBtn = page.getByRole("button", { name: /^Etiquetas$/i })
    if (await etiquetasBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(etiquetasBtn).toBeVisible()
    }
  })
})
