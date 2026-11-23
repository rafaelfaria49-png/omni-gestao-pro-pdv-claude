import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";

// OPERACOES-V3-SELETOR-003-ACEITE-REAL — "Nova OS" da V3 → seletor "Novo atendimento".
// App real (`next start`) + NextAuth real (login pela tela) + PostgreSQL DESCARTÁVEL
// `ops_v3_seletor_qa*` com massa sintética de `qa-bootstrap.mjs`. A prova de persistência
// é lida do banco, não do toast. Sem sleep, skip, retry ou catch que engula falha.

const LOJA_A = "000-qa-seletor-a";
const LOJA_B = "000-qa-seletor-b";
const OS_ORIGEM_A = "qa-seletor-origem-a";
const OS_LOJA_B = "qa-seletor-loja-b";
const EVID = path.resolve(__dirname, "../../test-results/ops-v3-seletor-003-aceite");
type Payload = Record<string, any>;

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  const u = new URL(urls[0] || "http://ausente");
  if (urls[0] !== urls[1] || !["127.0.0.1", "localhost"].includes(u.hostname) || !u.pathname.slice(1).startsWith("ops_v3_seletor_qa")) {
    throw new Error("BLOQUEIO_QA: aceite só roda no PostgreSQL descartável ops_v3_seletor_qa* em loopback.");
  }
  return urls[0]!;
}

let prisma: PrismaClient;
let storageState: string;
const marca = Date.now().toString(36).toUpperCase();

/** Senha entra pelo setter nativo (não vai para o call log do Playwright nem para artefatos). */
async function preencherSegredo(page: Page, seletor: string, valor: string) {
  await page.locator(seletor).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

async function loginReal(browser: Browser): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/dashboard/operacoes-v3");
  await expect(page).toHaveURL(/\/login/);
  expect(new URL(page.url()).origin).toBe("http://localhost:3047");
  await page.locator("#email").fill(process.env.PLAYWRIGHT_E2E_EMAIL!);
  await preencherSegredo(page, "#password", process.env.PLAYWRIGHT_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  expect(new URL(page.url()).origin).toBe("http://localhost:3047");
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session.user?.email).toBe(process.env.PLAYWRIGHT_E2E_EMAIL);
  const file = path.join(EVID, ".auth", "storage.json");
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

async function abrirV3(page: Page) {
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
    await d.getByRole("button", { name: /^Voltar depois$/i }).click();
  });
  await page.goto("/dashboard/operacoes-v3");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(LOJA_A);
  await expect(page.getByRole("heading", { name: "Precisa de atenção", exact: true })).toBeVisible({ timeout: 60_000 });
}

// Dois gatilhos na tela: o do topo da V3 (0) e o do cabeçalho do Dashboard (1). Ambos chamam abrirNovaOS.
const gatilhos = (page: Page) => page.getByRole("button", { name: "Nova OS", exact: true });
const gatilho = (page: Page) => gatilhos(page).nth(0);
const seletor = (page: Page) => page.getByRole("dialog", { name: "Novo atendimento" });

async function abrirSeletor(page: Page) {
  await gatilho(page).click();
  await expect(seletor(page)).toBeVisible();
}

async function irPara(page: Page, aba: string) {
  const b = page.getByRole("navigation", { name: "Operações" }).getByRole("button", { name: aba, exact: true });
  await b.click();
  await expect(b).toHaveAttribute("aria-current", "page");
}

async function capturar(page: Page, nome: string) {
  await page.screenshot({ path: path.join(EVID, `${nome}.png`), fullPage: false });
}

async function semRolagemHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

