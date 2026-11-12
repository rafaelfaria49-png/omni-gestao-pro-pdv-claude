import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

/** Fecha o wizard de primeira loja se estiver aberto (sessionStorage por loja — não vai no storageState do Playwright). */
export async function dismissFirstAccessWizardIfPresent(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const dlg = page.getByRole("dialog", { name: /Boas-vindas/i })
    const visible = await dlg.isVisible().catch(() => false)
    if (!visible) return
    const btn = dlg.getByRole("button", { name: /^Voltar depois$/i })
    await btn.click({ force: true, timeout: 5_000 }).catch(() => {})
    const still = await dlg.isVisible().catch(() => false)
    if (!still) return
    await page.waitForTimeout(350)
  }
}

/**
 * O PDV pede, por computador, o terminal em que vai operar (`TerminalSelector`). Contexto
 * novo do Playwright = computador novo: escolhe o primeiro terminal livre pelo fluxo real
 * ("Usar" → lock no servidor). Não pula a proteção ("Continuar sem terminal").
 */
export async function selecionarTerminalSeSolicitado(page: Page): Promise<void> {
  const titulo = page.getByText("Selecionar Terminal", { exact: true })
  const busca = page.getByPlaceholder(/Código \/ Bipe|Buscar produto|Digite produto|código/i)
  await expect(titulo.or(busca).first()).toBeVisible({ timeout: 45_000 })
  if (!(await titulo.isVisible().catch(() => false))) return
  await page.getByRole("button", { name: "Usar", exact: true }).first().click()
  await expect(titulo).toHaveCount(0, { timeout: 20_000 })
}

/** Abre o caixa com saldo 0 e fecha o comprovante quando aparecer (PDV exige caixa aberto para várias ações). */
export async function ensureCaixaAberto(page: Page): Promise<void> {
  const fechado = page.getByText("Caixa Fechado", { exact: false })
  if (!(await fechado.isVisible().catch(() => false))) return

  await page.getByRole("button", { name: /Abrir Caixa/i }).first().click({ force: true })
  const dlg = page.getByRole("dialog", { name: /Abertura de Caixa/i })
  await expect(dlg).toBeVisible({ timeout: 15_000 })
  await dlg.getByRole("button", { name: /^Abrir Caixa$/i }).click()
  const fecharComprovante = page.getByRole("dialog").getByRole("button", { name: /^Fechar$/i })
  if (await fecharComprovante.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await fecharComprovante.click()
  }
  await expect(page.getByText("Caixa Aberto", { exact: false }).first()).toBeVisible({ timeout: 20_000 })
}
