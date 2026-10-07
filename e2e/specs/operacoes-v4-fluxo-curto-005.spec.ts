import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-V4-FLUXO-CURTO-005 — "Próxima ação" no Workspace V4.
// Servidor QA isolado + PostgreSQL local descartável + login QA real. Estados de
// dinheiro (saldo, quitação, cobrança cancelada) são preparados de forma
// SINTÉTICA no banco descartável pelo harness — nenhum pagamento é clicado,
// nenhuma entrega é confirmada. Sem sleep, skip, fixme, .first() ou reload.

test.use({ serviceWorkers: "block" });

const LOJA = "000-qa-ops-005";
type Evento = { tipo: string; metadata?: Record<string, unknown> };
type Payload = {
  operacaoStatusV3: string;
  status: string;
  orcamento?: { status?: string };
  timeline: Evento[];
  entregueEm?: string;
  entregaV3?: unknown;
};

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E 005 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E 005 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v4_fluxo_005_qa")) {
    throw new Error("E2E 005 exige URLs idênticas do banco descartável ops_v4_fluxo_005_qa*.");
  }
  return urls[0]!;
}

let seq = 0;
const marca = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;
const STATUS_COLUNA: Record<string, "Aberto" | "EmAnalise" | "Pronto" | "Entregue"> = {
  aberta: "Aberto",
  diagnostico: "EmAnalise",
  aguardando_aprovacao: "EmAnalise",
  aprovado: "EmAnalise",
  aguardando_peca: "EmAnalise",
  em_execucao: "EmAnalise",
  pronta: "Pronto",
  entregue: "Entregue",
};

/** OS sintética na loja QA (id explícito na linha E no payload). */
async function semearOS(
  prisma: PrismaClient,
  statusV3: string,
  opts: { orcamentoStatus?: string; extra?: Record<string, unknown>; semRecebidoPor?: boolean } = {},
) {
  const m = marca();
  const id = `qa-005-${m}`;
  const codigo = `OS-QA-005-${m}`;
  const agora = new Date().toISOString();
  await prisma.ordemServico.create({
    data: {
      id,
      storeId: LOJA,
      numero: codigo,
      status: STATUS_COLUNA[statusV3] ?? "Aberto",
      equipamento: "Samsung Galaxy QA",
      defeito: "Tela quebrada",
      valorTotal: 400,
      payload: {
        id, codigo, storeId: LOJA, clienteId: "", criadoEm: agora, atualizadoEm: agora, prioridade: "media", origem: "balcao",
        pecas: [], observacoes: [], anexos: [],
        cliente: { id: "", nome: `Cliente QA 005 ${m}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada" },
        status: statusV3, operacaoStatus: statusV3, operacaoStatusV3: statusV3, valorTotal: 400,
        orcamento: {
          id: `orc-${m}`, status: opts.orcamentoStatus ?? "aprovado", sintetizado: false, pecas: [], desconto: 0, total: 400,
          servicos: [{ id: "s1", descricao: "Troca de tela QA", valor: 400 }], criadoEm: agora,
          ...(opts.orcamentoStatus === "enviado" ? { enviadoEm: agora } : { respondidoEm: agora }),
        },
        garantia: { ativa: false, prazoDias: 90 },
        // Como a Nova OS real: recepção registrada na abertura (sem rascunho pendente na Entrada).
        ...(opts.semRecebidoPor
          ? {}
          : { aberturaV3: { versao: 1, recepcao: { recebidoPor: "Operador QA 005", origem: "balcao", prioridade: "media", localFisico: "balcao" } } }),
        timeline: [{ id: `ev-${m}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: agora }],
        ...(opts.extra ?? {}),
      },
    },
  });
  return { id, codigo };
}

/**
 * Título a receber sintético no formato do fixture OFICIAL da projeção
 * (lib/operacoes-v4/financial-projection.test.ts): `pago` + liquidação → PAID;
 * `cancelado` → CANCELLED. Só no banco descartável.
 */