async function efeitosFinanceiros(storeId: string) {
  const [titulos, caixa, vendas, estoque, movimentos] = await Promise.all([
    prisma.contaReceberTitulo.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.venda.count({ where: { storeId } }),
    prisma.movimentacaoEstoque.count({ where: { storeId } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
  ]);
  return { titulos, caixa, vendas, estoque, movimentos };
}

async function retornosDe(origemId: string) {
  const rows = await prisma.ordemServico.findMany({ where: { storeId: LOJA_A }, select: { id: true, numero: true, storeId: true, valorTotal: true, payload: true } });
  return rows.filter((r) => (r.payload as Payload)?.vinculoRetornoV3?.osOrigemId === origemId);
}

async function hojeSP(): Promise<string> {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

let lojaBAntes: { updatedAt: Date; payload: unknown } | null = null;
let osBAntes = 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const b = await prisma.ordemServico.findUniqueOrThrow({ where: { id: OS_LOJA_B } });
  lojaBAntes = { updatedAt: b.updatedAt, payload: b.payload };
  osBAntes = await prisma.ordemServico.count({ where: { storeId: LOJA_B } });
  storageState = await loginReal(browser);
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

test("A01 — login real e seletor: Nova OS · Orçamento · Retorno / Garantia, sem Atendimento rápido; ESC e Fechar (desktop)", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await abrirV3(page);
  await abrirSeletor(page);
  const d = seletor(page);
  await expect(d.locator("[data-opcao]")).toHaveCount(3);
  expect(await d.locator("[data-opcao]").evaluateAll((els) => els.map((e) => e.getAttribute("data-opcao")))).toEqual(["os", "orcamento", "retorno"]);
  await expect(d.getByRole("button", { name: /Nova OS/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Orçamento/ })).toBeVisible();
  await expect(d.getByRole("button", { name: /Retorno \/ Garantia/ })).toBeVisible();
  await expect(d).not.toContainText(/Atendimento rápido/i);
  await capturar(page, "a01-seletor-desktop");
  await semRolagemHorizontal(page);

  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  await expect(gatilho(page)).toBeFocused();

  await abrirSeletor(page);
  await d.getByRole("button", { name: "Fechar", exact: true }).filter({ visible: true }).click();
  await expect(d).toHaveCount(0);

  // O gatilho do Dashboard abre o MESMO seletor.
  await expect(gatilhos(page)).toHaveCount(2);
  await gatilhos(page).nth(1).click();
  await expect(seletor(page).locator("[data-opcao]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(seletor(page)).toHaveCount(0);
  await ctx.close();
});

test("A02 — Nova OS: preencher, salvar, reabrir e conferir no banco de QA", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await abrirV3(page);
  const antes = await efeitosFinanceiros(LOJA_A);
  await abrirSeletor(page);
  await seletor(page).locator('[data-opcao="os"]').click();
  const m = page.getByRole("dialog", { name: "Nova OS" });
  await expect(m).toBeVisible();
  const nome = `Cliente QA NovaOS ${marca}`;
  const modelo = `Moto QA N${marca}`;
  await m.getByLabel("Nome / razão social *").fill(nome);
  await m.getByLabel("Telefone / WhatsApp").fill("(11) 96666-0303");
  await m.getByRole("button", { name: /Próximo/ }).click();
  await m.getByLabel("Marca *").fill("Motorola");
  await m.getByLabel("Modelo *").fill(modelo);
  await m.getByLabel("IMEI / Nº de série").fill(`35N${marca}`);
  await m.getByRole("button", { name: /Próximo/ }).click();
  const entrada = m.locator("#novaos-v3-entrada-dia");
  if (!(await entrada.inputValue())) await entrada.fill(await hojeSP());
  await m.getByRole("button", { name: /Próximo/ }).click();
  await m.getByLabel("Defeito relatado pelo cliente *").fill("Não carrega (aceite QA)");
  for (let i = 0; i < 4; i++) await m.getByRole("button", { name: /Próximo/ }).click();
  await capturar(page, "a02-novaos-resumo");
  await m.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
  await expect(m).toHaveCount(0, { timeout: 30_000 });

  await expect.poll(async () => prisma.ordemServico.count({ where: { storeId: LOJA_A, equipamento: { contains: modelo } } })).toBe(1);
  const row = await prisma.ordemServico.findFirstOrThrow({ where: { storeId: LOJA_A, equipamento: { contains: modelo } } });
  const p = row.payload as Payload;
  expect(row.storeId).toBe(LOJA_A);
  expect(p.cliente?.nome).toBe(nome);
  expect(p.equipamento).toMatchObject({ marca: "Motorola", modelo });
  expect(JSON.stringify(p)).toContain("Não carrega (aceite QA)");
  expect(p.comercialV4?.tipo).not.toBe("orcamento_pre_os");
  expect(await efeitosFinanceiros(LOJA_A)).toEqual(antes);
  await capturar(page, "a02-novaos-aberta");

  // Reabrir: recarrega a página e abre a OS pelo número persistido.
  await abrirV3(page);
  await irPara(page, "Fila");
  await page.getByPlaceholder("Buscar por OS, cliente, aparelho, técnico…").fill(row.numero!);
  await page.getByText(row.numero!, { exact: true }).click();
  await expect(page.getByText(`OS ${row.numero}`, { exact: true })).toBeVisible();
  await expect(page.getByText(nome).first()).toBeVisible();
  await expect(page.getByText(modelo).first()).toBeVisible();
  await capturar(page, "a02-novaos-reaberta");
  await ctx.close();
});

test("A03 — Orçamento: proposta persistida como orçamento pré-OS, sem pagamento nem serviço concluído", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await abrirV3(page);
  const antes = await efeitosFinanceiros(LOJA_A);
  await abrirSeletor(page);
  await seletor(page).locator('[data-opcao="orcamento"]').click();
  const m = page.getByRole("dialog", { name: "Novo orçamento" });
  await expect(m).toBeVisible();
  await expect(m.getByRole("heading", { name: "Novo orçamento" })).toBeVisible();
  const nome = `Cliente QA Orcamento ${marca}`;
  const modelo = `iPhone QA O${marca}`;
  await m.getByLabel("Nome / razão social *").fill(nome);
  await m.getByRole("button", { name: /Próximo/ }).click();
  await m.getByLabel("Marca *").fill("Apple");
  await m.getByLabel("Modelo *").fill(modelo);
  await m.getByRole("button", { name: /Próximo/ }).click();
  // Consulta de preço: entrada do aparelho fica VAZIA (opcional no orçamento).
  await expect(m.locator("#novaos-v3-entrada-dia")).toHaveValue("");
  await m.getByRole("button", { name: /Próximo/ }).click();
  await m.getByLabel("Defeito relatado pelo cliente *").fill("Orçar troca de bateria (aceite QA)");
  // Sem passo Pagamento: Problema → Itens → Garantia → Resumo.
  for (let i = 0; i < 3; i++) await m.getByRole("button", { name: /Próximo/ }).click();
  await expect(m.getByRole("button", { name: /Próximo/ })).toHaveCount(0);
  await expect(m).not.toContainText("Pagamento previsto");
  await capturar(page, "a03-orcamento-resumo");
  await m.getByRole("button", { name: "Registrar orçamento" }).click();
  await expect(m).toHaveCount(0, { timeout: 30_000 });

  await expect.poll(async () => prisma.ordemServico.count({ where: { storeId: LOJA_A, equipamento: { contains: modelo } } })).toBe(1);
  const row = await prisma.ordemServico.findFirstOrThrow({ where: { storeId: LOJA_A, equipamento: { contains: modelo } } });
  const p = row.payload as Payload;
  expect(p.comercialV4?.tipo).toBe("orcamento_pre_os");
  expect(p.cliente?.nome).toBe(nome);
  expect(["entregue", "pronto", "concluida", "concluido"]).not.toContain(String(p.operacaoStatusV3 ?? p.status ?? "").toLowerCase());
  expect(p.entregaV3).toBeUndefined();
  expect(p.pagamentos ?? []).toEqual([]);
  expect(p.recebimentosV3 ?? []).toEqual([]);
  expect(await efeitosFinanceiros(LOJA_A)).toEqual(antes);
  await capturar(page, "a03-orcamento-aberto");
  await ctx.close();
});

const BUSCA_RETORNO = "Ex.: OS-00025, Maria, 11 9…, iPhone 11";

async function abrirRetornoPeloSeletor(page: Page) {
  await abrirSeletor(page);
  await seletor(page).locator('[data-opcao="retorno"]').click();
  const d = page.getByRole("dialog", { name: "Retorno / Garantia" });
  await expect(d).toBeVisible();
  return d;
}

test("A04 — Retorno / Garantia: localizar a OS original entregue, abrir retorno vinculado, sem duplicar", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await abrirV3(page);
  const origemAntes = await prisma.ordemServico.findUniqueOrThrow({ where: { id: OS_ORIGEM_A } });
  const antes = await efeitosFinanceiros(LOJA_A);
  expect(await retornosDe(OS_ORIGEM_A)).toHaveLength(0);

  const d = await abrirRetornoPeloSeletor(page);
  // Isolamento: a OS da loja B (sem vínculo) não aparece na busca da loja A.
  await d.getByPlaceholder(BUSCA_RETORNO).fill("QAB1");
  await expect(d.getByText("Nenhuma OS encontrada nesta unidade.")).toBeVisible();
  await d.getByPlaceholder(BUSCA_RETORNO).fill("OS-QASB");
  await expect(d.getByText("Nenhuma OS encontrada nesta unidade.")).toBeVisible();

  await d.getByPlaceholder(BUSCA_RETORNO).fill("Galaxy QAA1");
  const item = d.getByRole("list", { name: "OS encontradas" }).getByRole("button", { name: /OS-QASA-ORIGEM/ });
  await expect(item).toBeVisible();
  await capturar(page, "a04-retorno-busca");
  await item.click();
  await expect(d.getByText("OS original OS-QASA-ORIGEM", { exact: true })).toBeVisible();
  await d.getByPlaceholder("O que o cliente relata agora?").fill("Touch voltou a falhar (aceite QA)");
  await capturar(page, "a04-retorno-detalhe");
  // Duplo clique: a 2ª chamada (se chegar) reusa o mesmo operacaoId e não cria outro atendimento.
  await d.getByRole("button", { name: "Abrir retorno" }).dblclick();
  await expect(d).toHaveCount(0, { timeout: 30_000 });

  await expect.poll(async () => (await retornosDe(OS_ORIGEM_A)).length).toBe(1);
  const [filha] = await retornosDe(OS_ORIGEM_A);
  expect(filha!.storeId).toBe(LOJA_A);
  expect(filha!.valorTotal).toBe(0);
  const origem = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: OS_ORIGEM_A } })).payload as Payload;
  expect(origem.retornosV3).toEqual([expect.objectContaining({ status: "aberto", osRetornoId: filha!.id })]);
  expect((filha!.payload as Payload).vinculoRetornoV3).toMatchObject({ osOrigemId: OS_ORIGEM_A });
  // A OS original não foi reescrita além do vínculo (núcleo intacto).
  const nucleo = (p: Payload) => {
    const { retornosV3: _r, timeline: _t, atualizadoEm: _a, ...resto } = p;
    void _r; void _t; void _a;
    return resto;
  };
  expect(nucleo(origem)).toEqual(nucleo(origemAntes.payload as Payload));
  expect(await efeitosFinanceiros(LOJA_A)).toEqual(antes);
  await expect(page.getByText(`OS ${filha!.numero}`, { exact: true })).toBeVisible();
  await capturar(page, "a04-retorno-aberto");

  // Segunda tentativa pelo seletor: a origem agora oferece o atendimento EM ANDAMENTO, não um novo.
  const d2 = await abrirRetornoPeloSeletor(page);
  await d2.getByPlaceholder(BUSCA_RETORNO).fill("OS-QASA-ORIGEM");
  await d2.getByRole("list", { name: "OS encontradas" }).getByRole("button", { name: /OS-QASA-ORIGEM/ }).click();
  await expect(d2.getByRole("button", { name: "Abrir retorno" })).toHaveCount(0);
  const continuar = d2.getByRole("button", { name: /Abrir atendimento em andamento/ });
  await expect(continuar).toBeVisible();
  await capturar(page, "a04-retorno-em-andamento");
  await continuar.click();
  await expect(d2).toHaveCount(0);
  await expect(page.getByText(`OS ${filha!.numero}`, { exact: true })).toBeVisible();
  expect(await retornosDe(OS_ORIGEM_A)).toHaveLength(1);

  // "Ver OS original" abre a origem.
  const d3 = await abrirRetornoPeloSeletor(page);
  await d3.getByPlaceholder(BUSCA_RETORNO).fill("OS-QASA-ORIGEM");
  await d3.getByRole("list", { name: "OS encontradas" }).getByRole("button", { name: /OS-QASA-ORIGEM/ }).click();
  await d3.getByRole("button", { name: "Ver OS original" }).click();
  await expect(d3).toHaveCount(0);
  await expect(page.getByText("OS OS-QASA-ORIGEM", { exact: true })).toBeVisible();
  expect(await retornosDe(OS_ORIGEM_A)).toHaveLength(1);
  await ctx.close();
});

