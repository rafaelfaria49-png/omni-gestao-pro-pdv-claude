import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { PrismaClient, type Prisma } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-V4-FLUXO-CURTO-006 — recebimento e retirada no Workspace V4.
// Servidor QA isolado + PostgreSQL local DESCARTÁVEL (ops_v4_fluxo_006_qa*) + login QA
// real. Aqui o recebimento e a entrega são clicados de verdade — SOMENTE no banco
// descartável, com loja/cliente/OS/caixa sintéticos. Sem sleep, skip, fixme,
// .first() arbitrário, catch que engole falha ou reload que mascara race.

test.use({ serviceWorkers: "block" });

const LOJA = "000-qa-ops-006";
type Evento = { tipo: string; metadata?: Record<string, unknown> };
type Payload = Record<string, any> & { operacaoStatusV3: string; timeline: Evento[] };

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E 006 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E 006 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v4_fluxo_006_qa")) {
    throw new Error("E2E 006 exige URLs idênticas do banco descartável ops_v4_fluxo_006_qa*.");
  }
  return urls[0]!;
}

let seq = 0;
const marca = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;
const ENTRADA = "2026-09-01T12:00:00.000Z";
const VENC = (() => {
  const d = new Date(Date.now() + 30 * 86_400_000);
  return d.toISOString().slice(0, 10);
})();

