import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.describe("Permissões — aviso de acesso (querystring)", () => {
  test("exibe alerta enterprise quando access=denied", async ({ page }) => {
    await page.goto("/dashboard?access=denied")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByText("Acesso não autorizado", { exact: false })).toBeVisible({ timeout: 25_000 })
    await expect(
      page.getByText(/não possui permissão para acessar a área solicitada/i),
    ).toBeVisible()

    await expect(page.getByRole("button", { name: /Fechar aviso|Limpar URL|Painel inicial/i }).first()).toBeVisible()
  })

  test("exibe aviso quando storeAccess=denied", async ({ page }) => {
    await page.goto("/dashboard?storeAccess=denied")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByText("Unidade não disponível", { exact: false })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/loja selecionada não está autorizada/i)).toBeVisible()
  })
})