async function semearTitulo(prisma: PrismaClient, osId: string, status: "pago" | "cancelado") {
  await prisma.contaReceberTitulo.create({
    data: {
      storeId: LOJA,
      localKey: `os-faturamento:${LOJA}:${osId}`,
      descricao: "OS QA 005 (sintético)",
      cliente: "Cliente QA 005",
      valor: 400,
      vencimento: "31/12/2026",
      status,
      payload: {
        ordemServicoId: osId,
        historico: status === "pago" ? [{ tipo: "liquidacao", valor: 400, formaPagamento: "dinheiro" }] : [],
      },
    },
  });
}

/**
 * Helper OFICIAL `seedContasReceberOS` (scripts/seed-contas-receber-os.mjs: cria só
 * o título canônico ausente, nunca paga), executado num processo Node separado —
 * o `import()` de ESM dentro do worker do Playwright trava — e na loja QA (a CLI
 * do script fixa `loja-1`).
 */
function seedOficialTitulos(url: string) {
  const raiz = path.resolve(__dirname, "..", "..");
  const seed = pathToFileURL(path.join(raiz, "scripts", "seed-contas-receber-os.mjs")).href;
  const cliente = path.join(raiz, "generated", "prisma", "index.js");
  const codigo = [
    `import { createRequire } from "node:module";`,
    `const require = createRequire(import.meta.url);`,
    `const { PrismaClient } = require(${JSON.stringify(cliente)});`,
    `const { seedContasReceberOS } = await import(${JSON.stringify(seed)});`,
    `const db = new PrismaClient({ datasourceUrl: process.env.SEED_DB_URL });`,
    `try { await seedContasReceberOS(db, { storeId: ${JSON.stringify(LOJA)}, dryRun: false, log: () => {}, logError: (m) => console.error(m) }); }`,
    `finally { await db.$disconnect(); }`,
  ].join("\n");
  execFileSync(process.execPath, ["--input-type=module", "-e", codigo], {
    env: { ...process.env, SEED_DB_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
    timeout: 60_000,
  });
}

async function lerOS(prisma: PrismaClient, id: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as unknown as Payload;
}
const mudancas = (os: Payload) => os.timeline.filter((e) => e.tipo === "mudanca_status");

async function dinheiro(prisma: PrismaClient) {
  const [caixa, movimentos, vendas] = await Promise.all([
    prisma.caixaOperacao.count({ where: { storeId: LOJA } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId: LOJA } }),
    prisma.venda.count({ where: { storeId: LOJA } }),
  ]);
  const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId: LOJA }, select: { id: true, status: true, valor: true } });
  return { caixa, movimentos, vendas, titulos: titulos.sort((a, b) => a.id.localeCompare(b.id)) };
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

async function abrirOS(page: Page, codigo: string) {
  await abrirV4(page);
  await selecionarNaBusca(page, codigo);
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
}

async function trocarPara(page: Page, codigo: string) {
  await page.getByTitle("Mais ações").click();
  await page.getByRole("button", { name: "Trocar OS" }).click();
  await selecionarNaBusca(page, codigo);
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
}

const bloco = (page: Page) => page.getByRole("region", { name: "Próxima ação da OS" });
const pipeline = (page: Page) => page.getByRole("navigation", { name: "Pipeline operacional da OS" });
const etapa = (page: Page, nome: RegExp) => pipeline(page).getByRole("button", { name: nome });

