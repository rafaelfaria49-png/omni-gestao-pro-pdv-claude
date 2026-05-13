import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("Operações HUB", () => {
  test("hub inicial e Kanban de OS", async ({ page }) => {
    await page.goto("/dashboard/operacoes-v2")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByText("Nova Ordem de Serviço", { exact: false })).toBeVisible({
      timeout: 45_000,
    })

    await page.getByRole("button", { name: /Abrir Kanban/i }).first().click()
    await page.waitForURL(/\/operacoes\/os/, { timeout: 35_000 }).catch(() => {})

    await expect(page.getByRole("heading", { name: /Ordens de Serviço/i })).toBeVisible({ timeout: 45_000 })

    const detailLink = page.locator('a[href^="/operacoes/os/"]').filter({ hasText: /OS-/i }).first()
    if (await detailLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await detailLink.click()
      await expect(page.getByText("Voltar ao Kanban", { exact: false })).toBeVisible({ timeout: 25_000 })
    } else {
      await expect(
        page.getByText(/Nenhuma ordem de serviço cadastrada|Aberto|Diagnóstico/i).first(),
      ).toBeVisible()
    }
  })
})
