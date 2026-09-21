import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/**
 * OPS-V4-FLUXO-CURTO-001 — Preenchimento único (T01–T11, camada E2E).
 *
 * Fluxo determinístico com massa sintética única por execução (sufixo de
 * timestamp): criar → reabrir → editar → salvar → reabrir, comparando valores
 * concretos entre resumo e formulário. Sem skip como aprovação, sem
 * catch que absorva falha, sem OR que dispense o fuso.
 *
 * REQUISITOS DE AMBIENTE (bloqueiam a execução, nunca aprovam):
 * - app isolada em PLAYWRIGHT_BASE_URL (banco descartável confirmado);
 * - sessão E2E válida (storage state em e2e/.auth/storage.json);
 * - loja ativa com permissão de criar OS.
 * Sem isso o spec FALHA explicitamente — ausência de fixture/ambiente é
 * impedimento, não caso aprovado.
 */
test.describe("Operações V4 — fluxo curto 001 (E2E determinístico)", () => {
  test("criar, reabrir, editar cor e reler os mesmos dados", async ({ page }) => {
    const sufixo = Date.now().toString(36)
    const clienteNome = `E2E FluxoCurto ${sufixo}`
    const modelo = `E2E-Modelo ${sufixo}`
    const imei = `E2E${sufixo}999`.slice(0, 15)
    const corCriacao = "Violeta"
    const corEdicao = "Preto"
    const defeito = `Tela trincada E2E ${sufixo}`
    const atendente = `Atendente E2E ${sufixo}`

    await page.goto("/dashboard/operacoes-v4")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByText(/Operações/i).first()).toBeVisible({ timeout: 45_000 })

    // Abre o modal Nova OS (rota e sessão precisam existir — sem fallback).
    await page.getByRole("button", { name: /Nova Ordem de Serviço/i }).click()
    await expect(page.getByText("Tipo de entrada", { exact: false })).toBeVisible({ timeout: 15_000 })

    // Cliente novo sintético (único por execução — sem colisão entre runs).
    await page.getByPlaceholder(/nome do cliente/i).fill(clienteNome)
    await page.getByPlaceholder(/marca/i).fill("MarcaE2E")
    await page.getByPlaceholder(/modelo/i).fill(modelo)
    await page.getByPlaceholder(/imei/i).fill(imei)
    await page.getByPlaceholder(/cor/i).fill(corCriacao)
    await page.getByPlaceholder(/defeito/i).fill(defeito)
    await page.getByPlaceholder(/nome do atendente/i).fill(atendente)

    // T09: previsão futura com fuso explícito exibido no modal.
    await page.locator('input[type="datetime-local"]').fill("2030-07-01T17:00")
    await expect(page.getByText("America/Sao_Paulo", { exact: false })).toBeVisible({ timeout: 10_000 })

    await page.getByRole("button", { name: /Criar Ordem de Serviço/i }).click()

    // T01: ao criar e abrir imediatamente, resumo e formulário exibem o mesmo dado.
    await expect(page.getByText("Informado na abertura", { exact: false })).toBeVisible({ timeout: 30_000 })
    const resumo = page.locator("dl").first()
    await expect(resumo.getByText(modelo, { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(resumo.getByText(defeito, { exact: false })).toBeVisible()
    await expect(resumo.getByText(atendente, { exact: false })).toBeVisible()
    await expect(resumo.getByText(corCriacao, { exact: false })).toBeVisible()
    // T09: o MESMO instante da criação, com fuso explícito.
    await expect(resumo.getByText("01/07/2030 17:00 (America/Sao_Paulo)", { exact: true })).toBeVisible()

    // T02/T07: editar SOMENTE a cor não apaga os demais campos.
    await page.getByLabel(/^Cor$/).fill(corEdicao)
    await page.getByRole("button", { name: /^Salvar$/ }).click()
    await expect(page.getByText(/Alterações não salvas/i)).toBeHidden({ timeout: 20_000 })

    // Reabrir (recarregar a página = nova leitura do servidor) e comparar tudo.
    await page.reload()
    await expect(page.getByText("Informado na abertura", { exact: false })).toBeVisible({ timeout: 30_000 })
    const resumo2 = page.locator("dl").first()
    await expect(resumo2.getByText(modelo, { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(resumo2.getByText(defeito, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(atendente, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(corEdicao, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(imei, { exact: false })).toBeVisible()
    await expect(resumo2.getByText("01/07/2030 17:00 (America/Sao_Paulo)", { exact: true })).toBeVisible()
  })
})
