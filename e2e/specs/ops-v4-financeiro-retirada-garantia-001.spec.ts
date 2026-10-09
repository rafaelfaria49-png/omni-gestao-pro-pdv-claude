import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — financeiro verdadeiro e retirada organizada.
// Servidor QA isolado + PostgreSQL local DESCARTÁVEL (ops_v4_frg_qa*) + login QA real.
// Só LEITURA de tela e navegação: nenhum recebimento, estorno, aprovação ou entrega é
// clicado aqui (a decisão do servidor é provada no .pg.test.ts). Massa sintética. Sem
// sleep, skip, fixme, .first() arbitrário, catch que engole falha ou reload que mascara race.

test.use({ serviceWorkers: "block" });

const LOJA = "000-qa-frg-001";
const ENTRADA = "2026-09-18T12:00:00.000Z";

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E FRG-001 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E FRG-001 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v4_frg_qa")) {
    throw new Error("E2E FRG-001 exige URLs idênticas do banco descartável ops_v4_frg_qa*.");
  }
  return urls[0]!;
}

let seq = 0;
const marca = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;

/** OS com orçamento no status pedido e (opcional) título liquidado com a baixa e o recibo da MESMA operação. */
async function semearOS(prisma: PrismaClient, orcStatus: "rascunho" | "aprovado", pago: boolean): Promise<{ id: string; codigo: string }> {
  const m = marca();
  const id = `qa-frg-${m}`;
  const codigo = `OS-QA-FRG-${m}`;
  const operacaoId = `op-qa-frg-${m}`;
  const quitacao = {
    id: `ev-quit-${m}`, tipo: "operacao_cobranca_gerada", autor: "Operador QA FRG", autorTipo: "usuario",
    conteudo: "Quitação: Dinheiro R$ 420,00 (total R$ 420.00) · saldo R$ 0.00 (quitado).", criadoEm: "2026-10-05T21:37:38.000Z",
    metadata: { operacaoId, total: 420, linhas: [{ forma: "dinheiro", valor: 420 }], op: "liquidar", intencao: "quitacao" },
  };
  await prisma.ordemServico.create({
    data: {
      id, storeId: LOJA, numero: codigo, status: "Pronto", equipamento: "Samsung S20 FE", defeito: "Tela quebrada", valorTotal: 420,
      payload: {
        id, codigo, storeId: LOJA, clienteId: "", criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
        pecas: [], observacoes: [], anexos: [],
        cliente: { id: "", nome: `Cliente QA FRG ${m}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE", defeitoRelatado: "Tela quebrada", acessorios: ["Capa"] },
        status: "pronta", operacaoStatus: "pronta", operacaoStatusV3: "pronta", valorTotal: 420,
        orcamento: {
          id: `orc-${m}`, status: orcStatus, sintetizado: false, criadoEm: ENTRADA, ...(orcStatus === "aprovado" ? { respondidoEm: ENTRADA } : {}),
          desconto: 0, total: 420, servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 420 }], pecas: [],
        },
        aberturaV3: { versao: 1, recepcao: { recebidoPor: "Balcão QA", origem: "balcao", prioridade: "media", localFisico: "balcao", dataEntrada: ENTRADA }, garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
        timeline: [
          { id: `ev-${m}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA },
          ...(pago ? [quitacao] : []),
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });
  if (pago) {
    await prisma.contaReceberTitulo.create({
      data: {
        storeId: LOJA, localKey: `os-faturamento:${LOJA}:${id}`, descricao: `OS ${codigo}`, cliente: `Cliente QA FRG ${m}`, valor: 420,
        vencimento: "2026-10-05", status: "pago",
        payload: { origem: "operacoes-v3", ordemServicoId: id, codigo, historico: [{ tipo: "liquidacao", valor: 420, loteId: operacaoId, at: "2026-10-05T21:37:39.000Z", userLabel: "Operador QA FRG" }] } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return { id, codigo };
}

async function efeitos(prisma: PrismaClient, osId: string) {
  const [os, titulos, caixa] = await Promise.all([
    prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true, status: true } }),
    prisma.contaReceberTitulo.findMany({ where: { storeId: LOJA, localKey: `os-faturamento:${LOJA}:${osId}` }, select: { status: true, valor: true, payload: true } }),
    prisma.caixaOperacao.count({ where: { storeId: LOJA } }),
  ]);
  return JSON.stringify({ os, titulos, caixa });
}

async function abrirV4(page: Page) {
  const lojas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/stores" && r.ok());
  const ordens = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
  await page.goto("/dashboard/operacoes-v4-preview");
  await Promise.all([lojas, ordens]);
  await dismissFirstAccessWizardIfPresent(page);
  expect(await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(LOJA);
}

async function selecionarNaBusca(page: Page, codigo: string) {
  const busca = page.getByRole("main").getByRole("textbox", { name: "Buscar por Nº da OS, cliente, aparelho ou IMEI…", exact: true });
  await expect(busca).toHaveCount(1);
  await busca.fill(codigo);
  const seletor = page.getByRole("button", { name: new RegExp(codigo) });
  await expect(seletor).toHaveCount(1);
  await seletor.click();
}

const pipeline = (page: Page) => page.getByRole("navigation", { name: "Pipeline operacional da OS" });
const etapa = (page: Page, nome: RegExp) => pipeline(page).getByRole("button", { name: nome });
const guia = (page: Page) => page.getByRole("region", { name: "Guia de retirada" });
const barra = (page: Page) => page.getByRole("region", { name: "Próxima ação da OS" });
const ticketFinanceiro = (page: Page) => page.getByRole("button", { name: /^Financeiro/ });

async function abrirOS(page: Page, codigo: string) {
  await abrirV4(page);
  await selecionarNaBusca(page, codigo);
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
  await etapa(page, /Entrega/).click();
  await expect(etapa(page, /Entrega/)).toHaveAttribute("aria-current", "step");
}

async function semRolagemHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function capturar(page: Page, nome: string) {
  for (const [largura, altura] of [[1440, 900], [768, 1024], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    const alvo = guia(page);
    await alvo.scrollIntoViewIfNeeded();
    await expect(alvo).toBeVisible();
    await semRolagemHorizontal(page);
    expect(await alvo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${nome}@${largura}: guia sem corte`).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${nome}-${largura}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe.configure({ mode: "serial" });

let prisma: PrismaClient;

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E1 (A1) — rascunho + título liquidado: pagamento registrado, pendência comercial separada, entrega bloqueada, ação para o orçamento; nada é gravado", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", true);
  const antes = await efeitos(prisma, os.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirOS(page, os.codigo);

  await expect(page.getByRole("button", { name: /Pagamento registrado R\$ 420,00/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Aprovação pendente/ })).toBeVisible();
  await expect(barra(page).getByText("Revisar aprovação comercial")).toBeVisible();

  const g = guia(page);
  await expect(g.getByText("Conferir retirada")).toBeVisible();
  await expect(g.getByText("Aprovação comercial pendente — revisar autorização")).toBeVisible();
  await expect(g.getByText(/Pagamento registrado — R\$ 420,00 · Saldo do título — R\$ 0,00 · Forma registrada: Dinheiro/)).toBeVisible();
  await expect(g.getByText("Capa")).toBeVisible();
  for (const proibido of ["Situação financeira desconhecida", "Financeiro indisponível", "Recebimento bloqueado", "Esta Ordem de Serviço ainda não foi entregue."]) {
    await expect(page.getByText(proibido, { exact: false })).toHaveCount(0);
  }
  await expect(page.getByText("O orçamento desta OS não está aprovado.", { exact: false })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Confirmar entrega real" })).toHaveCount(0);
  await capturar(page, "e1-pendencia-comercial");

  // Financeiro: fatos do título, nada a receber, histórico sem soma dupla.
  await ticketFinanceiro(page).click();
  await expect(page.getByText("Nada a receber — título liquidado (R$ 420,00).")).toBeVisible();
  await expect(page.getByLabel("Fatos da Conta a Receber").getByText("Saldo do título")).toBeVisible();
  await expect(page.getByText(/Quitação: Dinheiro R\$ 420,00/)).toHaveCount(1);
  await expect(page.getByText("Liquidação registrada", { exact: false })).toHaveCount(0);

  // Teclado: a ação da barra leva ao orçamento (nunca a um Financeiro sem saída).
  const acao = barra(page).getByRole("button", { name: "Abrir orçamento" });
  await acao.focus();
  await expect(acao).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Comercial/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Nada a receber — título liquidado", { exact: false })).toHaveCount(0);

  expect(await efeitos(prisma, os.id)).toBe(antes);
});

test("E2 (A2) — aprovado + pago: quitado nas superfícies; retirante, data e custódia antes de confirmar; impressão do termo sobre modal com Escape", async ({ page }) => {
  const os = await semearOS(prisma, "aprovado", true);
  const antes = await efeitos(prisma, os.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirOS(page, os.codigo);

  await expect(guia(page).getByText("Pagamento quitado — confirmar entrega.")).toBeVisible();
  await expect(barra(page).getByText("Confirmar entrega")).toBeVisible();
  await expect(page.getByLabel("Retirado por")).toBeVisible();
  await expect(page.getByText(/Data da entrega/).first()).toBeVisible();
  await expect(guia(page).getByText("Capa")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar entrega real" })).toBeVisible();
  await expect(page.getByText("Aprovação comercial pendente", { exact: false })).toHaveCount(0);

  // Teclado: Tab sai do retirante e chega a controles reais da conferência.
  await page.getByLabel("Retirado por").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Retirado por")).toBeFocused();

  // Impressão do Termo de Garantia sobre o modal: abre e fecha por Escape, sem gravar entrega.
  const termo = page.getByRole("button", { name: "Imprimir Termo de Garantia" });
  await expect(termo).toBeEnabled();
  await termo.click();
  await expect(page.locator("#og-print-root")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#og-print-root")).toHaveCount(0);

  await capturar(page, "e2-quitado");
  const depois = JSON.parse(await efeitos(prisma, os.id)) as { os: { payload: { timeline: Array<{ tipo: string }> } }; titulos: unknown; caixa: number };
  const base = JSON.parse(antes) as typeof depois;
  expect(depois.titulos).toEqual(base.titulos);
  expect(depois.caixa).toBe(base.caixa);
  expect(depois.os.payload.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(0);
});

test("E3 — sem pagamento e orçamento em rascunho: nenhuma Conta a Receber, sem zero inventado, ação comercial", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", false);
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirOS(page, os.codigo);
  await expect(guia(page).getByText(/Nenhuma Conta a Receber criada/)).toBeVisible();
  await expect(guia(page).getByText("Valor do título")).toHaveCount(0);
  await expect(barra(page).getByText("Revisar aprovação comercial")).toBeVisible();
  await semRolagemHorizontal(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("E4 (R1-3) — quitado legado com estorno sem referência válida: nenhuma superfície mostra quitação; nada é gravado", async ({ page }) => {
  const os = await semearOS(prisma, "aprovado", true);
  const localKey = `os-faturamento:${LOJA}:${os.id}`;
  const titulo = await prisma.contaReceberTitulo.findFirstOrThrow({ where: { storeId: LOJA, localKey } });
  const payload = titulo.payload as Record<string, unknown> & { historico: unknown[] };
  await prisma.contaReceberTitulo.update({
    where: { id: titulo.id },
    data: { payload: { ...payload, historico: [...payload.historico, { tipo: "estorno_pagamento", valor: 420, refHistoricoIndex: 9 }, { tipo: "pagamento", valor: 420 }] } as unknown as Prisma.InputJsonValue },
  });
  const antes = await efeitos(prisma, os.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrirOS(page, os.codigo);
  await expect(page.getByRole("button", { name: /Pagamento em conferência/ })).toBeVisible();
  await expect(guia(page).getByText("Pagamento em conferência")).toBeVisible();
  await expect(guia(page).getByText("Valor do título")).toHaveCount(0);
  await expect(page.getByText("Pagamento quitado", { exact: false })).toHaveCount(0);
  await ticketFinanceiro(page).click();
  await expect(page.getByLabel("Fatos da Conta a Receber").getByText("Em conferência")).toHaveCount(3);
  await expect(page.getByText("Quitado", { exact: true })).toHaveCount(0);
  expect(await efeitos(prisma, os.id)).toBe(antes);
});
