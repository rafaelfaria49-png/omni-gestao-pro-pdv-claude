import type { Page } from "@playwright/test"

/** Fecha o wizard de primeira loja se estiver aberto (sessionStorage por loja — não vai no storageState do Playwright). */
export async function dismissFirstAccessWizardIfPresent(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: /^Voltar depois$/i })
  await btn.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {})
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.getByRole("dialog", { name: /Boas-vindas/i }).waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {})
  }
}
