import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

type OsPayload003 = {
  status: string;
  operacaoStatusV3: string;
  orcamento?: {
    status: string; total: number; sintetizado?: boolean; respondidoEm?: string;
    enviadoEm?: string; servicos: unknown[];
  };
  valorTotal?: number;
  garantia?: unknown;
  autorizacaoComercialV3?: unknown;
  timeline: Array<{ tipo: string }>;
  tecnico?: unknown;
  entregueEm?: string;
};

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E 003 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1"].includes(u.hostname))) {
    throw new Error("E2E 003 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href) throw new Error("E2E 003 exige DATABASE_URL e DIRECT_URL idênticas.");
  return urls[0]!;
}

async function abrirV4Pronta(page: import("@playwright/test").Page) {
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

async function preencherBasico(modal: import("@playwright/test").Locator, cliente: string) {
  await modal.getByRole("button", { name: "Novo", exact: true }).click();
  await modal.getByPlaceholder("Nome do cliente").fill(cliente);
  await modal.getByPlaceholder("Samsung").fill("Samsung");
  await modal.getByPlaceholder("Galaxy S22").fill("Galaxy QA");
  await modal.getByPlaceholder(/Tela quebrada/).fill("Tela quebrada");
}

async function osSintetica(prisma: PrismaClient, storeId: string, cliente: string) {
  const rows = await prisma.ordemServico.findMany({
    where: { storeId },
    select: { id: true, numero: true, storeId: true, status: true, valorTotal: true, payload: true },
  });
  return rows.filter((row) => {
    const payload = row.payload as { cliente?: { nome?: string } } | null;
    return payload?.cliente?.nome === cliente;
  });
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

test("OPS-V4-FLUXO-CURTO-003 — serviço autorizado abre OS aprovada e aguarda início", async ({ page }) => {
  const cliente = `E2E Autorizado 003 ${Date.now().toString(36)}`;
  const modal = await abrirV4Pronta(page);
  const storeId = await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"));
  expect(storeId).toBeTruthy();
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const efeitosAntes = await contagensEfeitos(prisma);
  await modal.getByRole("button", { name: /Serviço já autorizado/ }).click();
  await preencherBasico(modal, cliente);
  await modal.getByLabel("Nome do serviço").fill("Troca de tela");
  await modal.getByLabel("Valor de venda").fill("300");
  await modal.getByLabel("Custo interno").fill("92");
  await modal.getByLabel("Garantia em dias").fill("90");
  // A linha aberta válida participa do submit; não há clique em Confirmar serviço.
  await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
  await expect(modal).toBeHidden();

  const pipeline = page.getByRole("navigation", { name: "Pipeline operacional da OS" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: /Execução/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: /^OS-/ }).locator("..").getByText("Aprovada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar execução" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar execução" })).toBeEnabled();

  try {
    const rows = await osSintetica(prisma, storeId!, cliente);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const os = row.payload as unknown as OsPayload003;
    expect(row.storeId).toBe(storeId);
    expect(row.status).toBe("EmAnalise");
    expect(row.valorTotal).toBe(300);
    expect(os.status).toBe("aprovado");
    expect(os.operacaoStatusV3).toBe("aprovado");
    expect(os.orcamento).toMatchObject({ status: "aprovado", total: 300, sintetizado: false });
    expect(os.orcamento?.respondidoEm).toEqual(expect.any(String));
    expect(os.orcamento?.enviadoEm).toBeUndefined();
    expect(os.orcamento?.servicos[0]).toMatchObject({ descricao: "Troca de tela", valor: 300, custoV3: 92, prazoGarantiaDias: 90 });
    expect(os.valorTotal).toBe(300);
    expect(os.garantia).toMatchObject({ ativa: false, prazoDias: 90 });
    expect(os.autorizacaoComercialV3).toMatchObject({ autorizada: true, escopo: "servicos_da_abertura", total: 300 });
    expect(os.timeline.every((event: { tipo: string }) => event.tipo !== "servico_iniciado")).toBe(true);
    expect(os.tecnico).toBeUndefined();
    expect(os.entregueEm).toBeUndefined();
    expect(await contagensEfeitos(prisma)).toEqual(efeitosAntes);
    console.log(`[OPS-V4-FLUXO-CURTO-003] os=${row.id} store=${row.storeId} status=${os.status}`);
  } finally {
    await prisma.$disconnect();
  }

  await page.getByTitle("Abrir orçamento").click();
  await expect(page.getByText("Aprovado", { exact: true })).toBeVisible();
  await expect(page.getByText("Total ao cliente", { exact: true }).locator("..").getByText("R$ 300,00", { exact: true })).toBeVisible();
});

test("OPS-V4-FLUXO-CURTO-003 — diagnóstico sem preço continua aberto", async ({ page }) => {
  const cliente = `E2E Diagnostico 003 ${Date.now().toString(36)}`;
  const modal = await abrirV4Pronta(page);
  const storeId = await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"));
  expect(storeId).toBeTruthy();
  await modal.getByRole("button", { name: /Precisa de diagnóstico/ }).click();
  await preencherBasico(modal, cliente);
  await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
  await expect(modal).toBeHidden();
  const pipeline = page.getByRole("navigation", { name: "Pipeline operacional da OS" });
  await expect(pipeline).toBeVisible();
  await expect(pipeline.getByRole("button", { name: /Entrada/ })).toHaveAttribute("aria-current", "step");

  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  try {
    const rows = await osSintetica(prisma, storeId!, cliente);
    expect(rows).toHaveLength(1);
    const os = rows[0]!.payload as unknown as OsPayload003;
    expect(os.status).toBe("aberta");
    expect(os.operacaoStatusV3).toBe("aberta");
    expect(os.autorizacaoComercialV3).toBeUndefined();
    expect(os.orcamento?.status).not.toBe("aprovado");
  } finally {
    await prisma.$disconnect();
  }
});
