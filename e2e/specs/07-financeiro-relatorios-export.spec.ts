import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

test.use({ viewport: { width: 1440, height: 900 } })

test.describe("Financeiro — Fase 2 (central relatórios + export)", () => {
  test("abre central Relatórios e, no HUB, tab Relatórios com botões de exportação", async ({ page }) => {
    await page.goto("/dashboard/relatorios")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByRole("heading", { name: /^Relatórios$/ })).toBeVisible({ timeout: 30_000 })
    // No 1º render com o servidor frio, o streaming do React deixa uma 2ª cópia OCULTA do
    // parágrafo (fora da árvore de acessibilidade) até a troca do fallback; `getByText` a
    // inclui e o modo estrito recusava o seletor — reproduzido na main f97e9de. `getByRole`
    // só enxerga o que o usuário vê; a asserção (texto visível na central) é a mesma.
    await expect(page.getByRole("paragraph").filter({ hasText: /Central de inteligência/i })).toBeVisible()

    await page.goto("/dashboard/financeiro-v2")
    await dismissFirstAccessWizardIfPresent(page)

    await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({ timeout: 45_000 })

    await page.getByRole("tab", { name: /Relatórios/i }).click()

    await expect(page.getByText("Exportar Relatórios", { exact: false })).toBeVisible({ timeout: 35_000 })

    await expect(page.getByRole("button", { name: /Exportar movimentacoes em CSV/i }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Exportar receber em CSV/i }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Exportar pagar em CSV/i }).first()).toBeVisible()

    await page.getByRole("tab", { name: /A receber/i }).click()
    await expect(page.getByRole("tab", { name: /A receber/i })).toHaveAttribute("data-state", "active", { timeout: 10_000 })

    await page.getByRole("tab", { name: /Visão geral/i }).click()
    await expect(page.getByRole("tab", { name: /Visão geral/i })).toHaveAttribute("data-state", "active", { timeout: 10_000 })
  })
})