test("A05 — celular 390×844: seletor em bottom sheet, sem rolagem horizontal; ESC e Fechar no seletor, Orçamento e Retorno", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await abrirV3(page);
  const g = gatilhos(page).filter({ visible: true }).first();
  await g.click();
  const d = seletor(page);
  await expect(d.locator("[data-opcao]")).toHaveCount(3);
  await expect(d).not.toContainText(/Atendimento rápido/i);
  // Bottom sheet: o painel encosta na base da viewport e não passa da largura.
  const painel = await d.locator("[data-opcao]").first().evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && n.parentElement && n.parentElement.getAttribute("role") !== "dialog") n = n.parentElement;
    const r = (n ?? (el as HTMLElement)).getBoundingClientRect();
    return { bottom: r.bottom, left: r.left, right: r.right };
  });
  expect(Math.round(painel.bottom)).toBeGreaterThanOrEqual(843);
  expect(painel.left).toBeGreaterThanOrEqual(0);
  expect(painel.right).toBeLessThanOrEqual(390);
  await semRolagemHorizontal(page);
  await capturar(page, "a05-seletor-celular");
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);

  await g.click();
  await d.getByRole("button", { name: "Fechar", exact: true }).filter({ visible: true }).click();
  await expect(d).toHaveCount(0);

  await g.click();
  await d.locator('[data-opcao="retorno"]').click();
  const r = page.getByRole("dialog", { name: "Retorno / Garantia" });
  await expect(r).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "a05-retorno-celular");
  await page.keyboard.press("Escape");
  await expect(r).toHaveCount(0);
  await g.click();
  await d.locator('[data-opcao="retorno"]').click();
  await r.getByRole("button", { name: "Fechar", exact: true }).filter({ visible: true }).click();
  await expect(r).toHaveCount(0);

  await g.click();
  await d.locator('[data-opcao="orcamento"]').click();
  const o = page.getByRole("dialog", { name: "Novo orçamento" });
  await expect(o).toBeVisible();
  await semRolagemHorizontal(page);
  await capturar(page, "a05-orcamento-celular");
  await o.getByRole("button", { name: "Fechar", exact: true }).filter({ visible: true }).last().click();
  await expect(o).toHaveCount(0);
  await ctx.close();
});

