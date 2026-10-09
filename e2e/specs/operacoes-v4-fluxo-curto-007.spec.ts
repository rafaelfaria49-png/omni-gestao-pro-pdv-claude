import { expect, test, type Page, type Route } from "@playwright/test";
import { PrismaClient, type Prisma } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-V4-FLUXO-CURTO-007 — Retorno / Garantia pela OS original no Workspace V4.
// Servidor QA isolado + PostgreSQL local DESCARTÁVEL (ops_v4_fluxo_007_qa*) + login QA
// real. Aqui o retorno é aberto de verdade — SOMENTE no banco descartável, com
// loja/cliente/OS sintéticos. Sem sleep, skip, fixme, .first() arbitrário, catch que
// engole falha ou reload que mascara race.

test.use({ serviceWorkers: "block" });

const LOJA = "000-qa-ops-007";
type Payload = Record<string, any>;

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E 007 exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E 007 só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_v4_fluxo_007_qa")) {
    throw new Error("E2E 007 exige URLs idênticas do banco descartável ops_v4_fluxo_007_qa*.");
  }
  return urls[0]!;
}

let seq = 0;
const marca = () => `${Date.now().toString(36)}${(++seq).toString(36)}`.toUpperCase();
const ENTRADA = "2026-08-01T12:00:00.000Z";
const RECENTE = new Date(Date.now() - 10 * 86_400_000).toISOString();

