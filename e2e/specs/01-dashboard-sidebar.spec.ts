import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("Dashboard + Sidebar", () => {
  test("carrega painel e mostra shell com sidebar", async ({ page }) => {
    await page.goto("/dashboard")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByText("Visão geral enterprise", { exact: false })).toBeVisible()
    await expect(page.getByText("OmniGestão Pro", { exact: false }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Painel Inicial/i })).toBeVisible()
  })
})
