import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("Operações — Fase 2 (Kanban, detalhe, timeline e ações)", () => {
  test("Kanban, OS com link e painel de detalhe", async ({ page }) => {
    await page.goto("/dashboard/operacoes-v2")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByText("Nova Ordem de Serviço", { exact: false })).toBeVisible({ timeout: 45_000 })

    await page.getByRole("button", { name: /Abrir Kanban/i }).first().click()
    await page.waitForURL(/\/operacoes\/os/, { timeout: 35_000 }).catch(() => {})

    await expect(page.getByRole("heading", { name: /Ordens de Serviço/i })).toBeVisible({ timeout: 45_000 })

    const detailLink = page.locator('a[href^="/operacoes/os/"]').filter({ hasText: /OS-/i }).first()
    if (await detailLink.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await detailLink.click()
      await expect(page.getByText("Voltar ao Kanban", { exact: false })).toBeVisible({ timeout: 25_000 })

      await expect(page.getByText("Histórico auditável", { exact: false })).toBeVisible({ timeout: 20_000 })
      await expect(page.locator("ol").filter({ has: page.locator("li") }).first()).toBeVisible()

      await expect(page.getByText("Status operacional", { exact: false })).toBeVisible()
      await expect(
        page.getByRole("button", { name: /Iniciar diagnóstico|Enviar orçamento|Cancelar OS/ }).first(),
      ).toBeVisible()
    } else {
      await expect(page.getByText(/Pipeline operacional|Aberto/i).first()).toBeVisible()
    }
  })
})