async function semearOS(
  prisma: PrismaClient,
  opts: { entregueEm?: string | null; status?: string } = {},
): Promise<{ id: string; codigo: string; modelo: string; cliente: string }> {
  const m = marca();
  const id = `qa-007-${m}`;
  const codigo = `OS-QA7-${m}`;
  const modelo = `Galaxy R${m}`;
  const nome = `Cliente QA7 ${m}`;
  const cliente = await prisma.cliente.create({ data: { storeId: LOJA, name: nome, phone: "(11) 97777-0000" } });
  const entregueEm = opts.entregueEm === undefined ? RECENTE : opts.entregueEm;
  const status = opts.status ?? (entregueEm ? "entregue" : "em_execucao");
  await prisma.ordemServico.create({
    data: {
      id, storeId: LOJA, numero: codigo, clienteId: cliente.id, status: status === "entregue" ? "Entregue" : "EmAnalise",
      equipamento: `Samsung ${modelo}`, defeito: "Tela quebrada", valorTotal: 300,
      payload: {
        id, codigo, storeId: LOJA, clienteId: cliente.id, criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
        pecas: [], observacoes: [], anexos: [],
        cliente: { id: cliente.id, nome, telefone: "(11) 97777-0000" },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo, numeroSerie: `35${m}`, acessorios: ["Capa", "Chip"], defeitoRelatado: "Tela quebrada" },
        senhaEquipamento: "1478", senhaEquipamentoTipo: "numerica",
        status, operacaoStatus: status, operacaoStatusV3: status, valorTotal: 300,
        servicosCatalogo: [{ servicoId: `s-${m}`, descricao: "Troca de tela", custoInterno: 92, valorVenda: 300, prazoGarantiaDias: 90, termoGarantia: "" }],
        orcamento: { id: `orc-${m}`, status: "aprovado", sintetizado: false, respondidoEm: ENTRADA, criadoEm: ENTRADA, desconto: 0, total: 300, servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
        aberturaV3: { versao: 1, recepcao: { recebidoPor: "Operador QA 007", origem: "balcao", prioridade: "media", localFisico: "balcao", dataEntrada: ENTRADA }, garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias: 90 } },
        ...(entregueEm ? { entregaV3: { entregueEm, entreguePor: "QA", recebidoPor: nome } } : {}),
        timeline: [{ id: `ev-${m}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return { id, codigo, modelo, cliente: nome };
}

async function lerOS(prisma: PrismaClient, id: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as unknown as Payload;
}
async function filhas(prisma: PrismaClient, origemId: string) {
  const rows = await prisma.ordemServico.findMany({ where: { storeId: LOJA }, select: { id: true, numero: true, valorTotal: true, payload: true } });
  return rows.filter((r) => (r.payload as Payload)?.vinculoRetornoV3?.osOrigemId === origemId);
}
async function efeitos(prisma: PrismaClient) {
  const [titulos, caixa, vendas, estoque] = await Promise.all([
    prisma.contaReceberTitulo.count({ where: { storeId: LOJA } }),
    prisma.caixaOperacao.count({ where: { storeId: LOJA } }),
    prisma.venda.count({ where: { storeId: LOJA } }),
    prisma.movimentacaoEstoque.count({ where: { storeId: LOJA } }),
  ]);
  return { titulos, caixa, vendas, estoque };
}
function nucleo(p: Payload) {
  const { retornosV3: _r, timeline: _t, atualizadoEm: _a, ...resto } = p;
  void _r; void _t; void _a;
  return resto;
}

async function abrirV4(page: Page) {
  const lojas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/stores" && r.ok());
  const ordens = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
  await page.goto("/dashboard/operacoes-v4-preview");
  await Promise.all([lojas, ordens]);
  await dismissFirstAccessWizardIfPresent(page);
  expect(await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(LOJA);
}

const dialogo = (page: Page) => page.getByRole("dialog", { name: "Retorno / Garantia" });
const opcao = (page: Page, codigo: string) => dialogo(page).getByRole("option", { name: new RegExp(`^${codigo}(?![A-Z0-9-])`) });

async function abrirPeloNovo(page: Page) {
  // CTA único da TopBar (o empty state tem outro "+ Novo").
  await page.getByTitle(/^Novo atendimento/).click();
  await page.getByRole("dialog", { name: "Novo atendimento" }).getByRole("button", { name: /Retorno \/ Garantia/ }).click();
  await expect(dialogo(page)).toBeVisible();
}

async function buscarESelecionar(page: Page, termo: string, codigo: string) {
  const busca = dialogo(page).getByRole("combobox", { name: "Buscar OS original" });
  await busca.fill(termo);
  await expect(opcao(page, codigo)).toHaveCount(1);
  await opcao(page, codigo).click();
  await expect(dialogo(page).locator("div", { hasText: new RegExp(`^${codigo}$`) })).toHaveCount(1);
}

async function selecionarNaBusca(page: Page, codigo: string) {
  const busca = page.getByRole("main").getByRole("textbox", { name: "Buscar por Nº da OS, cliente, aparelho ou IMEI…", exact: true });
  await expect(busca).toHaveCount(1);
  await busca.fill(codigo);
  const seletor = page.getByRole("button", { name: new RegExp(codigo) });
  await expect(seletor).toHaveCount(1);
  await seletor.click();
  await expect(page.getByRole("heading", { name: codigo })).toBeVisible();
}

const pipeline = (page: Page) => page.getByRole("navigation", { name: "Pipeline operacional da OS" });

async function irPosVenda(page: Page) {
  await pipeline(page).getByRole("button", { name: /Pós-venda/ }).click();
  await expect(pipeline(page).getByRole("button", { name: /Pós-venda/ })).toHaveAttribute("aria-current", "step");
}

/** Intercepta a PRÓXIMA chamada de server action que cite a OS. */
async function interceptarProximaAction(page: Page, osId: string, acao: (route: Route) => Promise<void>) {
  let usada = false;
  await page.route("**/dashboard/operacoes-v4-preview**", async (route) => {
    const req = route.request();
    if (!usada && req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes(osId) && (req.postData() ?? "").includes("operacaoId")) {
      usada = true;
      await acao(route);
      return;
    }
    await route.continue();
  });
  return () => page.unroute("**/dashboard/operacoes-v4-preview**");
}

async function semRolagemHorizontal(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Revisão visual do seletor em 1440/1024/768/390: diálogo dentro da tela, sem rolagem lateral, CTA visível. */
async function capturar(page: Page, nome: string) {
  for (const [largura, altura] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    const d = dialogo(page);
    await expect(d).toBeVisible();
    await semRolagemHorizontal(page);
    const caixa = await d.boundingBox();
    expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, `${nome}@${largura}: diálogo dentro da tela`).toBe(true);
    for (const botao of await d.getByRole("button", { name: /^(Abrir atendimento de retorno|Registrar ocorrência|Fechar)$/ }).all()) {
      const b = await botao.boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= largura + 1, `${nome}@${largura}: CTA dentro da tela`).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`${nome}-${largura}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Ctrl+K (paleta do AppShell) dentro de um diálogo V4: não abre a paleta POR TRÁS dele; o foco fica. */
async function ctrlKContido(page: Page, dialogoV4: ReturnType<Page["getByRole"]>, nome: string) {
  const antes = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? "");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Buscar Rota ou Ação" })).toHaveCount(0);
  await expect(dialogoV4).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? "")).toBe(antes);
  expect(await dialogoV4.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${nome}-ctrlk.png`), fullPage: false });
}
/** Com o diálogo V4 fechado, a paleta do AppShell segue funcionando (abre visível e fecha no Escape). */
async function paletaDoAppShellFunciona(page: Page, nome: string) {
  await page.keyboard.press("Control+k");
  const paleta = page.getByRole("dialog", { name: "Buscar Rota ou Ação" });
  await expect(paleta).toBeVisible();
  await expect(paleta.getByPlaceholder("Digite para buscar rotas, cadastros e atalhos...")).toBeFocused();
  await page.screenshot({ path: test.info().outputPath(`${nome}-paleta-livre.png`), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(paleta).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

let prisma: PrismaClient;
test.beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

test("R01 — + Novo → Retorno / Garantia: herança sem recadastro, UM atendimento vinculado; reload prova o vínculo nos dois lados (T53)", async ({ page }) => {
  const os = await semearOS(prisma);
  const antes = await lerOS(prisma, os.id);
  const efeitosAntes = await efeitos(prisma);
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.modelo, os.codigo);
  const d = dialogo(page);
  // Dados herdados no detalhe (sem recadastro): cliente + telefone, aparelho + IMEI, serviço executado.
  await expect(d).toContainText(`${os.cliente}(11) 97777-0000`);
  await expect(d).toContainText(`Samsung ${os.modelo}IMEI/série 35`);
  await expect(d).toContainText("Serviço executadoTroca de tela");
  await expect(d.getByText("A garantia da OS original está vigente.", { exact: false })).toBeVisible();
  await expect(d.getByLabel("Senha do aparelho (opcional)")).toHaveValue("");
  await expect(d.getByRole("checkbox", { name: "Capa" })).not.toBeChecked();
  await expect(d.getByLabel("Motivo do retorno / novo defeito")).toBeFocused();
  await capturar(page, "r01-seletor");
  await d.getByLabel("Motivo do retorno / novo defeito").fill("Touch voltou a falhar");
  await d.getByRole("checkbox", { name: "Capa" }).check();
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(d).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/Retorno aberto\. Atendimento .+ vinculado à OS original\./)).toBeVisible();
  // Rev 16 (R8-01): o sucesso fecha o seletor e seleciona a filha — o foco não volta ao "+ Novo"
  // do contexto anterior nem cai no body; fica na raiz da V4.
  expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-og-v4-raiz") === true)).toBe(true);

  const [filha] = await filhas(prisma, os.id);
  expect(filha).toBeTruthy();
  const original = await lerOS(prisma, os.id);
  expect(original.retornosV3).toEqual([expect.objectContaining({ status: "aberto", osRetornoId: filha!.id, motivo: "Touch voltou a falhar" })]);
  expect(nucleo(original)).toEqual(nucleo(antes));
  const fp = filha!.payload as Payload;
  expect(fp.clienteId).toBe(antes.clienteId);
  expect(fp.equipamento).toMatchObject({ modelo: os.modelo, acessorios: ["Capa"] });
  expect(fp.senhaEquipamento).toBeUndefined();
  expect(filha!.valorTotal).toBe(0);
  expect(await efeitos(prisma)).toEqual(efeitosAntes);
  await expect(page.getByRole("heading", { name: filha!.numero! })).toBeVisible();

  // Reload: a filha mostra a original; a original mostra a filha.
  await abrirV4(page);
  await selecionarNaBusca(page, filha!.numero!);
  await irPosVenda(page);
  await expect(page.getByText(`Retorno da ${os.codigo}`)).toBeVisible();
  await page.getByRole("button", { name: "Abrir OS original" }).click();
  await expect(page.getByRole("heading", { name: os.codigo })).toBeVisible();
  await irPosVenda(page);
  // Retorno em andamento: resumo + histórico apontam o MESMO atendimento.
  await expect(page.getByRole("button", { name: `Abrir atendimento ${filha!.numero}` })).toHaveCount(2);
  // Nenhum botão concorrente de criação enquanto o retorno está em andamento.
  await expect(page.getByRole("button", { name: /^Abrir retorno$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finalizar retorno" })).toBeVisible();
});

test("R02 — duplo clique em Abrir: UMA filha", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  await dialogo(page).getByLabel("Motivo do retorno / novo defeito").fill("Não liga");
  await dialogo(page).getByRole("button", { name: "Abrir atendimento de retorno" }).dblclick();
  await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
  expect(await filhas(prisma, os.id)).toHaveLength(1);
});

test("R03 — falha de rede e resposta PERDIDA: o relato fica, o retry reenvia a mesma operação e recupera o MESMO atendimento (T56)", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  const d = dialogo(page);
  await d.getByLabel("Motivo do retorno / novo defeito").fill("Câmera embaçada");

  // 1) Rede caiu ANTES do servidor: nada gravado, relato preservado.
  const soltar1 = await interceptarProximaAction(page, os.id, (route) => route.abort("failed"));
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(d.getByRole("alert")).toBeVisible();
  await soltar1();
  await expect(d.getByLabel("Motivo do retorno / novo defeito")).toHaveValue("Câmera embaçada");
  expect(await filhas(prisma, os.id)).toHaveLength(0);

  // 2) O servidor PROCESSA, mas a resposta se perde no caminho.
  let operacaoEnviada = "";
  const soltar2 = await interceptarProximaAction(page, os.id, async (route) => {
    operacaoEnviada = /rtv4-[A-Za-z0-9-]+/.exec(route.request().postData() ?? "")?.[0] ?? "";
    await route.fetch();
    await route.abort("failed");
  });
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  // A releitura descobre que a operação foi concluída: aviso honesto, sem erro velho na tela.
  await expect(d.getByRole("status")).toContainText("A abertura anterior foi concluída no servidor");
  await expect(d.getByRole("alert")).toHaveCount(0);
  await soltar2();
  expect(operacaoEnviada).toMatch(/^rtv4-/);
  expect(await filhas(prisma, os.id)).toHaveLength(1);

  // 3) A tela relê a OS original no servidor: o atendimento criado pela resposta perdida
  //    aparece — o operador continua NELE; não há como abrir um segundo.
  const [filha] = await filhas(prisma, os.id);
  const continuar = d.getByRole("button", { name: `Continuar no atendimento ${filha!.numero}` });
  await expect(continuar).toBeVisible();
  await expect(d.getByRole("button", { name: "Abrir atendimento de retorno" })).toHaveCount(0);
  await continuar.click();
  await expect(d).toHaveCount(0);
  await expect(page.getByRole("heading", { name: filha!.numero! })).toBeVisible();
  const o = await lerOS(prisma, os.id);
  expect(o.retornosV3).toEqual([expect.objectContaining({ operacaoId: operacaoEnviada, osRetornoId: filha!.id })]);
  expect((o.timeline as Payload[]).filter((e) => e.metadata?.evento === "retorno_aberto")).toHaveLength(1);
  expect(await filhas(prisma, os.id)).toHaveLength(1);
});

test("R04 — OS ainda em reparo: ocorrência pela observação interna; nenhum retorno, nenhuma garantia (T55)", async ({ page }) => {
  const os = await semearOS(prisma, { entregueEm: null });
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  const d = dialogo(page);
  await expect(d.getByText("O aparelho não foi retirado: não é pós-venda.", { exact: false })).toBeVisible();
  await expect(d.getByRole("button", { name: "Abrir atendimento de retorno" })).toHaveCount(0);
  await d.getByLabel("Ocorrência (observação interna desta OS)").fill("Cliente relatou chiado no alto-falante");
  await capturar(page, "r04-ocorrencia");
  await d.getByRole("button", { name: "Registrar ocorrência" }).click();
  await expect(d.getByRole("status")).toContainText("Nenhum retorno foi aberto");
  const p = await lerOS(prisma, os.id);
  expect(p.retornosV3).toBeUndefined();
  expect((p.observacoes as Payload[]).map((o) => o.conteudo)).toContain("Ocorrência antes da entrega: Cliente relatou chiado no alto-falante");
  expect(await filhas(prisma, os.id)).toHaveLength(0);
});

test("R05 — fora da garantia: registra sem cobertura confirmada; original intacta", async ({ page }) => {
  const os = await semearOS(prisma, { entregueEm: "2025-01-10T12:00:00.000Z" });
  const antes = await lerOS(prisma, os.id);
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  const d = dialogo(page);
  await expect(d.getByText("Garantia vencida ou sem cobertura.", { exact: false })).toBeVisible();
  await expect(d).toContainText("qualquer serviço cobrável é decidido no orçamento do atendimento");
  await d.getByLabel("Motivo do retorno / novo defeito").fill("Bateria descarrega rápido");
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(d).toHaveCount(0, { timeout: 30_000 });
  const p = await lerOS(prisma, os.id);
  expect(p.retornosV3[0]).toMatchObject({ garantiaAtivaNaAbertura: false, garantiaSituacaoNaAbertura: "vencida" });
  expect(nucleo(p)).toEqual(nucleo(antes));
});

test("R06 — pela ficha (Pós-venda) e pelo portfólio de Garantias: o MESMO fluxo, pré-selecionado", async ({ page }) => {
  const daFicha = await semearOS(prisma);
  const doPortfolio = await semearOS(prisma);
  await abrirV4(page);
  await selecionarNaBusca(page, daFicha.codigo);
  await irPosVenda(page);
  await page.getByRole("button", { name: /^Abrir retorno$/ }).click();
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page).locator("div", { hasText: new RegExp(`^${daFicha.codigo}$`) })).toHaveCount(1);
  await dialogo(page).getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialogo(page)).toHaveCount(0);

  const railGarantias = page.getByTitle("Garantias", { exact: true });
  await expect(railGarantias).toHaveCount(1);
  await railGarantias.click();
  await page.getByLabel("Buscar garantias").fill(doPortfolio.codigo);
  // R3-N5: a ação do portfólio fica visível e clicável em painel estreito.
  const acaoRetorno = page.getByRole("button", { name: `Abrir retorno da ${doPortfolio.codigo}` });
  for (const [largura, altura] of [[1024, 768], [768, 1024], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    await acaoRetorno.scrollIntoViewIfNeeded();
    await expect(acaoRetorno).toBeVisible();
    const caixa = await acaoRetorno.boundingBox();
    expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, `portfólio@${largura}: ação Retorno dentro da tela`).toBe(true);
    await semRolagemHorizontal(page);
    await page.screenshot({ path: test.info().outputPath(`r06-portfolio-${largura}.png`), fullPage: false });
  }
  await acaoRetorno.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(dialogo(page).locator("div", { hasText: new RegExp(`^${doPortfolio.codigo}$`) })).toHaveCount(1);
  await dialogo(page).getByLabel("Motivo do retorno / novo defeito").fill("Sem som");
  await dialogo(page).getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
  expect(await filhas(prisma, doPortfolio.id)).toHaveLength(1);
});

test("R07 — teclado: setas + Enter, Tab contido no diálogo, Escape fecha e devolve o foco ao gatilho", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await abrirPeloNovo(page);
  const busca = dialogo(page).getByRole("combobox", { name: "Buscar OS original" });
  await expect(busca).toBeFocused();
  await busca.fill(os.codigo);
  await expect(opcao(page, os.codigo)).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialogo(page).getByLabel("Motivo do retorno / novo defeito")).toBeFocused();
  await page.keyboard.type("Linha 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Linha 2");
  expect(await filhas(prisma, os.id)).toHaveLength(0);
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialogo(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialogo(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialogo(page)).toHaveCount(0);
  await expect(page.getByTitle(/^Novo atendimento/)).toBeFocused(); // R2-F6: foco volta ao + Novo
  expect(await filhas(prisma, os.id)).toHaveLength(0);

  // Pela ficha: o foco volta ao botão que abriu o fluxo.
  await selecionarNaBusca(page, os.codigo);
  await irPosVenda(page);
  const gatilho = page.getByRole("button", { name: /^Abrir retorno$/ });
  await gatilho.focus();
  await page.keyboard.press("Enter");
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page).getByLabel("Motivo do retorno / novo defeito")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogo(page)).toHaveCount(0);
  await expect(gatilho).toBeFocused();
});

test("R08 — rev 15: ocorrência no limite derivado do prefixo; acima dele nada é cortado nem enviado (T55)", async ({ page }) => {
  const os = await semearOS(prisma, { entregueEm: null });
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  const d = dialogo(page);
  const campo = d.getByLabel("Ocorrência (observação interna desta OS)");
  const registrar = d.getByRole("button", { name: "Registrar ocorrência" });
  expect(await campo.getAttribute("maxlength")).toBeNull();

  // 2000 colados (o que a R4 deixava passar até o servidor recusar): fica inteiro, explicado, bloqueado.
  await campo.fill("x".repeat(2000));
  await expect(campo).toHaveValue("x".repeat(2000));
  await expect(d.getByText("2000/1971 caracteres")).toBeVisible();
  await expect(d.getByText(/Texto acima do limite de 1971 caracteres/)).toBeVisible();
  await expect(campo).toHaveAttribute("aria-invalid", "true");
  await expect(registrar).toBeDisabled();
  await capturar(page, "r08-limite");

  // 1972 (um acima): continua bloqueado.
  await campo.fill("x".repeat(1972));
  await expect(d.getByText("1972/1971 caracteres")).toBeVisible();
  await expect(registrar).toBeDisabled();
  expect(((await lerOS(prisma, os.id)).observacoes as Payload[])).toHaveLength(0);

  // Exatamente no limite, com bordas em branco: registra; o servidor grava 2000 caracteres.
  const relato = "Chiado ".repeat(282).slice(0, 1971); // termina em "Chia": 1971 sem espaço na borda
  await campo.fill(`  ${relato}\n `);
  await expect(d.getByText("1971/1971 caracteres")).toBeVisible();
  await registrar.click();
  await expect(d.getByRole("status")).toContainText("Nenhum retorno foi aberto");
  const p = await lerOS(prisma, os.id);
  const gravadas = (p.observacoes as Payload[]).map((o) => o.conteudo as string);
  expect(gravadas).toEqual([`Ocorrência antes da entrega: ${relato.trim()}`]);
  expect(p.retornosV3).toBeUndefined();
  expect(await filhas(prisma, os.id)).toHaveLength(0);
});

test("R09 — rev 15: 'Finalizar retorno' prende Tab/Shift+Tab, Escape devolve o foco ao gatilho e Enter não alcança o fundo", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await selecionarNaBusca(page, os.codigo);
  await irPosVenda(page);
  await page.getByRole("button", { name: /^Abrir retorno$/ }).click();
  await dialogo(page).getByLabel("Motivo do retorno / novo defeito").fill("Touch falhando");
  await dialogo(page).getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
  const [filha] = await filhas(prisma, os.id);
  expect(filha).toBeTruthy();
  await expect(page.getByRole("heading", { name: filha!.numero! })).toBeVisible();

  // Volta à lista (como no R01) e abre a OS original no Pós-venda.
  await abrirV4(page);
  await selecionarNaBusca(page, os.codigo);
  await irPosVenda(page);
  const gatilho = page.getByRole("button", { name: "Finalizar retorno" });
  await expect(gatilho).toHaveCount(1);
  await gatilho.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", { name: "Finalizar retorno" });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel(/Resolução/)).toBeFocused();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(await modal.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} dentro do diálogo`).toBe(true);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await modal.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1} dentro do diálogo`).toBe(true);
  }
  // Ciclo exato: do último (Finalizar) Tab volta ao primeiro (Fechar); Shift+Tab no primeiro vai ao último.
  await modal.getByRole("button", { name: "Finalizar retorno" }).focus();
  await page.keyboard.press("Tab");
  await expect(modal.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(modal.getByRole("button", { name: "Finalizar retorno" })).toBeFocused();

  // Tentativa 3 (R6-F3): Ctrl+K não abre a paleta do AppShell por trás do diálogo.
  await ctrlKContido(page, modal, "r09");

  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(gatilho).toBeFocused();
  await paletaDoAppShellFunciona(page, "r09");
  await gatilho.focus();
  expect((await lerOS(prisma, os.id)).retornosV3).toEqual([expect.objectContaining({ status: "aberto", osRetornoId: filha!.id })]);

  // Finalizar pelo teclado: Enter no botão do diálogo finaliza; o foco não cai no body.
  await page.keyboard.press("Enter");
  await expect(modal).toBeVisible();
  await page.keyboard.type("Conector ressoldado");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(modal.getByRole("button", { name: "Finalizar retorno" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modal).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Finalizar retorno" })).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement !== document.body && !!document.activeElement?.isConnected)).toBe(true);
  expect((await lerOS(prisma, os.id)).retornosV3).toEqual([expect.objectContaining({ status: "finalizado", osRetornoId: filha!.id })]);
});

test("R10 — rev 15 (tentativa 2): launcher + Novo prende Tab/Shift+Tab; a raiz da V4 é a âncora de foco", async ({ page }) => {
  await abrirV4(page);
  const raiz = page.locator("[data-og-v4-raiz]");
  await expect(raiz).toHaveCount(1);
  await expect(raiz).toHaveAttribute("tabindex", "-1");
  const cta = page.getByTitle(/^Novo atendimento/);
  await cta.focus();
  await page.keyboard.press("Enter");
  const launcher = page.getByRole("dialog", { name: "Novo atendimento" });
  await expect(launcher).toBeVisible();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Tab");
    expect(await launcher.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} dentro do launcher`).toBe(true);
  }
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await launcher.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1} dentro do launcher`).toBe(true);
  }
  // Tentativa 3 (R6-F3/F2): Ctrl+K contido; o Escape do launcher fecha e devolve o foco ao + Novo.
  await ctrlKContido(page, launcher, "r10");
  await page.keyboard.press("Escape");
  await expect(launcher).toHaveCount(0);
  await expect(cta).toBeFocused();
});

test("R11 — rev 15 (tentativa 3): seletor gravando — clique no backdrop não tira o foco nem fecha; Tab/Enter não alcançam o fundo", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await abrirPeloNovo(page);
  await buscarESelecionar(page, os.codigo, os.codigo);
  const d = dialogo(page);
  await d.getByLabel("Motivo do retorno / novo defeito").fill("Touch intermitente");
  let liberar!: () => void;
  const segurada = new Promise<void>((r) => { liberar = r; });
  const soltar = await interceptarProximaAction(page, os.id, async (route) => {
    await segurada;
    await route.continue();
  });
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(d.getByRole("button", { name: "Abrindo atendimento…" })).toBeVisible();
  const caixa = (await d.boundingBox())!;
  expect(caixa.x).toBeGreaterThan(20);
  await page.mouse.click(caixa.x - 12, caixa.y + 40); // backdrop, fora do diálogo
  await expect(d).toBeVisible();
  expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.locator("[data-og-v4-raiz]").focus();
  expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    expect(await d.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} dentro do seletor`).toBe(true);
    await page.keyboard.press("Enter");
  }
  expect(await filhas(prisma, os.id)).toHaveLength(0);
  await ctrlKContido(page, d, "r11");
  liberar();
  await expect(d).toHaveCount(0, { timeout: 30_000 });
  await soltar();
  expect(await filhas(prisma, os.id)).toHaveLength(1);
});