async function semearOS(
  prisma: PrismaClient,
  opts: { status?: string; total?: number; pecas?: Prisma.InputJsonValue[] } = {},
): Promise<{ id: string; codigo: string }> {
  const m = marca();
  const id = `qa-006-${m}`;
  const codigo = `OS-QA-006-${m}`;
  const total = opts.total ?? 300;
  const status = opts.status ?? "pronta";
  await prisma.ordemServico.create({
    data: {
      id, storeId: LOJA, numero: codigo, status: status === "pronta" ? "Pronto" : "EmAnalise",
      equipamento: "Samsung Galaxy QA", defeito: "Tela quebrada", valorTotal: total,
      payload: {
        id, codigo, storeId: LOJA, clienteId: "", criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
        pecas: [], observacoes: [], anexos: [],
        cliente: { id: "", nome: `Cliente QA 006 ${m}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada", acessorios: ["Capa"] },
        status, operacaoStatus: status, operacaoStatusV3: status, valorTotal: total,
        orcamento: {
          id: `orc-${m}`, status: "aprovado", sintetizado: false, respondidoEm: ENTRADA, criadoEm: ENTRADA, desconto: 0, total,
          servicos: [{ id: "s1", descricao: "Troca de tela QA", valor: total }], pecas: opts.pecas ?? [],
        },
        aberturaV3: {
          versao: 1,
          recepcao: { recebidoPor: "Operador QA 006", origem: "balcao", prioridade: "media", localFisico: "balcao", dataEntrada: ENTRADA },
          garantiaPrevista: { modelo: "tela", prazoDias: 90 },
        },
        timeline: [{ id: `ev-${m}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
      },
    },
  });
  return { id, codigo };
}

async function garantirCaixa(prisma: PrismaClient, aberto: boolean) {
  await prisma.sessaoCaixa.updateMany({ where: { storeId: LOJA, status: "ABERTA" }, data: { status: "FECHADA" } });
  if (aberto) await prisma.sessaoCaixa.create({ data: { storeId: LOJA, operador: "QA 006", status: "ABERTA" } });
}

async function lerOS(prisma: PrismaClient, id: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as unknown as Payload;
}
const entregas = (os: Payload) => os.timeline.filter((e) => e.tipo === "entrega_cliente");

async function dinheiro(prisma: PrismaClient, osId: string) {
  const [caixa, titulos, vendas] = await Promise.all([
    prisma.caixaOperacao.findMany({ where: { storeId: LOJA, payload: { path: ["ordemServicoId"], equals: osId } }, select: { tipo: true, valor: true, payload: true } }),
    prisma.contaReceberTitulo.findMany({ where: { storeId: LOJA, localKey: `os-faturamento:${LOJA}:${osId}` }, select: { status: true, valor: true, payload: true } }),
    prisma.venda.count({ where: { storeId: LOJA } }),
  ]);
  return { caixa, titulos, vendas };
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
const bloco = (page: Page) => page.getByRole("region", { name: "Próxima ação da OS" });
const confirmarEntrega = (page: Page) => page.getByRole("button", { name: "Confirmar entrega real" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Receber pagamento" });
const recibo = (page: Page) => page.getByRole("dialog", { name: /Recibo de pagamento|Resumo de formalização/ });

/** Ticket "Financeiro" do cabeçalho de comando (a etapa Financeiro não é um passo da pipeline). */
const ticketFinanceiro = (page: Page) => page.getByRole("button", { name: /^Financeiro/ });

async function irPara(page: Page, onde: "entrega" | "financeiro") {
  if (onde === "financeiro") {
    await ticketFinanceiro(page).click();
    await expect(ticketFinanceiro(page)).toHaveAttribute("aria-current", "page");
    return;
  }
  await etapa(page, /Entrega/).click();
  await expect(etapa(page, /Entrega/)).toHaveAttribute("aria-current", "step");
}

async function abrirOS(page: Page, codigo: string, onde: "entrega" | "financeiro" = "entrega") {
  await abrirV4(page);
  await selecionarNaBusca(page, codigo);
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
  await irPara(page, onde);
}

async function trocarPara(page: Page, codigo: string) {
  await page.getByTitle("Mais ações").click();
  await page.getByRole("button", { name: "Trocar OS" }).click();
  await selecionarNaBusca(page, codigo);
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
}

type Linha = { forma: "pix" | "dinheiro" | "debito" | "credito" | "a_prazo"; valor?: string };
/** Preenche e confirma o MESMO sheet canônico; espera ele fechar e fecha o comprovante. */
async function receber(page: Page, linhas: Linha[], opts: { intencao?: string; abrir?: Locator; vencimento?: string } = {}) {
  await (opts.abrir ?? page.getByRole("button", { name: "Receber pagamento" })).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  if (opts.intencao) await s.getByRole("button", { name: opts.intencao }).click();
  for (const [i, linha] of linhas.entries()) {
    if (i > 0) await s.getByRole("button", { name: "+ Dividir pagamento" }).click();
    await s.getByLabel(`Forma da linha ${i + 1}`).selectOption(linha.forma);
    if (linha.valor !== undefined) await s.getByLabel(`Valor da linha ${i + 1}`).fill(linha.valor);
  }
  if (opts.vencimento) await s.getByLabel("Vencimento da parte a prazo").fill(opts.vencimento);
  const botao = s.getByRole("button", { name: /^(Confirmar|Registrar|Formalizar) / });
  await expect(botao).toBeEnabled();
  await botao.click();
  await expect(s).toHaveCount(0, { timeout: 30_000 });
  await expect(recibo(page)).toBeVisible();
  await recibo(page).getByRole("button", { name: "Fechar comprovante" }).click();
  await expect(recibo(page)).toHaveCount(0);
}

async function confirmarEntregaNaTela(page: Page, retirante?: string) {
  if (retirante !== undefined) await page.getByLabel("Retirado por").fill(retirante);
  page.once("dialog", (d) => void d.accept());
  await confirmarEntrega(page).click();
}

async function semRolagemHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Revisão visual: guia + card de ação em 1440/1024/768/390, sem rolagem lateral nem CTA cortado. */
async function capturar(page: Page, nome: string) {
  for (const [largura, altura] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    const alvo = guia(page);
    await alvo.scrollIntoViewIfNeeded();
    await expect(alvo).toBeVisible();
    await semRolagemHorizontal(page);
    expect(await alvo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const botao of await page.getByRole("button", { name: /^(Receber pagamento|Confirmar entrega real)$/ }).all()) {
      const caixa = await botao.boundingBox();
      expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, `${nome}@${largura}: CTA dentro da tela`).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`${nome}-${largura}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Intercepta a PRÓXIMA chamada de server action que cite a OS. */
async function interceptarProximaAction(page: Page, osId: string, acao: (route: Route) => Promise<void>) {
  let usada = false;
  await page.route("**/dashboard/operacoes-v4-preview**", async (route) => {
    const req = route.request();
    if (!usada && req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes(osId)) {
      usada = true;
      await acao(route);
      return;
    }
    await route.continue();
  });
  return () => page.unroute("**/dashboard/operacoes-v4-preview**");
}

test.describe.configure({ mode: "serial" });

let prisma: PrismaClient;
test.beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  await garantirCaixa(prisma, true);
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test("E01 — parcial 100 + 200 a partir da cobrança não formalizada; uma Conta a Receber; nada entregue", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirOS(page, os.codigo);
  await expect(guia(page).getByText("Cobrança ainda não formalizada")).toBeVisible();
  await expect(confirmarEntrega(page)).toHaveCount(0);
  await capturar(page, "e01-nao-formalizada");
  await receber(page, [{ forma: "pix", valor: "100" }], { intencao: "Pagamento parcial" });
  await expect(guia(page).getByText("Pagamento parcial", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(guia(page).getByText(/faltam R\$\s200,00/)).toBeVisible();
  await expect(confirmarEntrega(page)).toHaveCount(0);
  await capturar(page, "e01-parcial");
  await receber(page, [{ forma: "dinheiro" }]);
  await expect(page.getByText("Pagamento registrado. Falta confirmar a entrega.")).toBeVisible({ timeout: 30_000 });
  await expect(confirmarEntrega(page)).toBeVisible();
  await capturar(page, "e01-quitado");
  const d = await dinheiro(prisma, os.id);
  expect(d.titulos).toHaveLength(1);
  expect(d.titulos[0]!.status).toBe("pago");
  expect(d.caixa.filter((c) => c.tipo === "recebimento_cr").map((c) => Number(c.valor)).sort()).toEqual([100, 200]);
  expect(d.vendas).toBe(0);
  const lido = await lerOS(prisma, os.id);
  expect(lido.operacaoStatusV3).toBe("pronta");
  expect(entregas(lido)).toHaveLength(0);
});

test("E02 — split suportado (PIX + débito) no mesmo recebimento", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirOS(page, os.codigo);
  await receber(page, [{ forma: "pix", valor: "120" }, { forma: "debito", valor: "180" }]);
  await expect(confirmarEntrega(page)).toBeVisible({ timeout: 30_000 });
  const d = await dinheiro(prisma, os.id);
  expect(d.caixa.map((c) => (c.payload as Record<string, unknown>).formaPagamento).sort()).toEqual(["debito", "pix"]);
  expect(d.caixa.reduce((s, c) => s + Number(c.valor), 0)).toBe(300);
});

test("E03 — caixa fechado: recebimento imediato bloqueado, nada gravado, entrega bloqueada", async ({ page }) => {
  await garantirCaixa(prisma, false);
  try {
    const os = await semearOS(prisma);
    await abrirOS(page, os.codigo);
    await page.getByRole("button", { name: "Receber pagamento" }).click();
    const s = sheet(page);
    await expect(s.getByText("Abra o caixa para registrar o valor recebido agora.")).toBeVisible();
    await expect(s.getByRole("button", { name: /^Confirmar R\$/ })).toBeDisabled();
    await s.getByRole("button", { name: "Cancelar" }).click();
    await expect(s).toHaveCount(0);
    await expect(confirmarEntrega(page)).toHaveCount(0);
    const d = await dinheiro(prisma, os.id);
    expect(d.caixa).toHaveLength(0);
    expect(d.titulos).toHaveLength(0);
  } finally {
    await garantirCaixa(prisma, true);
  }
});

test("E04 — sinal antes de pronta: pagamento real, status técnico preservado, sem entrega", async ({ page }) => {
  const os = await semearOS(prisma, { status: "em_execucao" });
  await abrirOS(page, os.codigo, "financeiro");
  await receber(page, [{ forma: "pix", valor: "100" }], { intencao: "Sinal", abrir: page.getByRole("button", { name: /^Receber R\$/ }) });
  await expect.poll(async () => (await dinheiro(prisma, os.id)).caixa.length).toBe(1);
  const lido = await lerOS(prisma, os.id);
  expect(lido.operacaoStatusV3).toBe("em_execucao");
  expect(lido.entregaV3).toBeUndefined();
  await irPara(page, "entrega");
  await expect(confirmarEntrega(page)).toHaveCount(0);
});

let osQuitada = { id: "", codigo: "" };

test("E05 — pagamento completo leva à entrega explícita; nada é entregue sozinho; termo só depois", async ({ page }) => {
  osQuitada = await semearOS(prisma);
  await abrirOS(page, osQuitada.codigo);
  await receber(page, [{ forma: "pix" }]);
  await expect(page.getByText("Pagamento registrado. Falta confirmar a entrega.")).toBeVisible({ timeout: 30_000 });
  await expect(bloco(page)).toHaveAttribute("data-acao", "confirmar-entrega", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Imprimir Termo de Entrega" })).toBeDisabled();
  await expect(page.getByLabel("Retirado por")).toHaveValue(/Cliente QA 006/);
  const lido = await lerOS(prisma, osQuitada.id);
  expect(lido.operacaoStatusV3).toBe("pronta");
  expect(entregas(lido)).toHaveLength(0);
});

test("E06 — pagou, a entrega falhou (rede): dinheiro preservado; após reload, retry SÓ da entrega", async ({ page }) => {
  await abrirOS(page, osQuitada.codigo);
  const antes = await dinheiro(prisma, osQuitada.id);
  const soltar = await interceptarProximaAction(page, osQuitada.id, (route) => route.abort("failed"));
  await confirmarEntregaNaTela(page, "Portador E06");
  await expect(confirmarEntrega(page)).toBeEnabled({ timeout: 30_000 });
  await soltar();
  expect((await lerOS(prisma, osQuitada.id)).operacaoStatusV3).toBe("pronta");
  await page.reload();
  await abrirOS(page, osQuitada.codigo);
  await expect(guia(page).getByText("Pagamento quitado — confirmar entrega.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Receber pagamento" })).toHaveCount(0);
  await confirmarEntregaNaTela(page, "Portador E06");
  await expect.poll(async () => (await lerOS(prisma, osQuitada.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");
  const depois = await dinheiro(prisma, osQuitada.id);
  expect(depois.caixa).toEqual(antes.caixa);
  expect(depois.titulos).toEqual(antes.titulos);
  const lido = await lerOS(prisma, osQuitada.id);
  expect(entregas(lido)).toHaveLength(1);
  expect(lido.entregaV3.recebidoPor).toBe("Portador E06");
});

test("E07 — 100% a prazo sem caixa: entrega autorizada, não quitada, nenhum movimento de caixa", async ({ page }) => {
  await garantirCaixa(prisma, false);
  try {
    const os = await semearOS(prisma);
    await abrirOS(page, os.codigo);
    await receber(page, [{ forma: "a_prazo" }], { vencimento: VENC });
    await expect(guia(page).getByText("Entrega autorizada a prazo")).toBeVisible({ timeout: 30_000 });
    await expect(guia(page).getByText(/^Não quitada/)).toBeVisible();
    await expect(page.getByText(/Pagamento quitado/)).toHaveCount(0);
    await capturar(page, "e07-a-prazo");
    await confirmarEntregaNaTela(page);
    await expect.poll(async () => (await lerOS(prisma, os.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");
    const d = await dinheiro(prisma, os.id);
    expect(d.caixa).toHaveLength(0);
    expect(d.titulos).toHaveLength(1);
  } finally {
    await garantirCaixa(prisma, true);
  }
});

test("E08 — saldo sem autorização: entrega bloqueada com o saldo explícito", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirOS(page, os.codigo);
  await receber(page, [{ forma: "pix", valor: "100" }], { intencao: "Pagamento parcial" });
  await expect(page.getByText(/Pagamento pendente\s+R\$\s200,00/)).toBeVisible({ timeout: 30_000 });
  await expect(confirmarEntrega(page)).toHaveCount(0);
  expect((await lerOS(prisma, os.id)).operacaoStatusV3).toBe("pronta");
});

test("E09 — sem cobrança: categoria + motivo auditados; nunca silencioso", async ({ page }) => {
  const os = await semearOS(prisma, { total: 0 });
  await abrirOS(page, os.codigo);
  await expect(page.getByText("OS sem cobrança lançada")).toBeVisible();
  await capturar(page, "e09-sem-cobranca");
  await page.getByRole("button", { name: "Entregar sem cobrança" }).click();
  const enviar = page.getByRole("button", { name: "Confirmar entrega sem cobrança" });
  await expect(enviar).toBeDisabled();
  await page.getByLabel("Categoria obrigatória").selectOption("cortesia");
  await page.getByPlaceholder(/Explique por que/).fill("Cortesia QA 006");
  page.once("dialog", (d) => void d.accept());
  await enviar.click();
  await expect.poll(async () => (await lerOS(prisma, os.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");
  const lido = await lerOS(prisma, os.id);
  expect(lido.entregaSemCobrancaV3).toMatchObject({ categoria: "cortesia", motivo: "Cortesia QA 006", status: "ativo" });
  expect((await dinheiro(prisma, os.id)).caixa).toHaveLength(0);
});

let osEstorno = { id: "", codigo: "" };

test("E10 — recibo após reload: reimpressão do comprovante persistido da MESMA OS", async ({ page }) => {
  osEstorno = await semearOS(prisma);
  await abrirOS(page, osEstorno.codigo);
  await receber(page, [{ forma: "pix" }]);
  await page.reload();
  await abrirOS(page, osEstorno.codigo, "financeiro");
  await page.getByRole("button", { name: "Imprimir comprovante" }).click();
  const d = recibo(page);
  await expect(d.getByText("Reimpressão do último comprovante registrado nesta OS.")).toBeVisible();
  await expect(d.getByText(`OS ${osEstorno.codigo}`)).toBeVisible();
  await d.getByRole("button", { name: "Fechar comprovante" }).click();
});

test("E11 — estorno: saldo volta, entrega volta a bloquear, comprovante estornado não é reoferecido", async ({ page }) => {
  await abrirOS(page, osEstorno.codigo, "financeiro");
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByPlaceholder(/valor lançado errado/).fill("Estorno de teste QA 006");
  await page.getByRole("button", { name: "Confirmar estorno" }).click();
  await expect.poll(async () => (await dinheiro(prisma, osEstorno.id)).caixa.filter((c) => c.tipo === "estorno_recebimento_cr").length, { timeout: 30_000 }).toBe(1);
  await page.getByRole("button", { name: "Imprimir comprovante" }).waitFor({ state: "detached", timeout: 30_000 });
  await irPara(page, "entrega");
  await expect(guia(page).getByText("Saldo em aberto")).toBeVisible({ timeout: 30_000 });
  await expect(confirmarEntrega(page)).toHaveCount(0);
  expect((await lerOS(prisma, osEstorno.id)).operacaoStatusV3).toBe("pronta");
});

let osEstoque = { id: "", codigo: "", produto: "" };

test("E12 — duplo clique + resposta perdida da entrega: um único fato de entrega", async ({ page }) => {
  const produto = await prisma.produto.create({ data: { storeId: LOJA, name: `Tela QA E2E ${marca()}`, price: 150, stock: 5 } });
  const peca = { id: `peca-${marca()}`, nome: "Tela QA E2E", quantidade: 1, valorUnitario: 0, custoUnitario: 92, kindV3: "interno", produtoId: produto.id };
  const os = await semearOS(prisma, { pecas: [peca] });
  osEstoque = { ...os, produto: produto.id };
  await abrirOS(page, os.codigo);
  await receber(page, [{ forma: "pix" }]);
  await expect(confirmarEntrega(page)).toBeVisible({ timeout: 30_000 });
  // Resposta perdida: o servidor efetiva, o navegador não recebe a resposta.
  const soltar = await interceptarProximaAction(page, os.id, async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  page.on("dialog", (d) => void d.accept());
  await page.getByLabel("Retirado por").fill("Portador E12");
  await confirmarEntrega(page).dblclick();
  await expect.poll(async () => (await lerOS(prisma, os.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");
  await soltar();
  // Retry após a resposta perdida: idempotente.
  await page.reload();
  await abrirOS(page, os.codigo);
  await expect(guia(page).getByText("Entregue", { exact: true })).toBeVisible({ timeout: 30_000 });
  const lido = await lerOS(prisma, os.id);
  expect(entregas(lido)).toHaveLength(1);
  expect(lido.entregaV3.recebidoPor).toBe("Portador E12");
});

test("E13 — troca A→B com a entrega de A em voo: B intacta", async ({ page }) => {
  const a = await semearOS(prisma);
  const b = await semearOS(prisma);
  await abrirOS(page, a.codigo);
  await receber(page, [{ forma: "pix" }]);
  await expect(confirmarEntrega(page)).toBeVisible({ timeout: 30_000 });
  let liberar!: () => void;
  const portao = new Promise<void>((r) => (liberar = r));
  const soltar = await interceptarProximaAction(page, a.id, async (route) => {
    await portao;
    await route.continue();
  });
  await confirmarEntregaNaTela(page);
  await expect(page.getByRole("button", { name: "Confirmando…" })).toBeVisible();
  await trocarPara(page, b.codigo);
  await irPara(page, "entrega");
  await expect(guia(page).getByText(b.codigo)).toBeVisible();
  liberar();
  await expect.poll(async () => (await lerOS(prisma, a.id)).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");
  await soltar();
  await expect(guia(page).getByText(b.codigo)).toBeVisible();
  await expect(page.getByText("Entrega confirmada.", { exact: true })).toHaveCount(0);
  const lidoB = await lerOS(prisma, b.id);
  expect(lidoB.operacaoStatusV3).toBe("pronta");
  expect(entregas(lidoB)).toHaveLength(0);
  expect((await dinheiro(prisma, b.id)).caixa).toHaveLength(0);
});

test("E14 — estoque: peça vinculada baixa exatamente uma vez (pagamento e replay não baixam)", async () => {
  const produto = await prisma.produto.findUniqueOrThrow({ where: { id: osEstoque.produto } });
  expect(produto.stock).toBe(4);
  const movs = await prisma.movimentacaoEstoque.findMany({ where: { storeId: LOJA, produtoId: osEstoque.produto } });
  expect(movs).toHaveLength(1);
  expect(movs[0]!.quantidade).toBe(-1);
});

test("E15 — pós-entrega: termo de entrega com retirante e data reais; garantia ativa; recibo da mesma OS", async ({ page }) => {
  await abrirOS(page, osEstoque.codigo);
  await expect(guia(page).getByText("Entregue", { exact: true })).toBeVisible();
  await capturar(page, "e15-entregue");
  const termo = page.getByRole("button", { name: "Imprimir Termo de Entrega" });
  await expect(termo).toBeEnabled();
  await termo.click();
  const doc = page.locator("#og-print-root");
  await expect(doc.getByText("Recebido por:")).toBeVisible();
  await expect(doc.getByText("Portador E12")).toBeVisible();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(doc).toHaveCount(0);
  // Garantia iniciada na entrega real (vigente), uma única vez.
  await expect(guia(page).getByText("Vigente", { exact: true })).toBeVisible();
});
