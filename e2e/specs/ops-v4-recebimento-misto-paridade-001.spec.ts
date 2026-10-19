import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";

import { dismissFirstAccessWizardIfPresent } from "../helpers";

// Login QA pelo setup existente. Escritas só em PostgreSQL loopback descartável.
test.use({ storageState: "e2e/.auth/storage.json" });
// Mesma loja e bootstrap QA V3; guard local evita carregar .mjs no runner CJS.
const LOJA_QA_ID = "000-qa-ops-v3-misto";
function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("E2E só aceita PostgreSQL loopback.");
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v3_misto_qa")) throw new Error("E2E exige URLs idênticas do banco descartável ops_v3_misto_qa*.");
  return urls[0]!;
}

async function abrirOS(page: Page, codigo: string) {
  await page.goto("/dashboard/operacoes-v4-preview");
  await dismissFirstAccessWizardIfPresent(page);
  const busca = page.getByRole("main").getByRole("textbox", { name: "Buscar por Nº da OS, cliente, aparelho ou IMEI…", exact: true });
  await expect(busca).toHaveCount(1); await busca.fill(codigo);
  const seletor = page.getByRole("button", { name: new RegExp(codigo) });
  await expect(seletor).toHaveCount(1); await seletor.click();
  const financeiro = page.getByRole("button").and(page.getByTitle("Financeiro", { exact: true }));
  await expect(financeiro).toHaveCount(1); await financeiro.click();
  await page.getByRole("button", { name: /^Receber R/ }).click();
  await expect(page.getByRole("dialog", { name: "Receber pagamento" })).toBeVisible();
}

test("V4: débito 350 + a prazo 50 em confirmação única; depois 50 quitam e a parcela desaparece", async ({ page }) => {
  test.setTimeout(180_000);
  const origem = new URL(test.info().project.use.baseURL!);
  expect(origem.hostname).toBe("127.0.0.1"); expect(origem.port).not.toBe("3000");
  // Dispensa o onboarding só nesta sessão QA antes da hidratação assíncrona.
  await page.addInitScript((loja) => sessionStorage.setItem(`@omnigestao:first-access-wizard:dismissed:${loja}`, "1"), LOJA_QA_ID);
  await page.setViewportSize({ width: 1440, height: 900 });
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const marca = Date.now().toString(36), codigo = `OS-QA-V4-${marca}`, storeId = LOJA_QA_ID, venc = "2099-12-31";
  try {
    const os = await prisma.ordemServico.create({ data: { storeId, numero: codigo, status: "Pronto", equipamento: "Samsung A54", defeito: "Tela QA", valorTotal: 400,
      payload: { codigo, storeId, cliente: { nome: "Cliente QA V4" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" }, status: "pronta", operacaoStatusV3: "pronta", valorTotal: 400, orcamento: { id: `orc-${marca}`, status: "aprovado", pecas: [], servicos: [{ id: "s1", descricao: "Tela QA", valor: 300 }, { id: "s2", descricao: "Limpeza QA", valor: 100 }], desconto: 0, total: 400, criadoEm: new Date().toISOString() }, timeline: [] },
    } });
    const sessao = await prisma.sessaoCaixa.findFirst({ where: { storeId, status: "ABERTA" } }) ?? await prisma.sessaoCaixa.create({ data: { storeId, status: "ABERTA", operador: "QA V4" } });
    await abrirOS(page, codigo);
    const modal = page.getByRole("dialog", { name: "Receber pagamento" });
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): nenhuma forma pré-selecionada.
    await expect(modal.getByLabel("Forma da linha 1").locator("option")).toHaveText(["Escolha a forma", "Dinheiro", "PIX", "Débito", "Crédito", "A prazo / crediário"]);
    await expect(modal.getByLabel("Forma da linha 1")).toHaveValue("");
    await modal.getByLabel("Forma da linha 1").selectOption("debito"); await modal.getByLabel("Valor da linha 1").fill("350");
    await modal.getByRole("button", { name: /Dividir pagamento/ }).click(); await modal.getByLabel("Forma da linha 2").selectOption("a_prazo");
    await expect(modal.getByLabel("Valor da linha 2")).toHaveValue("50,00");
    const confirmar = modal.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ }); await expect(confirmar).toBeDisabled();
    await modal.getByLabel("Vencimento da parte a prazo").fill(venc); await expect(confirmar).toBeEnabled();
    await expect(modal.getByTestId("resumo-misto")).toContainText(/Receber agoraR\$\s350,00/);
    await expect(modal.getByTestId("resumo-misto")).toContainText(/Deixar a prazoR\$\s50,00/);
    await expect(modal).not.toContainText("Quitação");
    await modal.screenshot({ path: test.info().outputPath("desktop-resumo-misto.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(modal).toBeVisible();
    expect(await modal.evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(true);
    await modal.getByTestId("resumo-misto").scrollIntoViewIfNeeded();
    await expect(modal.getByText("Saldo em aberto", { exact: true })).toBeVisible();
    await modal.screenshot({ path: test.info().outputPath("mobile-resumo-misto.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await confirmar.click(); await expect(modal).toBeHidden();
    const localKey = `os-faturamento:${storeId}:${os.id}`;
    const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } }); expect(titulos).toHaveLength(1); expect(titulos[0]).toMatchObject({ valor: 400, status: "parcial", vencimento: venc });
    const row = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(row.payload).toMatchObject({ pagamentoV3: { recebido: 350, saldo: 50, status: "parcial" }, aPrazoV3: { valor: 50, vencimento: venc, status: "pendente" } });
    const caixa = await prisma.caixaOperacao.findMany({ where: { storeId, sessaoId: sessao.id, payload: { path: ["ordemServicoId"], equals: os.id } } }); expect(caixa.map((c) => c.valor)).toEqual([350]);
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: titulos[0]!.id } }); expect(movs.map((m) => m.valor)).toEqual([350]);
    const recibo = page.getByText("🧾 Recibo de pagamento", { exact: true }).locator("..").locator("..");
    await expect(recibo).toHaveCount(1);
    await expect(recibo.getByText("Recebido nesta operação", { exact: true })).toBeVisible();
    await expect(recibo.getByText(/Saldo a prazo: R\$\s50,00/)).toBeVisible();
    await expect(recibo.getByText("Pagamento parcial — saldo a prazo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: /^Receber R\$\s50,00$/ }).click();
    await expect(modal.getByTestId("a-prazo-persistido")).toContainText("31/12/2099");
    await modal.getByLabel("Forma da linha 1").selectOption("dinheiro"); await expect(modal.getByLabel("Valor da linha 1")).toHaveValue("50");
    await modal.getByRole("button", { name: /Confirmar R\$\s50,00/ }).click(); await expect(modal).toBeHidden();
    const final = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } }); expect(final).toHaveLength(1); expect(final[0]).toMatchObject({ id: titulos[0]!.id, status: "pago" });
    const osFinal = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } }); expect(osFinal.payload).toMatchObject({ pagamentoV3: { recebido: 400, saldo: 0, status: "quitado" }, aPrazoV3: { status: "quitado" } });
    await page.getByRole("button", { name: "Fechar", exact: true }).click(); await expect(page.getByText("Recebimento desta OS", { exact: true }).locator("..")).toContainText("Quitado");
    await expect(page.getByTestId("a-prazo-persistido")).toHaveCount(0); await expect(page.getByText("Vencimento", { exact: true })).toHaveCount(0);
    console.log(`QA_V4: titulo=${titulos[0]!.id} recebido=400 saldo=0 caixa_imediato=350`);
  } finally { await prisma.$disconnect(); }
});