test("R12 — rev 16 (R7-01): pela ficha, resposta perdida + releitura desmontam 'Abrir retorno' — Fechar leva o foco à raiz da V4, nunca ao body", async ({ page }) => {
  const os = await semearOS(prisma);
  await abrirV4(page);
  await selecionarNaBusca(page, os.codigo);
  await irPosVenda(page);
  const raizFocada = () => page.evaluate(() => document.activeElement?.hasAttribute("data-og-v4-raiz") === true);

  // Gatilho presente: Fechar devolve o foco a ele (comportamento preservado).
  const gatilho = page.getByRole("button", { name: /^Abrir retorno$/ });
  await gatilho.click();
  const d = dialogo(page);
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(gatilho).toBeFocused();

  // R7-01: o servidor conclui a abertura, a resposta se perde; a ficha relê e o gatilho some.
  await gatilho.click();
  await expect(d).toBeVisible();
  await d.getByLabel("Motivo do retorno / novo defeito").fill("Touch falhando de novo");
  const soltar = await interceptarProximaAction(page, os.id, async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await d.getByRole("button", { name: "Abrir atendimento de retorno" }).click();
  await expect(d.getByRole("status")).toContainText("A abertura anterior foi concluída no servidor");
  await soltar();
  await expect(page.getByRole("button", { name: /^Abrir retorno$/ })).toHaveCount(0);
  await d.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(d).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  expect(await raizFocada()).toBe(true);
  // Tab segue navegando dentro da V4.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => {
    const raiz = document.querySelector("[data-og-v4-raiz]");
    const ativo = document.activeElement;
    return !!raiz && !!ativo && ativo !== document.body && raiz.contains(ativo);
  })).toBe(true);
  // Nada duplicado nem reaberto: UMA filha vinculada, seletor fechado.
  await expect(dialogo(page)).toHaveCount(0);
  const lista = await filhas(prisma, os.id);
  expect(lista).toHaveLength(1);
  expect((await lerOS(prisma, os.id)).retornosV3).toEqual([expect.objectContaining({ status: "aberto", osRetornoId: lista[0]!.id })]);
});
