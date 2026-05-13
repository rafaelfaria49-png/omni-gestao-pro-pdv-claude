import { test, expect } from "@playwright/test"

test.describe("Operações HUB", () => {
  test("hub inicial e Kanban de OS", async ({ page }) => {
    await page.goto("/dashboard/operacoes-v2")

    await expect(page.getByText("Nova Ordem de Serviço", { exact: false })).toBeVisible({
      timeout: 45_000,
    })

    await page.getByRole("button", { name: /Ordens em andamento/i }).click()

    await expect(page.getByRole("heading", { name: "Ordens de Serviço" })).toBeVisible()

    const linkOs = page.locator('a[href*="operacoes/os"]').first()
    if (await linkOs.isVisible().catch(() => false)) {
      await linkOs.click()
      await expect(page.getByText("Voltar ao Kanban", { exact: false })).toBeVisible({ timeout: 25_000 })
    } else {
      await expect(
        page.getByText(/Nenhuma ordem de serviço cadastrada|Aberto|Diagnóstico/i).first(),
      ).toBeVisible()
    }
  })
})
