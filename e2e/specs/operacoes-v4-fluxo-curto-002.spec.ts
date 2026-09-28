import { expect, test } from "@playwright/test";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

/** Fluxo real: abertura → card → termo → edição → releitura → termo. */
test("OPS-V4-FLUXO-CURTO-002 — garantia e identidade documental coerentes", async ({ page }) => {
  test.setTimeout(240_000);
  const sufixo = Date.now().toString(36);
  const cliente = `E2E Garantia 002 ${sufixo}`;
  const aparelho = `Galaxy E2E ${sufixo}`;
  const loja = "Loja E2E Garantia 002";

  await page.goto("/dashboard/operacoes-v4-preview");
  await dismissFirstAccessWizardIfPresent(page);
  const launcher = page.getByRole("main").getByTitle(/Novo atendimento/);
  await expect(launcher).toHaveCount(1);
  await launcher.click();
  const novaOS = page.getByRole("button", { name: "Nova OS" });
  await expect(novaOS).toHaveCount(1);
  await novaOS.press("Enter");

  const modal = page.getByRole("dialog").filter({ hasText: "Nova Ordem de Serviço" });
  await expect(modal).toHaveCount(1);
  await modal.getByRole("button", { name: "Novo", exact: true }).click();
  await modal.getByPlaceholder("Nome do cliente").fill(cliente);
  await modal.getByPlaceholder("Samsung").fill("Samsung");
  await modal.getByPlaceholder("Galaxy S22").fill(aparelho);
  await modal.getByPlaceholder(/Tela quebrada/).fill("Tela trincada");
  await modal.getByLabel("Nome do serviço").fill("Troca de tela");
  await modal.getByLabel("Valor de venda").fill("300");
  await modal.getByLabel("Custo interno").fill("92");
  await modal.getByLabel("Garantia em dias").fill("90");
  await modal.getByRole("button", { name: /Confirmar serviço/ }).click();
  await expect(modal.getByText("1 serviço")).toBeVisible();
  await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
  await expect(modal).toBeHidden({ timeout: 45_000 });

  const seletor = page.getByRole("heading", { name: "Selecione uma Ordem de Serviço", exact: true });
  const pipeline = page.getByRole("navigation", { name: "Pipeline operacional da OS" });
  await expect.poll(async () => {
    if (await pipeline.isVisible()) return "aberta";
    if (await seletor.isVisible()) return "seletor";
    return "aguardando";
  }, { timeout: 60_000 }).not.toBe("aguardando");
  if (await seletor.isVisible()) {
    await page.getByPlaceholder(/Buscar por Nº da OS/).fill(cliente);
    const linha = page.getByRole("button").filter({ hasText: cliente });
    await expect(linha).toHaveCount(1);
    await linha.click();
  }

  await expect(pipeline).toBeVisible();
  const etapaEntrega = pipeline.getByRole("button", { name: /Entrega/ });
  await expect(etapaEntrega).toHaveCount(1);
  await etapaEntrega.click();
  const card = page.getByText("🛡 Garantia da OS", { exact: true }).locator("../..");
  await expect(card).toHaveCount(1);
  await expect(card.getByText("90 dias", { exact: true })).toBeVisible();
  await expect(card.getByText("Sem cobertura", { exact: true })).toHaveCount(0);

  const botaoTermo = page.getByRole("button", { name: "Imprimir Termo de Garantia" });
  await expect(botaoTermo).toBeEnabled();
  await botaoTermo.click();
  let doc = page.locator("#og-print-root");
  await expect(doc).toHaveCount(1);
  await expect(doc).toContainText(cliente);
  await expect(doc).toContainText(aparelho);
  await expect(doc).toContainText("Troca de tela");
  await expect(doc).toContainText("90 dias a partir da entrega");
  await expect(doc).toContainText(loja);
  await expect(doc).not.toContainText("Assistência Técnica");
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(doc).toHaveCount(0);

  const editor = card.getByLabel("Modelo de garantia");
  await expect(editor).toHaveValue("tela");
  await editor.selectOption("sem_garantia");
  const prazo = card.getByRole("spinbutton");
  await expect(prazo).toHaveValue("0");
  await expect(prazo).toBeDisabled();
  await card.getByRole("button", { name: "Salvar garantia" }).click();
  await expect(card.getByText("0 dias", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("Sem cobertura", { exact: true })).toHaveCount(2);

  await page.getByTitle("Mais ações").click();
  await page.getByRole("button", { name: /Trocar OS/ }).click();
  await expect(seletor).toBeVisible();
  await page.getByPlaceholder(/Buscar por Nº da OS/).fill(cliente);
  const linhaReaberta = page.getByRole("button").filter({ hasText: cliente });
  await expect(linhaReaberta).toHaveCount(1);
  await linhaReaberta.click();
  await expect(pipeline).toBeVisible();
  await etapaEntrega.click();
  const cardReaberto = page.getByText("🛡 Garantia da OS", { exact: true }).locator("../..");
  await expect(cardReaberto.getByText("Sem cobertura", { exact: true })).toHaveCount(2);
  await expect(cardReaberto.getByText("0 dias", { exact: true })).toBeVisible();
  await expect(cardReaberto.getByLabel("Modelo de garantia")).toHaveValue("sem_garantia");
  await expect(cardReaberto.getByRole("spinbutton")).toHaveValue("0");
  await botaoTermo.click();
  doc = page.locator("#og-print-root");
  await expect(doc).toHaveCount(1);
  await expect(doc).toContainText(cliente);
  await expect(doc).toContainText(loja);
  await expect(doc).toContainText("Sem garantia");
  await expect(doc).not.toContainText("90 dias");
});
