import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-V4-FLUXO-CURTO-004 — Entrada como complementação, sem segundo wizard.
// Servidor isolado + PostgreSQL local descartável + login QA real. Sincroniza
// com APIs/estado real do DOM; sem sleep, skip, fixme, .first() ou reload.

type Evento004 = { tipo: string; metadata?: { evento?: string; presentes?: number; fatias?: string[] } };
type OsPayload004 = {
  status: string;
  operacaoStatusV3: string;
  orcamento?: { status: string; total: number };
  valorTotal?: number;
  autorizacaoComercialV3?: unknown;
  provaEntradaV3?: {
    identificacao?: { cor?: string };
    credenciais?: { senha?: string; faceId?: boolean; biometria?: boolean };
    acessorios?: { presente: boolean }[];
  };
  timeline: Evento004[];
  tecnico?: unknown;
  entregueEm?: string;
};

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E 004 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1"].includes(u.hostname))) {
    throw new Error("E2E 004 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href) throw new Error("E2E 004 exige DATABASE_URL e DIRECT_URL idênticas.");
  return urls[0]!;
}

async function abrirNovaOS(page: Page): Promise<Locator> {
  const lojasProntas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/stores" && r.ok());
  const ordensProntas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
  await page.goto("/dashboard/operacoes-v4-preview");
  await Promise.all([lojasProntas, ordensProntas]);
  await dismissFirstAccessWizardIfPresent(page);
  const launcher = page.getByRole("main").getByTitle(/Novo atendimento/);
  await expect(launcher).toHaveCount(1);
  await launcher.click();
  await page.getByRole("button", { name: "Nova OS" }).press("Enter");
  const modal = page.getByRole("dialog").filter({ hasText: "Nova Ordem de Serviço" });
  await expect(modal).toHaveCount(1);
  return modal;
}

async function preencherBasico(modal: Locator, cliente: string) {
  await modal.getByRole("button", { name: "Novo", exact: true }).click();
  await modal.getByPlaceholder("Nome do cliente").fill(cliente);
  await modal.getByPlaceholder("Samsung").fill("Samsung");
  await modal.getByPlaceholder("Galaxy S22").fill("Galaxy QA");
  await modal.getByPlaceholder(/Tela quebrada/).fill("Tela quebrada");
}

async function osSintetica(prisma: PrismaClient, storeId: string, cliente: string) {
  const rows = await prisma.ordemServico.findMany({
    where: { storeId },
    select: { id: true, storeId: true, status: true, valorTotal: true, payload: true },
  });
  return rows.filter((row) => (row.payload as { cliente?: { nome?: string } } | null)?.cliente?.nome === cliente);
}

async function contagensEfeitos(prisma: PrismaClient) {
  const [titulos, vendas, movimentosFinanceiros, transacoesFinanceiras, caixa, estoque] = await Promise.all([
    prisma.contaReceberTitulo.count(),
    prisma.venda.count(),
    prisma.movimentacaoFinanceira.count(),
    prisma.financialTransaction.count(),
    prisma.caixaOperacao.count(),
    prisma.movimentacaoEstoque.count(),
  ]);
  return { titulos, vendas, movimentosFinanceiros, transacoesFinanceiras, caixa, estoque };
}

const eventos = (os: OsPayload004, nome: string) => os.timeline.filter((e) => e.metadata?.evento === nome);
const pipelineDa = (page: Page) => page.getByRole("navigation", { name: "Pipeline operacional da OS" });
const railEntrada = (page: Page) => page.getByRole("navigation", { name: "Grupos da entrada" });
const chip = (page: Page, nome: RegExp) => railEntrada(page).getByRole("button", { name: nome });
const area = (page: Page, id: string) => page.locator(`h2#entrada-title-${id}`);
// Bloco = a seção imediata do título (o h3 é filho direto da seção).
const blocoDe = (page: Page, titulo: string) =>
  page.getByRole("heading", { level: 3, name: titulo, exact: true }).locator("xpath=..");