test("R1: recusa por saldo concorrente atualiza a projeção e permite corrigir o mesmo rascunho", async ({ page, context }) => {
  test.setTimeout(180_000);
  const origem = new URL(test.info().project.use.baseURL!);
  expect(origem.hostname).toBe("127.0.0.1"); expect(origem.port).not.toBe("3000");
  await context.addInitScript((loja) => sessionStorage.setItem(`@omnigestao:first-access-wizard:dismissed:${loja}`, "1"), LOJA_QA_ID);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const marca = Date.now().toString(36), codigo = `OS-QA-R1-${marca}`, storeId = LOJA_QA_ID;
  const concorrente = await context.newPage();
  try {
    const os = await prisma.ordemServico.create({ data: { storeId, numero: codigo, status: "Pronto", equipamento: "Samsung A54", defeito: "Concorrência QA", valorTotal: 400,
      payload: { codigo, storeId, cliente: { nome: "Cliente QA R1" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" }, status: "pronta", operacaoStatusV3: "pronta", valorTotal: 400, orcamento: { id: `orc-${marca}`, status: "aprovado", pecas: [], servicos: [{ id: "s1", descricao: "Serviço QA", valor: 400 }], desconto: 0, total: 400, criadoEm: new Date().toISOString() }, timeline: [] },
    } });
    await abrirOS(page, codigo);
    const modal = page.getByRole("dialog", { name: "Receber pagamento" });
    await modal.getByLabel("Forma da linha 1").selectOption("debito");
    await modal.getByLabel("Valor da linha 1").fill("350");
    await modal.getByRole("button", { name: /Dividir pagamento/ }).click();
    await modal.getByLabel("Forma da linha 2").selectOption("a_prazo");
    await modal.getByLabel("Vencimento da parte a prazo").fill("2099-12-31");
    await expect(modal.getByTestId("resumo-misto")).toContainText(/Já recebidoR\$\s0,00/);

    // Outra sessão registra 20 pelo recebimento normal; a primeira mantém 350+50.
    await abrirOS(concorrente, codigo);
    const outroModal = concorrente.getByRole("dialog", { name: "Receber pagamento" });
    await outroModal.getByRole("button", { name: "Pagamento parcial", exact: true }).click();
    await outroModal.getByLabel("Forma da linha 1").selectOption("pix");
    await outroModal.getByLabel("Valor da linha 1").fill("20");
    await outroModal.getByRole("button", { name: /Confirmar R\$\s20,00/ }).click();
    await expect(outroModal).toBeHidden();
    const aposOutro = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(aposOutro.payload).toMatchObject({ pagamentoV3: { recebido: 20, saldo: 380 } });
    await expect(modal.getByTestId("resumo-misto")).toContainText(/Já recebidoR\$\s0,00/);

    await modal.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ }).click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("alert").filter({ hasText: "380,00" }).first()).toBeVisible();
    await expect(modal.getByTestId("resumo-misto")).toContainText(/Já recebidoR\$\s20,00/);
    await expect(modal.getByLabel("Valor da linha 1")).toHaveValue("350");
    await expect(modal.getByLabel("Valor da linha 2")).toHaveValue("50,00");
    await modal.getByRole("button", { name: "Usar restante", exact: true }).nth(1).click();
    await expect(modal.getByLabel("Valor da linha 2")).toHaveValue("30,00");
    const confirmar = modal.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s30,00 a prazo/ });
    await expect(confirmar).toBeEnabled(); await confirmar.click(); await expect(modal).toBeHidden();
    const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey: `os-faturamento:${storeId}:${os.id}` } });
    expect(titulos).toHaveLength(1);
    const final = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(final.payload).toMatchObject({ pagamentoV3: { recebido: 370, saldo: 30, status: "parcial" }, aPrazoV3: { valor: 30, status: "pendente" } });
  } finally { await concorrente.close(); await prisma.$disconnect(); }
});
