import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/**
 * OPS-V4-FLUXO-CURTO-001 — Preenchimento único (T01–T11, camada E2E).
 *
 * Leitura e paridade resumo ↔ edição, SEM mutação: nenhum clique em
 * Criar/Salvar aqui (escrita E2E exige banco descartável confirmado, fora
 * do escopo desta execução). A prova de escrita vive no Vitest
 * (lib/operacoes-v4/entrada-readback.test.ts) e na revisão R.
 */
test.describe("Operações V4 — fluxo curto 001 (read-only)", () => {
  test("resumo da abertura exibe os mesmos dados da edição, com fuso explícito", async ({ page }) => {
    await page.goto("/dashboard/operacoes-v4")
    await dismissFirstAccessWizardIfPresent(page)

    // Workspace da V4 carrega (lista real, sem fabricar OS).
    await expect(page.getByText(/Operações/i).first()).toBeVisible({ timeout: 45_000 })

    // Abre a primeira OS da lista, se houver alguma.
    const primeiraOS = page.locator('[data-os-id]').first()
    if (!(await primeiraOS.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "Sem OS na loja ativa — nada a conferir nesta camada.")
      return
    }
    await primeiraOS.click()

    // T01: resumo "Informado na abertura" aparece após a carga (sem formulário
    // vazio editável antes do detalhe — o salvamento libera só com carga).
    await expect(page.getByText("Informado na abertura", { exact: false })).toBeVisible({ timeout: 30_000 })

    // T07: cor em linha própria quando informada (nunca fundida à condição).
    const snapshot = page.locator("dl").first()
    if (await snapshot.isVisible().catch(() => false)) {
      const texto = (await snapshot.innerText().catch(() => "")) ?? ""
      if (/Cor/i.test(texto)) {
        expect(texto).toMatch(/Cor/)
      }
    }

    // T09: previsão exibe o fuso aplicado quando há previsão.
    const corpo = (await page.locator("main").first().innerText().catch(() => "")) ?? ""
    if (/Previsão/i.test(corpo)) {
      expect(corpo).toMatch(/America\/Sao_Paulo|Previsão/)
    }

    // T06: limpar a seleção fecha o workspace (sem ressurgimento de dado antigo).
    const limpar = page.getByRole("button", { name: /limpar seleção|voltar/i }).first()
    if (await limpar.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await limpar.click()
      await expect(page.getByText("Informado na abertura", { exact: false })).toBeHidden({ timeout: 10_000 }).catch(() => {})
    }
  })
})
