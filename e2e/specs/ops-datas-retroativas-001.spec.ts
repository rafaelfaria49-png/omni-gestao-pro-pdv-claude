import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — datas efetivas no navegador real.
// Build de produção isolado (127.0.0.1, porta ≠ 3000) + PostgreSQL loopback
// descartável `ops_datas_qa*` + login QA sintético. Sem skip, sem sleep; rodar
// com `--retries=0` para nenhuma falha ficar escondida.

test.use({ storageState: "e2e/.auth/storage.json", serviceWorkers: "block" });

// Loja criada por `test/ops-datas-retroativas-001/qa-bootstrap.mjs`.
const LOJA = "000-qa-ops-datas";
const FUSO = "America/Sao_Paulo";
type Json = Record<string, any>;

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL locais descartáveis.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("E2E só aceita PostgreSQL loopback.");
  if (parsed[0]!.href !== parsed[1]!.href || !parsed[0]!.pathname.slice(1).startsWith("ops_datas_qa")) {
    throw new Error("E2E exige URLs idênticas do banco descartável ops_datas_qa*.");
  }
  return urls[0]!;
}

/** Dia civil na loja deslocado `n` dias (`YYYY-MM-DD`). */
function diaLoja(n: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
/** `YYYY-MM-DD HH:MM` de um instante, no fuso da loja (independe do código testado). */
function naLoja(iso: unknown): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(String(iso)));
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
const br = (dia: string) => dia.split("-").reverse().join("/");
const pertoDeAgora = (iso: unknown) => Math.abs(Date.parse(String(iso)) - Date.now()) < 5 * 60_000;
const marca = () => Date.now().toString(36);

