import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "../../generated/prisma";

// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 — recebimento seguro, aprovação comercial e
// regularização controlada, no app real (build de produção local).
// Servidor QA isolado + PostgreSQL local DESCARTÁVEL (ops_v4_frg_qa*) + login QA real (ADMIN
// sintético). Massa sintética; a prova é feita pelo BANCO (orçamento, título, caixa, timeline).
// Sem sleep, skip, fixme, retry, .first() arbitrário, catch que engole falha ou reload que
// mascara race. As decisões concorrentes e de permissão estão provadas no .pg.test.ts.

test.use({ serviceWorkers: "block" });

const LOJA = "000-qa-frg-001";
/**
 * Espera de um ESTADO que depende de várias idas ao servidor encadeadas (salvar → reler →
 * abrir → conferir; aprovar → receber → reler). Sob máquina carregada passa dos 25 s padrão;
 * continua sendo espera pelo fato, nunca um tempo fixo.
 */
const IDA_E_VOLTA = { timeout: 60_000 };
const ENTRADA = "2026-09-18T12:00:00.000Z";

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E FRG-002 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E FRG-002 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v4_frg_qa")) {
    throw new Error("E2E FRG-002 exige URLs idênticas do banco descartável ops_v4_frg_qa*.");
  }
  return urls[0]!;
}

let seq = 0;
const marca = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;

type Orc = "rascunho" | "aprovado" | null;

