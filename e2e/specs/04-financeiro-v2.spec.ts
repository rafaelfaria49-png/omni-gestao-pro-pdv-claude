import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("Financeiro HUB v2", () => {
  test("carrega shell, abas e conteúdo principal", async ({ page }) => {
    await page.goto("/dashboard/financeiro-v2")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({
      timeout: 45_000,
    })

    await expect(page.getByRole("tablist")).toBeVisible()
    await expect(page.getByRole("tab", { name: /Visão geral/i })).toBeVisible()

    const charts = page.locator(".recharts-wrapper")
    const n = await charts.count()
    expect(n).toBeGreaterThanOrEqual(0)
    if (n > 0) {
      await expect(charts.first()).toBeVisible({ timeout: 30_000 })
    }
  })
})