test.beforeEach(async ({ page }) => {
  const origem = new URL(test.info().project.use.baseURL!);
  expect(origem.hostname).toBe("127.0.0.1");
  expect(origem.port).not.toBe("3000");
  // Loja QA fixa e onboarding dispensado só nesta sessão, antes da hidratação.
  await page.addInitScript((loja) => {
    localStorage.setItem("assistec-pro-loja-ativa-v1", loja);
    sessionStorage.setItem(`@omnigestao:first-access-wizard:dismissed:${loja}`, "1");
  }, LOJA);
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), (d) => d.getByRole("button", { name: /^Voltar depois$/i }).click());
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function abrirV4(page: Page) {
  const lojas = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/stores" && r.ok());
  const ordens = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
  await page.goto("/dashboard/operacoes-v4-preview");
  await Promise.all([lojas, ordens]);
  await dismissFirstAccessWizardIfPresent(page);
  expect(await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(LOJA);
}

async function lancar(page: Page, opcao: "Nova OS" | "Orçamento" | "Atendimento rápido") {
  const launcher = page.getByRole("main").getByTitle(/Novo atendimento/);
  await expect(launcher).toHaveCount(1);
  await launcher.click();
  const menu = page.getByRole("dialog", { name: "Novo atendimento" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button").filter({ has: page.getByText(opcao, { exact: true }) }).press("Enter");
}

async function abrirOS(page: Page, codigo: string) {
  await abrirV4(page);
  const busca = page.getByRole("main").getByRole("textbox", { name: "Buscar por Nº da OS, cliente, aparelho ou IMEI…", exact: true });
  await expect(busca).toHaveCount(1);
  await busca.fill(codigo);
  const seletor = page.getByRole("button", { name: new RegExp(codigo) });
  await expect(seletor).toHaveCount(1);
  await seletor.click();
}

async function preencherClienteAparelho(modal: Locator, cliente: string, telefone = "") {
  await modal.getByRole("button", { name: "Novo", exact: true }).click();
  await modal.getByPlaceholder("Nome do cliente").fill(cliente);
  if (telefone) await modal.getByPlaceholder("(11) 90000-0000").fill(telefone);
  await modal.getByPlaceholder("Samsung").fill("Samsung");
  await modal.getByPlaceholder("Galaxy S22").fill("Galaxy QA");
  await modal.getByPlaceholder(/Tela quebrada/).fill("Tela quebrada");
}

async function osDoCliente(prisma: PrismaClient, cliente: string) {
  const rows = await prisma.ordemServico.findMany({ where: { storeId: LOJA }, select: { id: true, createdAt: true, payload: true } });
  return rows.filter((r) => (r.payload as Json | null)?.cliente?.nome === cliente);
}

/** Linha "rótulo → valor" da coluna de contexto da OS. */
const contexto = (page: Page, rotulo: string) =>
  page.getByRole("complementary").filter({ hasText: "Trocar OS" }).getByText(rotulo, { exact: true }).locator("..");

/** Aceita o `window.confirm` da ação real e devolve a mensagem exibida ao operador. */
async function confirmarNativo(page: Page, acao: () => Promise<void>): Promise<string> {
  let mensagem = "";
  page.once("dialog", (d) => {
    expect(d.type()).toBe("confirm");
    mensagem = d.message();
    void d.accept();
  });
  await acao();
  await expect.poll(() => mensagem).not.toBe("");
  return mensagem;
}

/** A OS aberta entra em modo foco (sem coluna de contexto); sai dele para ler a coluna. */
async function sairDoFoco(page: Page) {
  await page.getByRole("button", { name: "Sair do foco" }).click();
  await expect(page.getByRole("complementary").filter({ hasText: "Trocar OS" })).toBeVisible();
}

async function semRolagemHorizontal(page: Page, alvo: Locator) {
  expect(await alvo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function capturar(page: Page, alvo: Locator, nome: string) {
  for (const [largura, altura] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: largura, height: altura });
    await alvo.scrollIntoViewIfNeeded();
    await expect(alvo).toBeVisible();
    await semRolagemHorizontal(page, alvo);
    await alvo.screenshot({ path: test.info().outputPath(`${nome}-${largura}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("V4 Nova OS: entrada anterior com horário e previsão combinada; o cadastro fica com o servidor", async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const cliente = `QA Datas NovaOS ${marca()}`;
  const entrada = diaLoja(-3);
  const previsao = diaLoja(2);
  try {
    await abrirV4(page);
    await lancar(page, "Nova OS");
    const modal = page.getByRole("dialog").filter({ hasText: "Nova Ordem de Serviço" });
    await expect(modal).toHaveCount(1);

    // Bloco logo após "Tipo de entrada" e antes do Cliente; rótulos e ajuda claros.
    const bloco = modal.getByRole("heading", { name: "Datas e prazos" }).locator("..");
    const y = async (l: Locator) => (await l.boundingBox())!.y;
    expect(await y(modal.getByText("Tipo de entrada", { exact: true }))).toBeLessThan(await y(bloco));
    expect(await y(bloco)).toBeLessThan(await y(modal.getByRole("button", { name: /^Cliente/ })));
    await expect(bloco.getByText(/Quando o aparelho realmente entrou na loja\./)).toBeVisible();
    await expect(bloco.getByText(/Quando você prevê entregar o aparelho ao cliente\./)).toBeVisible();
    await expect(modal.getByLabel(/^Data de entrada do aparelho/)).toHaveValue(diaLoja(0));
    await expect(modal.getByLabel(/^Previsão de entrega/)).toHaveValue("");
    await expect(modal.getByText("Previsão / SLA", { exact: true })).toHaveCount(0);

    await modal.getByRole("button", { name: /Precisa de diagnóstico/ }).click();
    await preencherClienteAparelho(modal, cliente);
    await modal.getByLabel(/^Data de entrada do aparelho/).fill(entrada);
    const hora = modal.getByLabel("Horário (opcional) — Data de entrada do aparelho");
    await expect(hora).toHaveValue("");
    await hora.fill("09:30");
    await modal.getByLabel(/^Previsão de entrega/).fill(previsao);
    await expect(modal.getByText("Entrada há 3 dias. O cadastro da OS continua com a data de hoje.", { exact: true })).toBeVisible();
    await capturar(page, bloco, "nova-os-datas");

    await modal.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
    await expect(modal).toBeHidden();

    const rows = await osDoCliente(prisma, cliente);
    expect(rows).toHaveLength(1);
    const p = rows[0]!.payload as Json;
    const recepcao = p.aberturaV3.recepcao;
    expect(naLoja(recepcao.dataEntrada)).toBe(`${entrada} 09:30`);
    expect(recepcao.dataEntradaMeta).toEqual({ precisao: "data_hora", dia: entrada });
    // Só-dia: âncora técnica 12:00 na loja, nunca exibida.
    expect(naLoja(recepcao.previsaoEntrega)).toBe(`${previsao} 12:00`);
    expect(recepcao.previsaoEntregaMeta).toEqual({ precisao: "dia", dia: previsao });
    // SLA espelha a promessa só-dia até o FIM do dia (nunca "atrasada" ao meio-dia).
    expect(p.sla.origemV3).toBe("informada");
    expect(naLoja(p.sla.prazo)).toBe(`${previsao} 23:59`);
    // Cadastro e auditoria = horário real do servidor.
    expect(pertoDeAgora(rows[0]!.createdAt.toISOString())).toBe(true);
    expect(pertoDeAgora(p.aberturaV3.criadoEm)).toBe(true);
    expect((p.timeline as Json[]).length).toBeGreaterThan(0);
    expect((p.timeline as Json[]).every((e) => pertoDeAgora(e.criadoEm))).toBe(true);

    await sairDoFoco(page);
    await expect(contexto(page, "Entrada")).toContainText(`${br(entrada)} 09:30`);
    await expect(contexto(page, "Previsão de entrega")).toContainText(br(previsao));
    await expect(contexto(page, "Previsão de entrega")).not.toContainText("12:00");
    console.log(`QA_DATAS_NOVA_OS: os=${rows[0]!.id} entrada=${entrada} previsao=${previsao}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("V4 Orçamento: proposta de dias atrás, validade coerente e nenhuma entrada fictícia", async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const cliente = `QA Datas Orcamento ${marca()}`;
  const proposta = diaLoja(-5);
  const validoAte = diaLoja(2);
  try {
    await abrirV4(page);
    await lancar(page, "Orçamento");
    const modal = page.getByRole("dialog").filter({ hasText: "Novo orçamento" });
    await expect(modal).toHaveCount(1);
    await expect(modal.getByLabel(/^Data do orçamento/)).toHaveValue(diaLoja(0));
    await expect(modal.getByLabel(/^Válido até/)).toHaveValue(diaLoja(7));
    await expect(modal.getByLabel("Tempo estimado após aprovação")).toBeVisible();
    const naLojaCheck = modal.getByRole("checkbox", { name: /Aparelho já está na loja/ });
    await expect(naLojaCheck).not.toBeChecked();
    await expect(modal.getByLabel(/^Data de entrada do aparelho/)).toHaveCount(0);

    await preencherClienteAparelho(modal, cliente, "11 98888-7777");
    await modal.getByPlaceholder("ESCOLHA A TELA").fill("Escolha a tela");
    const opcoes = modal.getByPlaceholder("Tela Premium");
    await expect(opcoes).toHaveCount(2);
    for (const [i, [rotulo, valor]] of [["Tela QA A", "300"], ["Tela QA B", "220"]].entries()) {
      const opcao = modal.getByText(`Opção ${i + 1}`, { exact: true }).locator("xpath=../..");
      await opcao.getByPlaceholder("Tela Premium").fill(rotulo!);
      await opcao.getByPlaceholder("R$").first().fill(valor!);
    }
    await modal.getByLabel(/^Data do orçamento/).fill(proposta);
    // Validade acompanha a proposta (7 dias), sem reset silencioso.
    await expect(modal.getByLabel(/^Válido até/)).toHaveValue(validoAte);
    await expect(modal.getByText(/Proposta de 5 dias atrás/)).toBeVisible();
    await capturar(page, modal.getByRole("region", { name: "Datas e prazos" }), "orcamento-datas");

    await modal.getByRole("button", { name: "Criar sem enviar" }).click();
    await expect(modal).toBeHidden();

    const rows = await osDoCliente(prisma, cliente);
    expect(rows).toHaveLength(1);
    const p = rows[0]!.payload as Json;
    expect(p.comercialV4).toMatchObject({ tipo: "orcamento_pre_os", dataPropostaMeta: { precisao: "dia", dia: proposta }, validadeDias: 7 });
    expect(naLoja(p.comercialV4.dataProposta)).toBe(`${proposta} 12:00`);
    expect(naLoja(p.orcamento.validoAte)).toBe(`${validoAte} 23:59`);
    // Proposta não é entrada física: sem "aparelho já está na loja", não há entrada.
    expect(p.aberturaV3?.recepcao?.dataEntrada ?? "").toBe("");
    expect(p.aberturaV3?.recepcao?.dataEntradaMeta).toBeUndefined();
    // Eventos reais nunca retrodatados: nada enviado, cadastro agora.
    expect(p.orcamento.enviadoEm).toBeUndefined();
    expect(pertoDeAgora(rows[0]!.createdAt.toISOString())).toBe(true);
    expect((p.timeline as Json[]).every((e) => pertoDeAgora(e.criadoEm))).toBe(true);
    console.log(`QA_DATAS_ORCAMENTO: os=${rows[0]!.id} proposta=${proposta} validoAte=${validoAte}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("V4 Atendimento rápido: serviço de dias atrás; o recebimento é agora, no caixa atual", async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const cliente = `QA Datas Atendimento ${marca()}`;
  const dia = diaLoja(-2);
  try {
    const sessao =
      (await prisma.sessaoCaixa.findFirst({ where: { storeId: LOJA, status: "ABERTA" } })) ??
      (await prisma.sessaoCaixa.create({ data: { storeId: LOJA, status: "ABERTA", operador: "QA Datas" } }));
    await abrirV4(page);
    await lancar(page, "Atendimento rápido");
    const modal = page.getByRole("dialog").filter({ hasText: "Serviço simples, pagamento e conclusão na hora." });
    await expect(modal).toHaveCount(1);
    await expect(modal.getByText("Caixa aberto", { exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "Novo", exact: true }).click();
    await modal.getByPlaceholder("Nome do cliente").fill(cliente);
    await modal.getByRole("button", { name: "Instalação de película", exact: true }).click();
    const datas = modal.getByRole("region", { name: "Datas do atendimento" });
    await expect(datas.getByLabel(/^Data do atendimento/)).toHaveValue(diaLoja(0));
    await datas.getByLabel(/^Data do atendimento/).fill(dia);
    await expect(datas.getByText("A data informa quando o serviço aconteceu. A confirmação registra o recebimento agora, no caixa atual.", { exact: true })).toBeVisible();
    await capturar(page, datas, "atendimento-datas");

    const aviso = await confirmarNativo(page, () => modal.getByRole("button", { name: "Finalizar e emitir recibo" }).click());
    expect(aviso).toContain(`com data de ${br(dia)}`);
    expect(aviso).toContain("O recebimento é registrado agora, no caixa atual.");
    await expect(modal).toBeHidden();

    const rows = await osDoCliente(prisma, cliente);
    expect(rows).toHaveLength(1);
    const p = rows[0]!.payload as Json;
    const ar = p.atendimentoRapidoV3;
    expect(naLoja(ar.concluidoEm)).toBe(`${dia} 12:00`);
    expect(ar.concluidoEmMeta).toEqual({ precisao: "dia", dia });
    expect(pertoDeAgora(ar.registradoEm)).toBe(true);
    expect(p.aberturaV3.recepcao.dataEntradaMeta).toEqual({ precisao: "dia", dia });
    // Timeline com o horário real; a data efetiva vai em campo próprio.
    const evento = (p.timeline as Json[]).find((e) => e.metadata?.atendimentoRapido === true);
    expect(evento).toBeTruthy();
    expect(pertoDeAgora(evento!.criadoEm)).toBe(true);
    expect(evento!.metadata.concluidoEm).toBe(ar.concluidoEm);
    // Pagamento nunca retrodatado: operação no caixa aberto, com o horário de agora.
    const caixa = await prisma.caixaOperacao.findMany({ where: { storeId: LOJA, payload: { path: ["ordemServicoId"], equals: rows[0]!.id } } });
    expect(caixa).toHaveLength(1);
    expect(caixa[0]!.sessaoId).toBe(sessao.id);
    expect(caixa[0]!.valor).toBe(20);
    expect(pertoDeAgora(caixa[0]!.at.toISOString())).toBe(true);
    console.log(`QA_DATAS_ATENDIMENTO: os=${rows[0]!.id} servico=${dia} caixa_at=${caixa[0]!.at.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("V4 Entrega de dias atrás pelo caminho canônico; depois Corrigir datas desloca a garantia sem refazer nada", async ({ page }) => {
  test.setTimeout(240_000);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const m = marca();
  const codigo = `OS-QA-DATAS-${m}`;
  const entrada = diaLoja(-10);
  const entrega = diaLoja(-3);
  const corrigida = diaLoja(-2);
  try {
    const sessao =
      (await prisma.sessaoCaixa.findFirst({ where: { storeId: LOJA, status: "ABERTA" } })) ??
      (await prisma.sessaoCaixa.create({ data: { storeId: LOJA, status: "ABERTA", operador: "QA Datas" } }));
    const entradaIso = new Date(`${entrada}T15:00:00.000Z`).toISOString();
    const id = `qa-datas-entrega-${m}`;
    const agora = new Date().toISOString();
    const os = await prisma.ordemServico.create({
      data: {
        id, storeId: LOJA, numero: codigo, status: "Pronto", equipamento: "Moto G QA", defeito: "Tela QA", valorTotal: 100,
        payload: {
          id, codigo, storeId: LOJA, clienteId: "", criadoEm: agora, atualizadoEm: agora, prioridade: "media", origem: "balcao",
          pecas: [], observacoes: [], anexos: [],
          cliente: { id: "", nome: `Cliente QA Entrega ${m}` }, equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "G QA", defeitoRelatado: "Tela QA" },
          status: "pronta", operacaoStatusV3: "pronta", valorTotal: 100, garantia: { ativa: false, prazoDias: 90 },
          orcamento: { id: `orc-${m}`, status: "aprovado", pecas: [], servicos: [{ id: "s1", descricao: "Troca de tela QA", valor: 100 }], desconto: 0, total: 100, criadoEm: new Date().toISOString() },
          aberturaV3: {
            versao: 1,
            recepcao: { dataEntrada: entradaIso, dataEntradaMeta: { precisao: "dia", dia: entrada }, origem: "balcao" },
            garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
          },
          timeline: [],
        },
      },
    });

    // Recebimento real AGORA, no caixa aberto (o guard da entrega exige quitação).
    await abrirOS(page, codigo);
    await page.getByRole("button").and(page.getByTitle("Financeiro", { exact: true })).click();
    await page.getByRole("button", { name: /^Receber R\$\s100,00$/ }).click();
    const receber = page.getByRole("dialog", { name: "Receber pagamento" });
    await receber.getByLabel("Forma da linha 1").selectOption("dinheiro");
    await expect(receber.getByLabel("Valor da linha 1")).toHaveValue("100");
    await receber.getByRole("button", { name: /Confirmar R\$\s100,00/ }).click();
    await expect(receber).toBeHidden();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    const caixaAntes = await prisma.caixaOperacao.findMany({ where: { storeId: LOJA, payload: { path: ["ordemServicoId"], equals: os.id } } });
    expect(caixaAntes).toHaveLength(1);
    expect(caixaAntes[0]!.sessaoId).toBe(sessao.id);

    // Entrega com data efetiva anterior.
    await page.getByRole("navigation", { name: "Pipeline operacional da OS" }).getByRole("button", { name: /Entrega/ }).click();
    const campo = page.getByLabel(/^Data da entrega/);
    await expect(campo).toHaveValue(diaLoja(0));
    await expect(page.getByText(/Quando o aparelho foi realmente entregue ao cliente\./)).toBeVisible();
    await campo.fill(entrega);
    await expect(page.getByText("Entrega com data anterior. O histórico guarda também o horário real deste registro.", { exact: true })).toBeVisible();
    await capturar(page, campo.locator("xpath=ancestor::div[.//button[normalize-space()='Confirmar entrega real']][1]"), "entrega-data");
    const aviso = await confirmarNativo(page, () => page.getByRole("button", { name: "Confirmar entrega real" }).click());
    expect(aviso).toBe(`Entrega real em ${br(entrega)}: ao confirmar, a OS será marcada como entregue no histórico. Confirmar?`);
    // "Confirmando…" também tira o rótulo do botão: espera o fim real da ação no servidor.
    await expect(page.getByRole("button", { name: /^(Confirmar entrega real|Confirmando…)$/ })).toHaveCount(0, { timeout: 60_000 });
    const lerOS = async () => (await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).payload as Json;
    await expect.poll(async () => (await lerOS()).operacaoStatusV3, { timeout: 30_000 }).toBe("entregue");

    const aposEntrega = await lerOS();
    expect(naLoja(aposEntrega.entregaV3.entregueEm)).toBe(`${entrega} 12:00`);
    expect(aposEntrega.entregaV3.entregueEmMeta).toEqual({ precisao: "dia", dia: entrega });
    expect(pertoDeAgora(aposEntrega.entregaV3.registradoEm)).toBe(true);
    expect(aposEntrega.entregueEm).toBe(aposEntrega.entregaV3.entregueEm);
    expect(aposEntrega.retirada.retiradoEm).toBe(aposEntrega.entregaV3.entregueEm);
    const eventosEntrega = (aposEntrega.timeline as Json[]).filter((e) => e.tipo === "entrega_cliente");
    expect(eventosEntrega).toHaveLength(1);
    expect(pertoDeAgora(eventosEntrega[0]!.criadoEm)).toBe(true);
    expect(eventosEntrega[0]!.metadata).toMatchObject({ entregueEm: aposEntrega.entregaV3.entregueEm, entregaRetroativa: true, precisao: "dia" });
    // O pagamento continua com o horário real em que aconteceu.
    expect(pertoDeAgora(caixaAntes[0]!.at.toISOString())).toBe(true);
    await expect(page.getByText("Data da entrega", { exact: true }).locator("..")).toContainText(br(entrega));
    await sairDoFoco(page);
    await expect(contexto(page, "Entrada")).toContainText(br(entrada));
    await expect(contexto(page, "Entrada")).not.toContainText("12:00");
    await expect(contexto(page, "Entrega")).toContainText(br(entrega));

    // Correção posterior: só a data; nada é entregue, cobrado ou registrado de novo.
    await page.getByTitle("Mais ações").click();
    await page.getByText("Ações da OS", { exact: true }).locator("..").getByRole("button", { name: /Corrigir datas/ }).click();
    const dlg = page.getByRole("dialog", { name: new RegExp(`Corrigir datas · ${codigo}`) });
    await expect(dlg).toBeVisible();
    const campoEntrega = dlg.getByLabel(/^Data da entrega/);
    await expect(campoEntrega).toHaveValue(entrega);
    await campoEntrega.fill(corrigida);
    const impacto = dlg.getByRole("region", { name: "Impacto na garantia" });
    await expect(impacto).toBeVisible();
    await dlg.getByPlaceholder("Ex.: o aparelho foi entregue na sexta e só registrei hoje.").fill("Data digitada errada no balcão.");
    await capturar(page, dlg, "corrigir-datas");
    // Sem a confirmação explícita da garantia nada é enviado (mesma regra do servidor).
    await dlg.getByRole("button", { name: "Salvar correção" }).click();
    await expect(dlg.getByText("Confira o impacto na garantia e confirme antes de salvar.")).toBeVisible();
    await expect(impacto.getByRole("checkbox")).toBeFocused();
    await impacto.getByRole("checkbox", { name: /Confirmo que a garantia passa a contar da nova data de entrega\./ }).check();
    await dlg.getByRole("button", { name: "Salvar correção" }).click();
    await expect(dlg).toBeHidden();

    const final = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).payload as Json;
    expect(naLoja(final.entregaV3.entregueEm)).toBe(`${corrigida} 12:00`);
    expect(final.entregaV3.entregueEmMeta).toEqual({ precisao: "dia", dia: corrigida });
    expect(final.entregueEm).toBe(final.entregaV3.entregueEm);
    expect(final.retirada.retiradoEm).toBe(final.entregaV3.entregueEm);
    // Registro original preservado; nenhum novo evento de entrega; auditoria agora.
    expect(final.entregaV3.registradoEm).toBe(aposEntrega.entregaV3.registradoEm);
    expect((final.timeline as Json[]).filter((e) => e.tipo === "entrega_cliente")).toHaveLength(1);
    const correcoes = (final.timeline as Json[]).filter((e) => e.metadata?.evento === "datas_corrigidas");
    expect(correcoes).toHaveLength(1);
    expect(pertoDeAgora(correcoes[0]!.criadoEm)).toBe(true);
    expect(correcoes[0]!.metadata.motivo).toBe("Data digitada errada no balcão.");
    expect(correcoes[0]!.metadata.campos).toEqual([{ campo: "dataEntrega", antes: aposEntrega.entregaV3.entregueEm, depois: final.entregaV3.entregueEm }]);
    expect(correcoes[0]!.metadata.garantia).toMatchObject({ inicioAntes: expect.any(String), inicioDepois: expect.any(String) });
    // Nada financeiro refeito.
    const caixaDepois = await prisma.caixaOperacao.findMany({ where: { storeId: LOJA, payload: { path: ["ordemServicoId"], equals: os.id } } });
    expect(caixaDepois.map((c) => c.id)).toEqual(caixaAntes.map((c) => c.id));
    expect(final.pagamentoV3).toEqual(aposEntrega.pagamentoV3);
    await expect(contexto(page, "Entrega")).toContainText(br(corrigida));
    await expect(page.getByText("Data da entrega", { exact: true }).locator("..")).toContainText(br(corrigida));
    await page.screenshot({ path: test.info().outputPath("entrega-corrigida-1440.png") });
    console.log(`QA_DATAS_ENTREGA: os=${os.id} entrega=${entrega} corrigida=${corrigida} caixa=${caixaAntes[0]!.id}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("V3 (paridade): OS entregue mostra as datas efetivas no workspace; Corrigir datas da V3 grava só a entrada", async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const m = marca();
  const id = `qa-datas-v3-${m}`;
  const codigo = `OS-QA-V3-${m}`;
  const entrada = diaLoja(-10);
  const previsao = diaLoja(-5);
  const entrega = diaLoja(-3);
  const novaEntrada = diaLoja(-12);
  // Âncora técnica só-dia = 12:00 em São Paulo (UTC-3, sem horário de verão).
  const ancora = (dia: string) => new Date(`${dia}T15:00:00.000Z`).toISOString();
  const agora = new Date().toISOString();
  try {
    await prisma.ordemServico.create({
      data: {
        id, storeId: LOJA, numero: codigo, status: "Entregue", equipamento: "Moto G QA", defeito: "Tela QA", valorTotal: 0,
        payload: {
          id, codigo, storeId: LOJA, clienteId: "", criadoEm: agora, atualizadoEm: agora, prioridade: "media", origem: "balcao",
          pecas: [], observacoes: [], anexos: [], garantia: { ativa: false },
          cliente: { id: "", nome: `Cliente QA V3 ${m}` }, equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "G QA", defeitoRelatado: "Tela QA" },
          status: "entregue", operacaoStatusV3: "entregue",
          aberturaV3: {
            versao: 1, criadoEm: agora,
            recepcao: {
              dataEntrada: ancora(entrada), dataEntradaMeta: { precisao: "dia", dia: entrada },
              previsaoEntrega: ancora(previsao), previsaoEntregaMeta: { precisao: "dia", dia: previsao }, origem: "balcao",
            },
          },
          sla: { prazo: ancora(previsao), status: "ok", origemV3: "informada" },
          entregueEm: ancora(entrega),
          retirada: { confirmado: true, retiradoPor: "Cliente QA", retiradoEm: ancora(entrega) },
          entregaV3: { entregueEm: ancora(entrega), entregueEmMeta: { precisao: "dia", dia: entrega }, registradoEm: agora, entreguePor: "QA", recebidoPor: "Cliente QA" },
          timeline: [],
        },
      },
    });

    const ordens = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/ops/ordens" && r.ok());
    await page.goto("/dashboard/operacoes-v3");
    await ordens;
    await dismissFirstAccessWizardIfPresent(page);
    // Hidratada = loja QA resolvida no cabeçalho e o painel interativo.
    await expect(page.getByText(new RegExp(`Loja ${LOJA}`))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard operacional" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir fila de OS", exact: true }).click();
    const visoes = page.getByRole("tablist", { name: "Visão da fila" });
    await expect(visoes).toBeVisible();
    await visoes.getByRole("tab", { name: /Lista/ }).click();
    await page.getByRole("textbox", { name: "Buscar ordens" }).fill(codigo);
    await page.getByRole("row").filter({ hasText: codigo }).click();

    // Leitura canônica na V3: entrada e entrega só-dia, sem horário inventado.
    await expect(page.getByText(br(entrada), { exact: true }).first()).toBeVisible();
    // Nenhum leitor exibe a âncora técnica (com ou sem vírgula, em qualquer bloco).
    for (const dia of [entrada, previsao, entrega]) await expect(page.getByText(new RegExp(`${br(dia)},? 12:00`))).toHaveCount(0);
    const etapas = page.getByRole("region", { name: "Etapas da OS" });
    await expect(etapas.getByRole("listitem").filter({ hasText: "Recebida" })).toContainText(br(entrada));
    await expect(etapas.getByRole("listitem").filter({ hasText: "Entregue" })).toContainText(br(entrega));
    await expect(page.getByText("Previsão / SLA", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("v3-workspace-1440.png") });

    await page.getByRole("button", { name: "Corrigir datas", exact: true }).first().click();
    const dlg = page.getByRole("dialog", { name: new RegExp(`Corrigir datas · ${codigo}`) });
    await expect(dlg).toBeVisible();
    const campoEntrada = dlg.getByLabel(/^Data de entrada do aparelho/);
    await expect(campoEntrada).toHaveValue(entrada);
    await expect(dlg.getByLabel(/^Data da entrega/)).toHaveValue(entrega);
    await campoEntrada.fill(novaEntrada);
    // Entrada não mexe na garantia: nenhuma confirmação de garantia é pedida.
    await expect(dlg.getByText("Confirmo que a garantia passa a contar da nova data de entrega.")).toHaveCount(0);
    await dlg.getByPlaceholder("Ex.: o aparelho foi entregue na sexta e só registrei hoje.").fill("Entrada lançada com o dia errado.");
    await capturar(page, dlg, "v3-corrigir-datas");
    await dlg.getByRole("button", { name: "Salvar correção" }).click();
    await expect(dlg).toBeHidden();

    const final = (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as Json;
    expect(naLoja(final.aberturaV3.recepcao.dataEntrada)).toBe(`${novaEntrada} 12:00`);
    expect(final.aberturaV3.recepcao.dataEntradaMeta).toEqual({ precisao: "dia", dia: novaEntrada });
    // Só o campo pedido muda: entrega, previsão e registro original intactos.
    expect(final.entregaV3).toEqual({ entregueEm: ancora(entrega), entregueEmMeta: { precisao: "dia", dia: entrega }, registradoEm: agora, entreguePor: "QA", recebidoPor: "Cliente QA" });
    expect(final.aberturaV3.recepcao.previsaoEntrega).toBe(ancora(previsao));
    const correcoes = (final.timeline as Json[]).filter((e) => e.metadata?.evento === "datas_corrigidas");
    expect(correcoes).toHaveLength(1);
    expect(pertoDeAgora(correcoes[0]!.criadoEm)).toBe(true);
    expect(correcoes[0]!.metadata.campos).toEqual([{ campo: "dataEntrada", antes: ancora(entrada), depois: final.aberturaV3.recepcao.dataEntrada }]);
    expect(correcoes[0]!.metadata.garantia).toBeUndefined();
    await expect(page.getByText(br(novaEntrada), { exact: true }).first()).toBeVisible();
    console.log(`QA_DATAS_V3: os=${id} entrada ${entrada} -> ${novaEntrada}`);
  } finally {
    await prisma.$disconnect();
  }
});