async function semRolagemHorizontal(page: Page, alvo: Locator) {
  expect(await alvo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function capturar(page: Page, nome: string) {
  const alvo = bloco(page);
  for (const [largura, altura] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    await alvo.scrollIntoViewIfNeeded();
    await expect(alvo).toBeVisible();
    await semRolagemHorizontal(page, alvo);
    // O CTA (quando existe) nunca fica cortado.
    for (const botao of await alvo.getByRole("button").all()) {
      const caixa = await botao.boundingBox();
      expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, `${nome}@${largura}: CTA dentro da tela`).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`${nome}-${largura}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe.configure({ mode: "serial" });

let prisma: PrismaClient;
test.beforeAll(() => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

let osExecucao = { id: "", codigo: "" };

test("E01 — autorizada: próxima ação Iniciar execução; acionar muda o status uma única vez", async ({ page }) => {
  osExecucao = await semearOS(prisma, "aprovado");
  await abrirOS(page, osExecucao.codigo);
  await expect(etapa(page, /Execução/)).toHaveAttribute("aria-current", "step");
  await expect(bloco(page)).toHaveAttribute("data-acao", "iniciar-execucao");
  // Na Execução o controle real já existe: o bloco aponta, não duplica.
  await expect(bloco(page).getByText("Nesta etapa, logo abaixo")).toBeVisible();
  await expect(bloco(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Iniciar execução" })).toHaveCount(1);
  // Header sem CTA paralelo.
  await expect(page.getByRole("button", { name: /✦/ })).toHaveCount(0);
  await capturar(page, "e01-acao-na-etapa");

  // Fora da Execução, o bloco executa a MESMA escrita existente — duplo clique = uma escrita.
  await etapa(page, /Entrada/).click();
  await expect(page.getByText("Alterações não salvas", { exact: true })).toHaveCount(0);
  const cta = bloco(page).getByRole("button", { name: "Iniciar execução" });
  await expect(cta).toBeEnabled();
  await capturar(page, "e01-acao");
  await cta.dblclick();
  await expect.poll(async () => (await lerOS(prisma, osExecucao.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("em_execucao");
  await expect(bloco(page)).toHaveAttribute("data-acao", "marcar-pronta", { timeout: 30_000 });
  await expect(etapa(page, /Execução/)).toHaveAttribute("aria-current", "step");
  const os = await lerOS(prisma, osExecucao.id);
  expect(mudancas(os).filter((e) => e.metadata?.para === "em_execucao")).toHaveLength(1);
});

test("E01b — escrita a partir da Entrada com rascunho respeita a guarda do GOAL 001 (Cancelar não grava; Descartar grava uma vez)", async ({ page }) => {
  // Sem `recebidoPor` registrado, a Entrada abre com sugestão ainda não salva (rascunho sujo).
  const alvo = await semearOS(prisma, "aprovado", { semRecebidoPor: true });
  await abrirOS(page, alvo.codigo);
  await etapa(page, /Entrada/).click();
  await expect(page.getByText("Alterações não salvas", { exact: true })).toBeVisible();
  const guarda = page.getByRole("alertdialog", { name: "Alterações não salvas na Entrada" });

  await bloco(page).getByRole("button", { name: "Iniciar execução" }).click();
  await expect(guarda).toBeVisible();
  await guarda.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(guarda).toHaveCount(0);
  await expect(etapa(page, /Entrada/)).toHaveAttribute("aria-current", "step");
  expect((await lerOS(prisma, alvo.id)).operacaoStatusV3).toBe("aprovado");

  await bloco(page).getByRole("button", { name: "Iniciar execução" }).click();
  await expect(guarda).toBeVisible();
  await guarda.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect.poll(async () => (await lerOS(prisma, alvo.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("em_execucao");
  await expect(bloco(page)).toHaveAttribute("data-acao", "marcar-pronta", { timeout: 30_000 });
  expect(mudancas(await lerOS(prisma, alvo.id))).toHaveLength(1);
});

test("E03 — em execução: aponta à Execução; marcar pronta pelo caminho real da etapa", async ({ page }) => {
  await abrirOS(page, osExecucao.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "marcar-pronta");
  await etapa(page, /Entrada/).click();
  const cta = bloco(page).getByRole("button", { name: "Abrir execução" });
  await cta.click();
  await expect(etapa(page, /Execução/)).toHaveAttribute("aria-current", "step");
  // Navegar não marcou pronta.
  expect((await lerOS(prisma, osExecucao.id)).operacaoStatusV3).toBe("em_execucao");
  await page.getByRole("button", { name: "Marcar como pronta" }).click();
  await expect.poll(async () => (await lerOS(prisma, osExecucao.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("pronta");
  // Pronta sem cobrança registrada: a próxima ação depende do financeiro — nunca entrega às cegas.
  await expect(bloco(page)).not.toHaveAttribute("data-acao", /^(marcar-pronta|financeiro-carregando)$/, { timeout: 30_000 });
  await expect(bloco(page)).not.toHaveAttribute("data-acao", "confirmar-entrega");
  await expect(bloco(page).getByText(/Confirmar entrega/)).toHaveCount(0);
});

test("E02 — aguardando cliente: abre o orçamento e nada é aprovado", async ({ page }) => {
  const alvo = await semearOS(prisma, "aguardando_aprovacao", { orcamentoStatus: "enviado" });
  await abrirOS(page, alvo.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "aguardando-cliente");
  await expect(bloco(page)).toHaveAttribute("data-estado", "aguardando");
  await expect(bloco(page).getByText("Aguardando decisão do cliente")).toBeVisible();
  await capturar(page, "e02-aguardando");
  await bloco(page).getByRole("button", { name: "Abrir orçamento" }).click();
  await expect(page.getByTitle("Abrir orçamento")).toHaveAttribute("aria-current", "page");
  await expect(bloco(page).getByRole("button")).toHaveCount(0);
  const os = await lerOS(prisma, alvo.id);
  expect(os.operacaoStatusV3).toBe("aguardando_aprovacao");
  expect(os.orcamento?.status).toBe("enviado");
  expect(mudancas(os)).toHaveLength(0);
});

test("E04 — pronta com saldo: Receber pagamento leva ao Financeiro, sem pagar", async ({ page }) => {
  const alvo = await semearOS(prisma, "pronta");
  // Título canônico pelo helper OFICIAL do repositório (cria só o ausente, nunca paga).
  seedOficialTitulos(bancoDescartavel());
  expect(await prisma.contaReceberTitulo.count({ where: { storeId: LOJA, localKey: `os-faturamento:${LOJA}:${alvo.id}`, status: "pendente" } })).toBe(1);
  const antes = await dinheiro(prisma);
  await abrirOS(page, alvo.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "receber-pagamento", { timeout: 30_000 });
  await expect(bloco(page).getByText(/R\$\s?400,00/)).toBeVisible();
  await bloco(page).getByRole("button", { name: "Abrir financeiro" }).click();
  // Já no Financeiro: o bloco aponta o recebimento da própria etapa (sem botão próprio).
  await expect(bloco(page).getByText("Nesta etapa, logo abaixo")).toBeVisible();
  await expect(bloco(page).getByRole("button")).toHaveCount(0);
  expect(await dinheiro(prisma)).toEqual(antes);
  expect((await lerOS(prisma, alvo.id)).operacaoStatusV3).toBe("pronta");
});

test("E05 — pronta quitada: Confirmar entrega leva à Entrega, sem entregar", async ({ page }) => {
  const alvo = await semearOS(prisma, "pronta");
  await semearTitulo(prisma, alvo.id, "pago");
  const antes = await dinheiro(prisma);
  await abrirOS(page, alvo.codigo);
  await expect(etapa(page, /Entrega/)).toHaveAttribute("aria-current", "step");
  await expect(bloco(page)).toHaveAttribute("data-acao", "confirmar-entrega", { timeout: 30_000 });
  await expect(bloco(page).getByText("Nesta etapa, logo abaixo")).toBeVisible();
  await etapa(page, /Diagnóstico/).click();
  await bloco(page).getByRole("button", { name: "Abrir entrega" }).click();
  await expect(etapa(page, /Entrega/)).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Confirmar entrega real" })).toBeVisible();
  const os = await lerOS(prisma, alvo.id);
  expect(os.operacaoStatusV3).toBe("pronta");
  expect(os.entregueEm).toBeUndefined();
  expect(os.entregaV3).toBeUndefined();
  expect(await dinheiro(prisma)).toEqual(antes);
});

test("E06 — financeiro indisponível/inconsistente nunca oferece Confirmar entrega", async ({ page }) => {
  const cancelada = await semearOS(prisma, "pronta");
  await semearTitulo(prisma, cancelada.id, "cancelado");
  // Semeada antes da carga da lista (a V4 lê a lista uma vez ao abrir).
  const falha = await semearOS(prisma, "pronta");
  await semearTitulo(prisma, falha.id, "pago");
  await abrirOS(page, cancelada.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "revisar-financeiro", { timeout: 30_000 });
  await expect(bloco(page)).toHaveAttribute("data-estado", "bloqueada");
  await expect(bloco(page).getByText(/Confirmar entrega|Abrir entrega/)).toHaveCount(0);
  await capturar(page, "e06-revisar");

  // Leitura falhando (servidor recusa as leituras desta OS): estado seguro, sem entrega.
  await page.route("**/dashboard/operacoes-v4-preview**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes(falha.id)) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await trocarPara(page, falha.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", /^(erro-leitura-os|revisar-financeiro)$/, { timeout: 30_000 });
  await expect(bloco(page).getByText(/Confirmar entrega|Abrir entrega/)).toHaveCount(0);
  await page.unroute("**/dashboard/operacoes-v4-preview**");
});

test("E07 — entregue: fluxo concluído; pós-venda só por navegação", async ({ page }) => {
  const alvo = await semearOS(prisma, "entregue", { extra: { entregueEm: new Date().toISOString() } });
  await abrirOS(page, alvo.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "fluxo-concluido");
  await expect(bloco(page).getByText("Fluxo operacional concluído")).toBeVisible();
  await capturar(page, "e07-concluido");
  await expect(bloco(page).getByRole("button")).toHaveCount(1);
  await bloco(page).getByRole("button", { name: "Abrir pós-venda" }).click();
  await expect(etapa(page, /Pós-venda/)).toHaveAttribute("aria-current", "step");
  await expect(bloco(page).getByRole("button")).toHaveCount(0);
  expect(mudancas(await lerOS(prisma, alvo.id))).toHaveLength(0);
});

test("E08 — troca A→B com leitura de A pendente: a próxima ação de B permanece correta", async ({ page }) => {
  const a = await semearOS(prisma, "pronta");
  await semearTitulo(prisma, a.id, "pago");
  const b = await semearOS(prisma, "aguardando_aprovacao", { orcamentoStatus: "enviado" });

  let liberar: () => void = () => {};
  const portao = new Promise<void>((r) => { liberar = r; });
  const retidas: Request[] = [];
  await page.route("**/dashboard/operacoes-v4-preview**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes(a.id)) {
      retidas.push(req);
      await portao;
    }
    await route.continue();
  });

  await abrirV4(page);
  await selecionarNaBusca(page, a.codigo);
  await expect(page.getByRole("heading", { name: a.codigo })).toBeVisible();
  await expect.poll(() => retidas.length).toBeGreaterThan(0);
  // Leituras de A retidas: nunca "Confirmar entrega" por suposição.
  await expect(bloco(page)).toHaveAttribute("data-acao", "financeiro-carregando");

  await trocarPara(page, b.codigo);
  await expect(bloco(page)).toHaveAttribute("data-acao", "aguardando-cliente", { timeout: 30_000 });
  const respostas = retidas.map((req) => page.waitForResponse((resp) => resp.request() === req));
  liberar();
  await Promise.all(respostas);
  // As respostas de A chegaram: B continua com a ação de B, na etapa de B.
  await expect(page.getByRole("heading", { name: b.codigo })).toBeVisible();
  await expect(bloco(page)).toHaveAttribute("data-acao", "aguardando-cliente");
  await expect(etapa(page, /Diagnóstico/)).toHaveAttribute("aria-current", "step");
  await expect(page.getByText(/Confirmar entrega/)).toHaveCount(0);
  await page.unroute("**/dashboard/operacoes-v4-preview**");
});
