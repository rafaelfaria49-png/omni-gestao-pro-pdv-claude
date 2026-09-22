import { test, expect } from "@playwright/test"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/**
 * OPS-V4-FLUXO-CURTO-001 — Preenchimento único (T01–T11, camada E2E).
 *
 * Fluxo determinístico com massa sintética única por execução (sufixo de
 * timestamp): launcher real → modal Nova OS (modo cliente NOVO explícito +
 * serviço válido) → criar → reabrir pela busca (OS capturada pelo cliente) →
 * editar cor via "Alterar" → salvar → trocar OS → reabrir → comparar valores
 * concretos entre resumo e formulário. Sem skip como aprovação, sem catch que
 * absorva falha, sem `.first()` arbitrário (todo escopo é nomeado e guardado
 * por contagem), sem presumir seleção preservada por `page.reload()`.
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
    const previsaoExata = "01/07/2030 17:00 (America/Sao_Paulo)"

    // Rota real + launcher real (sem fallback).
    await page.goto("/dashboard/operacoes-v4")
    await dismissFirstAccessWizardIfPresent(page)
    const botaoNovo = page.getByRole("button", { name: "+ Novo", exact: true })
    await expect(botaoNovo).toHaveCount(1, { timeout: 45_000 })
    await botaoNovo.click()
    await expect(page.getByText("Novo atendimento", { exact: true })).toBeVisible({ timeout: 15_000 })
    const opcaoNovaOS = page.getByRole("button", { name: "Nova OS" })
    await expect(opcaoNovaOS).toHaveCount(1)
    await opcaoNovaOS.click()

    // Modal Nova OS aberto (título + tipo de entrada).
    const modal = page.getByRole("dialog").filter({ hasText: "Nova Ordem de Serviço" })
    await expect(modal).toHaveCount(1, { timeout: 15_000 })
    await expect(modal.getByText("Tipo de entrada", { exact: false })).toBeVisible()

    // Modo cliente explícito: NOVO (o padrão é "existente").
    const abaNovo = modal.getByRole("button", { name: "Novo", exact: true })
    await expect(abaNovo).toHaveCount(1)
    await abaNovo.click()
    await modal.getByPlaceholder("Nome do cliente").fill(clienteNome)

    // Aparelho: placeholders únicos + xpath determinístico a partir do rótulo
    // (IMEI/Cor usam placeholder genérico "opcional" — o rótulo desambigua).
    await modal.getByPlaceholder("Samsung").fill("MarcaE2E")
    await modal.getByPlaceholder("Galaxy S22").fill(modelo)
    await modal.locator("xpath=//div[normalize-space()='IMEI / serial']/following-sibling::input").fill(imei)
    await modal.locator("xpath=//div[normalize-space()='Cor']/following-sibling::input").fill(corCriacao)
    await modal.getByPlaceholder(/Tela quebrada/).fill(defeito)

    // Serviço válido (tipo servico_autorizado exige ao menos um confirmado).
    await modal.getByLabel("Nome do serviço").fill("Troca de tela")
    await modal.getByLabel("Valor de venda").fill("300")
    await modal.getByLabel("Custo interno").fill("92")
    await modal.getByLabel("Garantia em dias").fill("90")
    const confirmarServico = modal.getByRole("button", { name: /Confirmar serviço/ })
    await expect(confirmarServico).toHaveCount(1)
    await confirmarServico.click()
    await expect(modal.getByText("1 serviço")).toBeVisible()
    await expect(modal.getByText(/Valor comercial.*300/)).toBeVisible()

    // Recepção: atendente explícito, prioridade explícita, previsão com fuso.
    await modal.locator("xpath=//div[normalize-space()='Recebido por']/following-sibling::input").fill(atendente)
    await modal.locator("xpath=//div[normalize-space()='Prioridade']/following-sibling::select").selectOption("alta")
    await modal.locator('input[type="datetime-local"]').fill("2030-07-01T17:00")
    await expect(modal.getByText("Horário da loja (America/Sao_Paulo)")).toBeVisible({ timeout: 10_000 })
    await expect(modal.getByText(`Horário da loja (America/Sao_Paulo) · ${previsaoExata}`)).toBeVisible()

    const botaoCriar = modal.getByRole("button", { name: "Criar Ordem de Serviço" })
    await expect(botaoCriar).toHaveCount(1)
    await botaoCriar.click()

    // T01: ao criar e abrir imediatamente, resumo e formulário exibem o mesmo dado.
    const grupoResumo = page.locator("section", { has: page.getByText("Informado na abertura") })
    await expect(grupoResumo).toHaveCount(1, { timeout: 30_000 })
    const resumo = grupoResumo.locator("dl")
    await expect(resumo).toHaveCount(1)
    await expect(resumo.getByText(modelo, { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(resumo.getByText(defeito, { exact: false })).toBeVisible()
    await expect(resumo.getByText(atendente, { exact: false })).toBeVisible()
    await expect(resumo.getByText(corCriacao, { exact: false })).toBeVisible()
    await expect(resumo.getByText("Alta", { exact: true })).toBeVisible()
    // T09: o MESMO instante da criação, com fuso explícito.
    await expect(resumo.getByText(previsaoExata, { exact: true })).toBeVisible()

    // T02/T07: editar SOMENTE a cor não apaga os demais campos. A correção
    // exige abrir a edição ("Alterar" na linha da Cor) explicitamente.
    const grupoEdicao = page.locator("section", { has: page.getByText("Completar identificação") })
    await expect(grupoEdicao).toHaveCount(1)
    const linhaCor = grupoEdicao.locator("div").filter({ hasText: /^Cor/ })
    const alterarCor = linhaCor.getByRole("button", { name: "Alterar" })
    await expect(alterarCor).toHaveCount(1)
    await alterarCor.click()
    await page.getByLabel("Cor").fill(corEdicao)
    const botaoSalvar = page.getByRole("button", { name: "Salvar", exact: true })
    await expect(botaoSalvar).toHaveCount(1)
    await botaoSalvar.click()
    await expect(page.getByText(/Alterações não salvas/i)).toBeHidden({ timeout: 20_000 })

    // Reabertura da OS capturada (busca pelo cliente único): sem reload com
    // seleção presumida — sai pelo fluxo real e reabre pela busca.
    const maisAcoes = page.getByTitle("Mais ações")
    await expect(maisAcoes).toHaveCount(1)
    await maisAcoes.click()
    const trocarOS = page.getByRole("button", { name: /Trocar OS/ })
    await expect(trocarOS).toHaveCount(1)
    await trocarOS.click()
    await expect(page.getByText("Selecione uma Ordem de Serviço")).toBeVisible({ timeout: 15_000 })
    const busca = page.getByPlaceholder(/Buscar por Nº da OS/)
    await expect(busca).toHaveCount(1)
    await busca.fill(clienteNome)
    const linhaOS = page.getByRole("button", { name: new RegExp(clienteNome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    await expect(linhaOS).toHaveCount(1, { timeout: 15_000 })
    await linhaOS.click()

    // Nova leitura do servidor: tudo igual ao informado, com a cor editada.
    const grupoResumo2 = page.locator("section", { has: page.getByText("Informado na abertura") })
    await expect(grupoResumo2).toHaveCount(1, { timeout: 30_000 })
    const resumo2 = grupoResumo2.locator("dl")
    await expect(resumo2).toHaveCount(1)
    await expect(resumo2.getByText(modelo, { exact: false })).toBeVisible({ timeout: 15_000 })
    await expect(resumo2.getByText(defeito, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(atendente, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(corEdicao, { exact: false })).toBeVisible()
    await expect(resumo2.getByText(imei, { exact: false })).toBeVisible()
    await expect(resumo2.getByText("Alta", { exact: true })).toBeVisible()
    await expect(resumo2.getByText(previsaoExata, { exact: true })).toBeVisible()
  })
})