test("A06 — isolamento entre lojas e V3 sem regressão nas telas principais", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errosConsole: string[] = [];
  // Dois ruídos SÓ do ambiente local, fora da V3: o `workbox-window` (PWA) lê `.waiting` de um
  // registro inexistente porque o teste bloqueia o service worker; e `/_vercel/insights/script.js`
  // só existe na Vercel (local, o proxy o redireciona para `/dashboard?access=denied`).
  const ambiente = (t: string) =>
    t === "Cannot read properties of undefined (reading 'waiting')" ||
    t.startsWith("Refused to execute script from 'http://localhost:3047/dashboard?access=denied'");
  page.on("console", (m) => { if (m.type() === "error" && !ambiente(m.text())) errosConsole.push(m.text()); });
  page.on("pageerror", (e) => { if (!ambiente(e.message)) errosConsole.push(e.message); });
  await abrirV3(page);
  for (const aba of ["Fila", "Bancada", "Orçam.", "Garantia", "Retornos", "Visão geral"]) {
    await irPara(page, aba);
    await expect(page.getByText(/Algo deu errado|Application error/i)).toHaveCount(0);
  }
  await capturar(page, "a06-v3-visao-geral");

  // Loja B: nenhuma OS nova, a OS sintética da B intacta, nenhum efeito financeiro.
  expect(await prisma.ordemServico.count({ where: { storeId: LOJA_B } })).toBe(osBAntes);
  const b = await prisma.ordemServico.findUniqueOrThrow({ where: { id: OS_LOJA_B } });
  expect(b.updatedAt.toISOString()).toBe(lojaBAntes!.updatedAt.toISOString());
  expect(b.payload).toEqual(lojaBAntes!.payload);
  expect(await efeitosFinanceiros(LOJA_B)).toEqual({ titulos: 0, caixa: 0, vendas: 0, estoque: 0, movimentos: 0 });
  // Toda OS criada neste aceite está na loja A.
  const criadas = await prisma.ordemServico.findMany({ where: { id: { notIn: [OS_ORIGEM_A, OS_LOJA_B] } }, select: { storeId: true } });
  expect(criadas.length).toBeGreaterThanOrEqual(3);
  expect(new Set(criadas.map((c) => c.storeId))).toEqual(new Set([LOJA_A]));

  // Forjar a loja ativa = B no navegador não abre a loja B para este usuário.
  await page.evaluate((id) => localStorage.setItem("assistec-pro-loja-ativa-v1", id), LOJA_B);
  await page.goto("/dashboard/operacoes-v3");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")), { timeout: 30_000 }).toBe(LOJA_A);
  await expect(page.getByText("Loja QA Seletor B")).toHaveCount(0);
  await capturar(page, "a06-loja-b-forjada");
  expect(errosConsole).toEqual([]);
  await ctx.close();
});