async function semWizard(page: Page) {
  await expect(railEntrada(page).getByText("Complementar entrada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Salvar e continuar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Anterior$/ })).toHaveCount(0);
  await expect(page.getByText(/de 4 grupos/)).toHaveCount(0);
  await expect(railEntrada(page).getByRole("progressbar")).toHaveCount(0);
}

test("OPS-V4-FLUXO-CURTO-004 — autorizado: Entrada complementar, sem wizard, Aprovada intacta", async ({ page }) => {
  const cliente = `E2E Entrada 004 ${Date.now().toString(36)}`;
  const modal = await abrirNovaOS(page);
  const storeId = await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"));
  expect(storeId).toBeTruthy();
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  try {
    const efeitosAntes = await contagensEfeitos(prisma);
    await modal.getByRole("button", { name: /Serviço já autorizado/ }).click();
    await preencherBasico(modal, cliente);
    await modal.getByLabel("Nome do serviço").fill("Troca de tela");
    await modal.getByLabel("Valor de venda").fill("300");
    await modal.getByLabel("Custo interno").fill("92");
    await modal.getByLabel("Garantia em dias").fill("90");
    await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
    await expect(modal).toBeHidden();

    const pipeline = pipelineDa(page);
    await expect(pipeline.getByRole("button", { name: /Execução/ })).toHaveAttribute("aria-current", "step");

    // Entrada aberta manualmente pelo operador.
    await pipeline.getByRole("button", { name: /Entrada/ }).click();
    await expect(railEntrada(page)).toBeVisible();
    await semWizard(page);

    // Área inicial = pendência real: a abertura já registrou Recepção; faltam acessórios.
    await expect(area(page, "seguranca-custodia")).toBeVisible();
    await expect(chip(page, /Segurança/)).toHaveAttribute("aria-current", "true");
    await expect(chip(page, /Recepção/)).toContainText("Registrado");
    await expect(chip(page, /Evidências/)).toContainText("Opcional");

    // "Nenhum acessório" é resposta válida; registrar não muda de área.
    await page.getByRole("button", { name: "Registrar: nenhum acessório recebido" }).click();
    await expect(chip(page, /Segurança/)).toContainText("Registrado");
    await expect(page.getByText(/Registrado: Nenhum acessório recebido/)).toBeVisible();
    await expect(area(page, "seguranca-custodia")).toBeVisible();

    // Navegação direta, fora de ordem.
    await chip(page, /Evidências/).click();
    await expect(area(page, "evidencias")).toBeVisible();
    await expect(blocoDe(page, "Fotos da entrada")).toContainText("Opcional");
    await expect(blocoDe(page, "Assinatura do cliente")).toContainText("Opcional");
    await chip(page, /Recepção/).click();
    await expect(area(page, "recepcao")).toBeVisible();

    // Dados da abertura hidratados, sem reentrada.
    const abertura = blocoDe(page, "Informado na abertura");
    await expect(abertura.getByText(cliente, { exact: true })).toBeVisible();
    await expect(abertura.getByText("Samsung Galaxy QA", { exact: true })).toBeVisible();
    await expect(abertura.getByText("Tela quebrada", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Defeito relatado")).toHaveCount(0);

    // Complemento faltante (cor): salvar mantém a mesma área.
    const salvar = page.getByRole("button", { name: "Salvar alterações" });
    await expect(salvar).toBeDisabled();
    await page.getByLabel("Cor").fill("Preto");
    await expect(salvar).toBeEnabled();
    await salvar.click();
    await expect(salvar).toBeDisabled();
    await expect(area(page, "recepcao")).toBeVisible();

    // Estado físico: padrão não confirmado até o registro explícito.
    await chip(page, /Inspeção/).click();
    await expect(area(page, "inspecao")).toBeVisible();
    await expect(page.getByText(/Ainda não conferido/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar estado exibido" }).click();
    await expect(page.getByText("Registrado na prova de entrada. Ajuste e salve se algo mudou.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar estado exibido" })).toHaveCount(0);
    await expect(area(page, "inspecao")).toBeVisible();

    // Sai da Entrada sem completar opcionais (checklist, fotos, assinatura).
    await pipeline.getByRole("button", { name: /Execução/ }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(pipeline.getByRole("button", { name: /Execução/ })).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("heading", { name: /^OS-/ }).locator("..").getByText("Aprovada", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar execução" })).toBeEnabled();

    const rows = await osSintetica(prisma, storeId!, cliente);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const os = row.payload as unknown as OsPayload004;
    expect(row.storeId).toBe(storeId);
    expect(row.valorTotal).toBe(300);
    expect(os.status).toBe("aprovado");
    expect(os.operacaoStatusV3).toBe("aprovado");
    expect(os.orcamento).toMatchObject({ status: "aprovado", total: 300 });
    expect(os.valorTotal).toBe(300);
    expect(os.autorizacaoComercialV3).toMatchObject({ autorizada: true, total: 300 });
    expect(os.provaEntradaV3?.identificacao?.cor).toBe("Preto");
    expect(os.provaEntradaV3?.acessorios?.every((a) => a.presente === false)).toBe(true);
    expect(eventos(os, "acessorio_registrado").map((e) => e.metadata?.presentes)).toEqual([0]);
    const provas = [...eventos(os, "prova_entrada_criada"), ...eventos(os, "prova_entrada_atualizada")];
    expect(provas.map((e) => e.metadata?.fatias)).toEqual([["estadoFisico", "avarias"]]);
    expect(os.timeline.some((e) => e.tipo === "servico_iniciado")).toBe(false);
    expect(os.timeline.some((e) => e.tipo === "mudanca_status")).toBe(false);
    expect(os.tecnico).toBeUndefined();
    expect(os.entregueEm).toBeUndefined();
    expect(await contagensEfeitos(prisma)).toEqual(efeitosAntes);
    console.log(`[OPS-V4-FLUXO-CURTO-004][E2E] autorizado os=${row.id} store=${row.storeId} status=${os.status}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("OPS-V4-FLUXO-CURTO-004 — diagnóstico: complementa parte, sai sem bloqueio e continua aberta", async ({ page }) => {
  const cliente = `E2E Diagnostico 004 ${Date.now().toString(36)}`;
  const modal = await abrirNovaOS(page);
  const storeId = await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"));
  expect(storeId).toBeTruthy();
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  try {
    const efeitosAntes = await contagensEfeitos(prisma);
    await modal.getByRole("button", { name: /Precisa de diagnóstico/ }).click();
    await preencherBasico(modal, cliente);
    await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
    await expect(modal).toBeHidden();

    const pipeline = pipelineDa(page);
    await expect(pipeline.getByRole("button", { name: /Entrada/ })).toHaveAttribute("aria-current", "step");
    await expect(railEntrada(page)).toBeVisible();
    await semWizard(page);
    await expect(area(page, "seguranca-custodia")).toBeVisible();

    // Complementa só o acesso; acessórios, inspeção e evidências ficam como estão.
    await page.getByLabel("Senha / PIN").fill("2580");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(blocoDe(page, "Acesso ao aparelho")).toContainText("Registrado");
    await expect(area(page, "seguranca-custodia")).toBeVisible();
    // Biometria sem resposta segue "não informado" — nunca "não".
    await expect(page.getByRole("group", { name: "Face ID" }).getByRole("radio", { name: "Não informado" })).toBeChecked();
    // Salvar só credenciais NÃO confirma o estado físico padrão.
    await expect(chip(page, /Inspeção/)).toContainText("Falta complementar");
    await expect(chip(page, /Evidências/)).toContainText("Opcional");

    // Sai da Entrada para o Diagnóstico: nada bloqueia e nada inicia sozinho.
    await pipeline.getByRole("button", { name: /Diagnóstico/ }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(pipeline.getByRole("button", { name: /Diagnóstico/ })).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("Cliente relatou", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^OS-/ }).locator("..").getByText("Aberta", { exact: true })).toBeVisible();

    const rows = await osSintetica(prisma, storeId!, cliente);
    expect(rows).toHaveLength(1);
    const os = rows[0]!.payload as unknown as OsPayload004;
    expect(os.status).toBe("aberta");
    expect(os.operacaoStatusV3).toBe("aberta");
    expect(os.autorizacaoComercialV3).toBeUndefined();
    expect(os.orcamento?.status).not.toBe("aprovado");
    expect(os.provaEntradaV3?.credenciais?.senha).toBe("2580");
    expect(os.provaEntradaV3?.credenciais?.faceId).toBeUndefined();
    const provas = [...eventos(os, "prova_entrada_criada"), ...eventos(os, "prova_entrada_atualizada")];
    expect(provas.map((e) => e.metadata?.fatias)).toEqual([["credenciais"]]);
    expect(os.timeline.some((e) => e.tipo === "mudanca_status")).toBe(false);
    expect(os.timeline.some((e) => e.tipo === "servico_iniciado")).toBe(false);
    expect(await contagensEfeitos(prisma)).toEqual(efeitosAntes);
    console.log(`[OPS-V4-FLUXO-CURTO-004][E2E] diagnostico os=${rows[0]!.id} status=${os.status}`);
  } finally {
    await prisma.$disconnect();
  }
});