/** OS pronta com orçamento no status pedido (ou sem orçamento) e, opcional, título liquidado pela MESMA operação. */
async function semearOS(prisma: PrismaClient, orc: Orc, pago: boolean): Promise<{ id: string; codigo: string }> {
  const m = marca();
  const id = `qa-frg2-${m}`;
  const codigo = `OS-QA-FRG2-${m}`;
  const operacaoId = `op-qa-frg2-${m}`;
  const quitacao = {
    id: `ev-quit-${m}`, tipo: "operacao_cobranca_gerada", autor: "Operador QA FRG2", autorTipo: "usuario",
    conteudo: "Quitação: Dinheiro R$ 420,00 (total R$ 420.00) · saldo R$ 0.00 (quitado).", criadoEm: "2026-10-05T21:37:38.000Z",
    metadata: { operacaoId, total: 420, linhas: [{ forma: "dinheiro", valor: 420 }], op: "liquidar", intencao: "quitacao" },
  };
  await prisma.ordemServico.create({
    data: {
      id, storeId: LOJA, numero: codigo, status: "Pronto", equipamento: "Samsung S20 FE", defeito: "Tela quebrada", valorTotal: 420,
      payload: {
        id, codigo, storeId: LOJA, clienteId: "", criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
        pecas: [], observacoes: [], anexos: [],
        cliente: { id: "", nome: `Cliente QA FRG2 ${m}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE", defeitoRelatado: "Tela quebrada", acessorios: ["Capa"] },
        status: "pronta", operacaoStatus: "pronta", operacaoStatusV3: "pronta", valorTotal: 420,
        ...(orc
          ? {
              orcamento: {
                id: `orc-${m}`, status: orc, sintetizado: false, criadoEm: ENTRADA, ...(orc === "aprovado" ? { respondidoEm: ENTRADA } : {}),
                desconto: 0, total: 420, servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 420 }], pecas: [],
              },
            }
          : {}),
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
        storeId: LOJA, localKey: `os-faturamento:${LOJA}:${id}`, descricao: `OS ${codigo}`, cliente: `Cliente QA FRG2 ${m}`, valor: 420,
        vencimento: "2026-10-05", status: "pago",
        payload: { origem: "operacoes-v3", ordemServicoId: id, codigo, historico: [{ tipo: "liquidacao", valor: 420, loteId: operacaoId, at: "2026-10-05T21:37:39.000Z", userLabel: "Operador QA FRG2" }] } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return { id, codigo };
}

type Evento = { tipo: string; metadata?: Record<string, unknown> };
type PayloadOS = Record<string, unknown> & { orcamento?: { status?: string }; operacaoStatusV3?: string; valorTotal?: number; timeline: Evento[] };

const localKeyDe = (osId: string) => `os-faturamento:${LOJA}:${osId}`;
const titulosDe = (prisma: PrismaClient, osId: string) =>
  prisma.contaReceberTitulo.findMany({ where: { storeId: LOJA, localKey: localKeyDe(osId) }, select: { id: true, status: true, valor: true, payload: true } });
/** Lançamentos de caixa da OS na sessão aberta do QA (o recebimento imediato entra nela). */
const caixaDaOS = (prisma: PrismaClient, osId: string) =>
  prisma.caixaOperacao.findMany({ where: { storeId: LOJA, sessaoId, payload: { path: ["ordemServicoId"], equals: osId } }, select: { tipo: true, valor: true, payload: true } });
async function linhaOS(prisma: PrismaClient, osId: string) {
  const row = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true, status: true, valorTotal: true } });
  return { ...row, payload: row.payload as unknown as PayloadOS };
}

async function efeitos(prisma: PrismaClient, osId: string) {
  const [os, titulos, caixa] = await Promise.all([
    prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true, status: true, valorTotal: true } }),
    titulosDe(prisma, osId),
    prisma.caixaOperacao.count({ where: { storeId: LOJA } }),
  ]);
  return JSON.stringify({ os, titulos, caixa });
}

async function abrirV4(page: Page) {
  const lojas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/stores" && r.ok());
  const ordens = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
  await page.goto("/dashboard/operacoes-v4-preview");
  await Promise.all([lojas, ordens]);
  // A loja ativa é gravada depois da resposta de /api/stores: espera o fato, não um tempo.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(LOJA);
}

async function abrirOS(page: Page, codigo: string) {
  await abrirV4(page);
  const busca = page.getByRole("main").getByRole("textbox", { name: "Buscar por Nº da OS, cliente, aparelho ou IMEI…", exact: true });
  await expect(busca).toHaveCount(1);
  await busca.fill(codigo);
  const seletor = page.getByRole("button", { name: new RegExp(codigo) });
  await expect(seletor).toHaveCount(1);
  await seletor.click();
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
}

const pipeline = (page: Page) => page.getByRole("navigation", { name: "Pipeline operacional da OS" });
const etapa = (page: Page, nome: RegExp) => pipeline(page).getByRole("button", { name: nome });
const guia = (page: Page) => page.getByRole("region", { name: "Guia de retirada" });
const ticketComercial = (page: Page) => page.getByRole("button", { name: /^Comercial/ });
const ticketFinanceiro = (page: Page) => page.getByRole("button", { name: /^Financeiro/ });

async function abrirComercial(page: Page) {
  await ticketComercial(page).click();
  await expect(ticketComercial(page)).toHaveAttribute("aria-current", "page");
}

async function semRolagemHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.configure({ mode: "serial" });

let prisma: PrismaClient;
let sessaoId: string;

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const aberta = await prisma.sessaoCaixa.findFirst({ where: { storeId: LOJA, status: "ABERTA" }, orderBy: { abertaEm: "desc" } });
  sessaoId = (aberta ?? (await prisma.sessaoCaixa.create({ data: { storeId: LOJA, status: "ABERTA", operador: "QA FRG2" } }))).id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.beforeEach(async ({ page }) => {
  // Cada cenário encadeia vários envios reais ao servidor (como as specs de recebimento misto).
  test.setTimeout(240_000);
  // O assistente de primeira loja abre por cima de forma assíncrona: dispensado nesta sessão QA antes da hidratação.
  await page.addInitScript((loja) => sessionStorage.setItem(`@omnigestao:first-access-wizard:dismissed:${loja}`, "1"), LOJA);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("C+E — rascunho sem pagamento: conferir → aprovar expressamente → receber com forma escolhida; uma cobrança, sem iniciar serviço nem entregar", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", false);
  await abrirOS(page, os.codigo);
  await abrirComercial(page);
  await expect(page.getByTestId("formalizar-aprovacao")).toHaveCount(0);
  const aprovarEReceber = page.getByRole("button", { name: "Aprovar e receber", exact: true });
  await expect(aprovarEReceber).toBeEnabled();
  await aprovarEReceber.click();

  const sheet = page.getByRole("dialog", { name: "Aprovar e receber" });
  await expect(sheet).toBeVisible(IDA_E_VOLTA);
  const escopo = sheet.getByTestId("aprovar-e-receber-escopo");
  await expect(escopo).toContainText(/Troca de Tela — R\$\s420,00/, IDA_E_VOLTA);
  await expect(escopo).toContainText(/Total do orçamento\s*R\$\s420,00/);
  await expect(escopo).toContainText("A aprovação não inicia o serviço nem entrega o aparelho.");
  const forma = sheet.getByLabel("Forma da linha 1");
  await expect(forma).toHaveValue("");
  const confirmar = sheet.getByRole("button", { name: /^(Escolha a forma de pagamento|Aprovar e receber R\$\s420,00)$/ });
  await expect(confirmar).toHaveText("Escolha a forma de pagamento");
  await expect(confirmar).toBeDisabled();
  await forma.selectOption("pix");
  await expect(confirmar).toHaveText(/^Aprovar e receber R\$\s420,00$/);
  await expect(confirmar).toBeDisabled();
  await sheet.getByLabel("O cliente aprovou este orçamento").check();
  await expect(confirmar).toBeEnabled();
  await sheet.screenshot({ path: test.info().outputPath("c-aprovar-e-receber-1440.png") });
  // Nada gravado antes da confirmação (o salvar do editor não aprova nem cobra).
  expect((await linhaOS(prisma, os.id)).payload.orcamento?.status).toBe("rascunho");
  expect(await titulosDe(prisma, os.id)).toHaveLength(0);

  await confirmar.click();
  await expect(sheet).toBeHidden(IDA_E_VOLTA);
  await expect.poll(async () => (await titulosDe(prisma, os.id)).map((t) => [t.status, t.valor])).toEqual([["pago", 420]]);
  const [titulo] = await titulosDe(prisma, os.id);
  const historico = ((titulo!.payload as { historico?: Array<{ tipo: string; valor: number }> }).historico ?? []).filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao");
  expect(historico.map((e) => e.valor)).toEqual([420]);
  const caixa = await caixaDaOS(prisma, os.id);
  expect(caixa.map((c) => [c.valor, (c.payload as { formaPagamento?: string }).formaPagamento])).toEqual([[420, "pix"]]);
  const depois = await linhaOS(prisma, os.id);
  expect(depois.payload.orcamento?.status).toBe("aprovado");
  expect(depois.payload.operacaoStatusV3).toBe("pronta");
  expect(depois.payload.timeline.filter((e) => e.tipo === "orcamento_aprovado")).toHaveLength(1);
  expect(depois.payload.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(0);

  const recibo = page.getByText("🧾 Recibo de pagamento", { exact: true });
  await expect(recibo).toBeVisible(IDA_E_VOLTA);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await etapa(page, /Entrega/).click();
  await expect(guia(page).getByText("Pagamento quitado — confirmar entrega.")).toBeVisible();
  await expect(page.getByText("Aprovação comercial pendente", { exact: false })).toHaveCount(0);
});

test("C — aprovação recusada no servidor (o orçamento mudou depois da conferência): o motivo aparece no sheet e nada é cobrado", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", false);
  await abrirOS(page, os.codigo);
  await abrirComercial(page);
  await page.getByRole("button", { name: "Aprovar e receber", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Aprovar e receber" });
  await expect(sheet).toBeVisible(IDA_E_VOLTA);
  await sheet.getByLabel("Forma da linha 1").selectOption("pix");
  await sheet.getByLabel("O cliente aprovou este orçamento").check();
  // Outra sessão recusa o orçamento depois que este operador conferiu o escopo.
  const atual = await linhaOS(prisma, os.id);
  await prisma.ordemServico.update({
    where: { id: os.id },
    data: { payload: { ...atual.payload, orcamento: { ...atual.payload.orcamento, status: "recusado" } } as unknown as Prisma.InputJsonValue },
  });
  await sheet.getByRole("button", { name: /^Aprovar e receber R\$\s420,00$/ }).click();
  await expect(sheet.getByRole("alert").filter({ hasText: "Não é possível aprovar um orçamento com status \"recusado\"." })).toBeVisible(IDA_E_VOLTA);
  expect(await titulosDe(prisma, os.id)).toHaveLength(0);
  expect(await caixaDaOS(prisma, os.id)).toHaveLength(0);
  expect((await linhaOS(prisma, os.id)).payload.orcamento?.status).toBe("recusado");
});

test("D — rascunho + título liquidado: formalização administrativa com motivo e declaração; preço, título, caixa e status preservados", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", true);
  const tituloAntes = JSON.stringify(await titulosDe(prisma, os.id));
  const caixaAntes = await prisma.caixaOperacao.count({ where: { storeId: LOJA } });
  await abrirOS(page, os.codigo);
  await abrirComercial(page);

  const card = page.getByTestId("formalizar-aprovacao");
  await expect(card).toContainText("Pagamento registrado com aprovação pendente");
  await expect(page.getByRole("button", { name: "Salvar e aprovar orçamento" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Aprovar e receber", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Formalizar aprovação pendente" }).click();

  const grupo = page.getByRole("group", { name: "Formalizar aprovação pendente" });
  await expect(grupo.getByText("Escopo conferido no servidor")).toBeVisible(IDA_E_VOLTA);
  await expect(grupo).toContainText(/Troca de Tela — R\$\s420,00/);
  await expect(grupo).toContainText(/Total do orçamento: R\$\s420,00/);
  await expect(grupo).toContainText(/Recebido vigente: R\$\s420,00/);
  const formalizar = grupo.getByRole("button", { name: "Formalizar aprovação" });
  await expect(formalizar).toBeDisabled();
  await grupo.getByLabel("Motivo da formalização").fill("Cliente aprovou por telefone antes do serviço; registro regularizado agora.");
  await expect(formalizar).toBeDisabled();
  await grupo.getByLabel("Declaração do responsável").check();
  await expect(formalizar).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("d-formalizacao-1440.png"), fullPage: false });
  expect((await linhaOS(prisma, os.id)).payload.orcamento?.status).toBe("rascunho");

  await formalizar.click();
  // Aprovado, o orçamento sai do editor e o cartão sai com ele.
  await expect(page.getByTestId("formalizar-aprovacao")).toHaveCount(0, IDA_E_VOLTA);
  await expect.poll(async () => (await linhaOS(prisma, os.id)).payload.orcamento?.status).toBe("aprovado");
  const depois = await linhaOS(prisma, os.id);
  expect(depois.payload.formalizacaoAprovacaoV3).toMatchObject({
    natureza: "formalizacao_aprovacao_pendente",
    atoAtual: true,
    orcamentoStatusAnterior: "rascunho",
    motivo: "Cliente aprovou por telefone antes do serviço; registro regularizado agora.",
    escopo: { orcamento: { totalCentavos: 42000 }, titulo: { valorCentavos: 42000 }, recebidoLiquidoCentavos: 42000 },
  });
  const aprovacoes = depois.payload.timeline.filter((e) => e.tipo === "orcamento_aprovado");
  expect(aprovacoes).toHaveLength(1);
  expect(aprovacoes[0]!.metadata).toMatchObject({ natureza: "formalizacao_aprovacao_pendente", formalizacao: true });
  expect(JSON.stringify(await titulosDe(prisma, os.id))).toBe(tituloAntes);
  expect(await prisma.caixaOperacao.count({ where: { storeId: LOJA } })).toBe(caixaAntes);
  expect(depois.valorTotal).toBe(420);
  expect(depois.payload.valorTotal).toBe(420);
  expect(depois.payload.operacaoStatusV3).toBe("pronta");
  expect(depois.payload.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(0);

  // A pendência comercial deixa de impedir a retirada; nada além disso mudou.
  await etapa(page, /Entrega/).click();
  await expect(guia(page).getByText("Pagamento quitado — confirmar entrega.")).toBeVisible();
  await expect(page.getByText("Aprovação comercial pendente", { exact: false })).toHaveCount(0);
});

test("E — orçamento aprovado sem pagamento: o sheet abre sem forma; confirmar exige a escolha; dividir não herda forma", async ({ page }) => {
  const os = await semearOS(prisma, "aprovado", false);
  await abrirOS(page, os.codigo);
  await ticketFinanceiro(page).click();
  await page.getByRole("button", { name: /^Receber R\$\s420,00$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Receber pagamento" });
  await expect(sheet).toBeVisible();
  const forma1 = sheet.getByLabel("Forma da linha 1");
  await expect(forma1).toHaveValue("");
  await expect(forma1.locator("option")).toHaveText(["Escolha a forma", "Dinheiro", "PIX", "Débito", "Crédito", "A prazo / crediário"]);
  const confirmar = sheet.getByRole("button", { name: /^(Escolha a forma de pagamento|Confirmar R\$\s420,00)$/ });
  await expect(confirmar).toHaveText("Escolha a forma de pagamento");
  await expect(confirmar).toBeDisabled();
  await sheet.getByRole("button", { name: "+ Dividir pagamento" }).click();
  await expect(sheet.getByLabel("Forma da linha 2")).toHaveValue("");
  await sheet.getByRole("button", { name: "Remover forma 2" }).click();
  await expect(sheet.getByLabel("Forma da linha 2")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet).toBeVisible();
  await semRolagemHorizontal(page);
  await sheet.screenshot({ path: test.info().outputPath("e-sem-forma-390.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await titulosDe(prisma, os.id)).toHaveLength(0);

  await forma1.selectOption("dinheiro");
  await expect(confirmar).toHaveText(/^Confirmar R\$\s420,00$/);
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(sheet).toBeHidden(IDA_E_VOLTA);
  await expect.poll(async () => (await titulosDe(prisma, os.id)).map((t) => [t.status, t.valor])).toEqual([["pago", 420]]);
  const caixa = await caixaDaOS(prisma, os.id);
  expect(caixa.map((c) => [c.valor, (c.payload as { formaPagamento?: string }).formaPagamento])).toEqual([[420, "dinheiro"]]);
});

test("B — pagamento registrado sem orçamento real: 'Gerar orçamento' orienta e nada é materializado", async ({ page }) => {
  const os = await semearOS(prisma, null, true);
  const antes = await efeitos(prisma, os.id);
  await abrirOS(page, os.codigo);
  await abrirComercial(page);
  const gerar = page.getByRole("button", { name: "Gerar orçamento", exact: true });
  await expect(gerar).toHaveCount(1);
  // A orientação sai num toast efêmero (1,9 s): um observador registra todo texto que aparece,
  // para a prova não depender de a amostragem coincidir com a janela do toast.
  await page.evaluate(() => {
    const w = window as unknown as { __textosVistosFrg2: string[] };
    w.__textosVistosFrg2 = [];
    new MutationObserver(() => w.__textosVistosFrg2.push(document.body.innerText)).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await gerar.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __textosVistosFrg2: string[] }).__textosVistosFrg2.some((t) => t.includes("Esta OS já tem pagamento registrado: um novo orçamento em rascunho deixaria esse pagamento sem aprovação comercial."))), IDA_E_VOLTA)
    .toBe(true);
  await expect(gerar).toBeEnabled();
  expect(await efeitos(prisma, os.id)).toBe(antes);
});

test("A — PDV de Serviço V3: rascunho sem pagamento mostra a recusa comercial e não deixa receber; nada é gravado", async ({ page }) => {
  const os = await semearOS(prisma, "rascunho", false);
  const antes = await efeitos(prisma, os.id);
  await page.goto("/dashboard/operacoes-v3");
  // UI pronta antes do clique: a árvore remonta quando a loja ativa resolve (E2E da V3).
  await expect(page.getByRole("heading", { name: "Precisa de atenção", exact: true })).toBeVisible();
  const aba = page.getByRole("navigation", { name: "Operações" }).getByRole("button", { name: "Receber", exact: true });
  await expect(aba).toBeVisible();
  await aba.click();
  await expect(aba).toHaveAttribute("aria-current", "page");
  const seletor = page.getByRole("combobox").filter({ has: page.locator(`option[value="${os.id}"]`) });
  await seletor.selectOption(os.id);
  await expect(page.getByRole("heading", { name: new RegExp(`^${os.codigo} · `) })).toBeVisible();
  const recusa = page.getByTestId("recusa-comercial");
  await expect(recusa).toContainText("Recebimento recusado: o orçamento ainda não foi aprovado. Confira e aprove o orçamento antes de receber.");
  await expect(recusa.getByRole("button", { name: "Abrir o orçamento no prontuário da OS →" })).toBeVisible();
  await page.getByRole("button", { name: "PIX", exact: true }).click();
  const receber = page.getByRole("button", { name: /^(Quitar OS|Receber) · R\$/ });
  await expect(receber).toHaveCount(1);
  await expect(receber).toBeDisabled();
  expect(await efeitos(prisma, os.id)).toBe(antes);
});


for (const modalidade of ["imediato", "misto"] as const) {
  test(`R7 — ${modalidade}: commit com resposta perdida sobrevive a fechar/reabrir e refresh; verificar repete a identidade original`, async ({ page }) => {
    const os = await semearOS(prisma, "aprovado", false);
    await abrirOS(page, os.codigo); await ticketFinanceiro(page).click();
    await page.getByRole("button", { name: /^Receber R\$\s420,00$/ }).click();
    let sheet = page.getByRole("dialog", { name: "Receber pagamento" });
    await sheet.getByRole("button", { name: "Pagamento parcial", exact: true }).click();
    await sheet.getByLabel("Forma da linha 1").selectOption("pix");
    await sheet.getByLabel("Valor da linha 1").fill("100");
    if (modalidade === "misto") {
      await sheet.getByRole("button", { name: "+ Dividir pagamento" }).click();
      await sheet.getByLabel("Forma da linha 2").selectOption("a_prazo");
      await sheet.getByLabel("Vencimento da parte a prazo").fill("2099-12-31");
    }
    const envios: string[] = [];
    let perdeu = false;
    await page.route("**/*", async (route) => {
      const request = route.request(), body = request.postData() ?? "";
      const writer = request.method() === "POST" && !!request.headers()["next-action"] && body.includes(os.id) && body.includes('"confirmacaoClienteV3":true') && body.includes(modalidade === "imediato" ? '"linhas"' : '"pagamentosAgora"');
      if (!writer) { await route.continue(); return; }
      envios.push(body);
      if (perdeu) { await route.continue(); return; }
      perdeu = true;
      // route.fetch termina a resposta REAL depois do commit; só a entrega ao browser se perde.
      const resposta = await route.fetch(); expect(resposta.ok()).toBe(true);
      await route.abort("connectionclosed");
    });
    await sheet.getByRole("button", { name: modalidade === "misto" ? /^Registrar R\$\s100,00/ : /^Confirmar R\$\s100,00$/ }).click();
    await expect(sheet.getByRole("alert")).toContainText("Confirmação pendente de verificação.", IDA_E_VOLTA);
    await expect.poll(() => envios.length).toBe(1);
    const antes = JSON.stringify({ titulos: await titulosDe(prisma, os.id), caixa: await caixaDaOS(prisma, os.id) });
    await sheet.getByRole("button", { name: "Fechar recebimento" }).click();
    await page.getByRole("button", { name: "Verificar mesma confirmação", exact: true }).click();
    sheet = page.getByRole("dialog", { name: "Receber pagamento" });
    await expect(sheet.getByLabel("Forma da linha 1")).toBeDisabled();
    await expect(sheet.getByLabel("Forma da linha 1")).toHaveValue("pix");
    await page.reload();
    await abrirOS(page, os.codigo); await ticketFinanceiro(page).click();
    await page.getByRole("button", { name: "Verificar mesma confirmação", exact: true }).click();
    sheet = page.getByRole("dialog", { name: "Receber pagamento" });
    await expect(sheet.getByLabel("Valor da linha 1")).toHaveValue("100");
    await expect(sheet.getByRole("button", { name: "+ Dividir pagamento" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Verificar mesma confirmação", exact: true }).click();
    await expect(sheet).toBeHidden(IDA_E_VOLTA);
    expect(envios).toHaveLength(2); expect(JSON.parse(envios[1]!)).toEqual(JSON.parse(envios[0]!));
    expect(JSON.stringify({ titulos: await titulosDe(prisma, os.id), caixa: await caixaDaOS(prisma, os.id) })).toBe(antes);
    const titulo = (await titulosDe(prisma, os.id))[0]!;
    const historico = ((titulo.payload as { historico: Array<{ tipo: string; valor: number }> }).historico).filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao");
    expect(historico.map((e) => e.valor)).toEqual([100]);
    expect(await prisma.ordemServico.count({ where: { id: os.id, storeId: LOJA } })).toBe(1);
    expect((await linhaOS(prisma, os.id)).payload.confirmacaoRecebimentoPendenteV3).toBeUndefined();
  });
}
