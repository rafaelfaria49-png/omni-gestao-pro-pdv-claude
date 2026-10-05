import { expect, test, type Page, type Route } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

/**
 * OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — PDV de Serviço V3 no app real (build local).
 *
 * Só PostgreSQL LOCAL DESCARTÁVEL (`ops_v3_misto_qa*`) com massa sintética. A prova é feita
 * pelo BANCO (título, pagamentos, caixa, movimentação), não pelo toast.
 *
 * E2E-C: resposta PERDIDA de verdade — a Server Action chega ao servidor e grava (route.fetch),
 *        mas o navegador recebe falha de rede (route.abort). A tela relê o saldo (300) e o
 *        operador representa a MESMA confirmação como PIX 50 + PIX 50 → replay, sem 2ª baixa.
 * E2E-D: a resposta da OS A é SEGURADA até o operador trocar para a OS B e digitar o rascunho
 *        de B; liberada a resposta de A, nada do rascunho de B some.
 */

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL do banco local descartável.");
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) {
    throw new Error("E2E só aceita PostgreSQL em loopback.");
  }
  if (parsed[0]!.href !== parsed[1]!.href) throw new Error("E2E exige DATABASE_URL e DIRECT_URL idênticas.");
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("ops_v3_misto_qa")) {
    throw new Error("E2E só roda no banco descartável ops_v3_misto_qa*.");
  }
  return urls[0]!;
}

function vencimentoFuturo(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + 30)).toISOString().slice(0, 10);
}

async function abrirReceber(page: Page) {
  await page.goto("/dashboard/operacoes-v3");
  await dismissFirstAccessWizardIfPresent(page);
  const aba = page.getByRole("navigation", { name: "Operações" }).getByRole("button", { name: "Receber", exact: true });
  await expect(aba).toBeVisible();
  await aba.click();
  await expect(page.getByText("Ordem de serviço", { exact: true })).toBeVisible();
}

async function lojaAtiva(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBeTruthy();
  return (await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")))!;
}

async function criarOS(prisma: PrismaClient, storeId: string, codigo: string, marca: string): Promise<string> {
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: codigo,
      equipamento: "Samsung A54",
      defeito: "Tela quebrada",
      valorTotal: 400,
      status: "Pronto",
      payload: {
        codigo,
        storeId,
        cliente: { nome: `Cliente ${codigo}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
        status: "pronta",
        operacaoStatusV3: "pronta",
        orcamento: {
          id: `orc-${codigo}-${marca}`,
          status: "aprovado",
          pecas: [],
          servicos: [{ id: `s-${codigo}-${marca}`, descricao: "Troca de tela", valor: 400 }],
          desconto: 0,
          total: 400,
          criadoEm: new Date().toISOString(),
        },
        valorTotal: 400,
        timeline: [],
      },
    },
  });
  return row.id;
}

async function caixaAberto(prisma: PrismaClient, storeId: string): Promise<string> {
  const aberta = await prisma.sessaoCaixa.findFirst({ where: { storeId, status: "ABERTA" }, orderBy: { abertaEm: "desc" } });
  return (aberta ?? (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA E2E", status: "ABERTA" } }))).id;
}

async function efeitos(prisma: PrismaClient, storeId: string, osId: string) {
  const localKey = `os-faturamento:${storeId}:${osId}`;
  const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } });
  const historico = ((titulos[0]?.payload as { historico?: Array<{ tipo: string; valor: number }> } | undefined)?.historico ?? []);
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId, payload: { path: ["ordemServicoId"], equals: osId } }, orderBy: { at: "asc" } });
  const movs = titulos[0] ? await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: titulos[0].id } }) : [];
  return {
    titulos: titulos.length,
    pagamentos: historico.filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao").map((e) => e.valor),
    marcadores: historico.filter((e) => e.tipo === "a_prazo_autorizado").map((e) => e.valor),
    caixa: caixa.map((c) => c.valor),
    movs: movs.map((m) => m.valor),
  };
}

const ehServerAction = (route: Route) => route.request().method() === "POST" && !!route.request().headers()["next-action"];

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click();
  });
});

test("E2E-C · resposta perdida no PIX 100 → saldo relido 300 → PIX 50 + PIX 50 reaproveita a chave: UMA baixa", async ({ page }) => {
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const marca = Date.now().toString(36);
  const codigo = `OS-E2E-C-${marca}`;
  try {
    await abrirReceber(page);
    const storeId = await lojaAtiva(page);
    const osId = await criarOS(prisma, storeId, codigo, marca);
    await caixaAberto(prisma, storeId);

    await abrirReceber(page);
    const seletor = page.getByRole("combobox").filter({ has: page.locator(`option[value="${osId}"]`) });
    await seletor.selectOption(osId);
    await expect(page.getByRole("heading", { name: new RegExp(`^${codigo} · `) })).toBeVisible();
    await expect(page.getByText("Saldo a receber")).toBeVisible();

    // A PRÓXIMA Server Action de recebimento chega ao servidor (grava) e a resposta é perdida.
    let perdida = 0;
    await page.route("**/*", async (route) => {
      if (perdida === 0 && ehServerAction(route) && (route.request().postData() ?? "").includes("operacaoId")) {
        perdida += 1;
        await route.fetch();
        await route.abort("failed");
        return;
      }
      await route.fallback();
    });

    await page.getByRole("button", { name: "PIX", exact: true }).click();
    await page.getByLabel(/Valor a receber/).fill("100");
    await page.getByRole("button", { name: /^Receber · R\$\s100,00/ }).click();
    await expect.poll(() => perdida).toBe(1);
    // A gravação aconteceu no servidor, mas a tela não sabe: relê o saldo REAL (300).
    await expect.poll(async () => (await efeitos(prisma, storeId, osId)).pagamentos).toEqual([100]);
    await expect(page.locator("dd").filter({ hasText: /R\$\s300,00/ }).first()).toBeVisible();

    // O operador representa a MESMA confirmação como PIX 50 + PIX 50.
    await page.getByLabel(/Pagamento dividido/).check();
    await page.getByLabel("Forma da linha 1").selectOption("pix");
    await page.getByLabel("Valor da linha 1").fill("50");
    await page.getByRole("button", { name: /Adicionar forma/ }).click();
    await page.getByLabel("Forma da linha 2").selectOption("pix");
    await page.getByLabel("Valor da linha 2").fill("50");
    await page.getByRole("button", { name: /^Receber · R\$\s100,00/ }).click();
    await expect(page.getByText("Pagamento registrado.", { exact: true }).first()).toBeVisible();

    const depoisReplay = await efeitos(prisma, storeId, osId);
    expect(depoisReplay).toMatchObject({ titulos: 1, pagamentos: [100], caixa: [100], movs: [100] });

    // Recebimento NOVO legítimo sobre o novo saldo (300): outra chave, aceito.
    await page.getByLabel(/Pagamento dividido/).uncheck();
    await page.getByRole("button", { name: "PIX", exact: true }).click();
    await page.getByLabel(/Valor a receber/).fill("20");
    await page.getByRole("button", { name: /^Receber · R\$\s20,00/ }).click();
    await expect.poll(async () => (await efeitos(prisma, storeId, osId)).pagamentos).toEqual([100, 20]);
    const final = await efeitos(prisma, storeId, osId);
    expect(final).toMatchObject({ titulos: 1, pagamentos: [100, 20], caixa: [100, 20], movs: [100, 20] });
    console.log(`[E2E-C] loja=${storeId} os=${osId} efeitos=${JSON.stringify(final)}`);
  } finally {
    await prisma.$disconnect();
  }
});

test("E2E-D · OS A confirma, operador troca para B e digita antes da resposta de A: rascunho de B intacto", async ({ page }) => {
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const venc = vencimentoFuturo();
  const marca = Date.now().toString(36);
  const codigoA = `OS-E2E-DA-${marca}`;
  const codigoB = `OS-E2E-DB-${marca}`;
  try {
    await abrirReceber(page);
    const storeId = await lojaAtiva(page);
    const osA = await criarOS(prisma, storeId, codigoA, marca);
    const osB = await criarOS(prisma, storeId, codigoB, marca);
    await caixaAberto(prisma, storeId);

    await abrirReceber(page);
    const seletor = page.getByRole("combobox").filter({ has: page.locator(`option[value="${osA}"]`) });
    await seletor.selectOption(osA);
    await expect(page.getByRole("heading", { name: new RegExp(`^${codigoA} · `) })).toBeVisible();

    // Débito 350 + 50 a prazo em A.
    await page.getByLabel(/Pagamento dividido/).check();
    await page.getByLabel("Forma da linha 1").selectOption("debito");
    await page.getByLabel("Valor da linha 1").fill("350");
    await page.getByRole("button", { name: /A prazo \/ crediário/ }).click();
    await page.getByLabel("Vencimento da parte a prazo").fill(venc);

    // A resposta da confirmação de A fica SEGURADA (o servidor já gravou) até liberarmos.
    let liberar!: () => void;
    const segurada = new Promise<void>((r) => (liberar = r));
    let chegou = false;
    await page.route("**/*", async (route) => {
      if (!chegou && ehServerAction(route) && (route.request().postData() ?? "").includes("saldoAPrazo")) {
        chegou = true;
        const resposta = await route.fetch();
        await segurada;
        await route.fulfill({ response: resposta });
        return;
      }
      await route.fallback();
    });
    await page.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ }).click();
    await expect.poll(() => chegou).toBe(true);
    await expect.poll(async () => (await efeitos(prisma, storeId, osA)).pagamentos).toEqual([350]);

    // Troca para B e digita o rascunho de B. As Server Actions do Next.js passam por UMA fila
    // no cliente: a leitura do saldo de B só roda depois que a resposta de A for liberada.
    // Por isso o rascunho de B é preenchido EXPLICITAMENTE (a sugestão automática do "a prazo"
    // depende do saldo de B, ainda não lido) e conferido ANTES de liberar A.
    await seletor.selectOption(osB);
    await expect(page.getByRole("heading", { name: new RegExp(`^${codigoB} · `) })).toBeVisible();
    await expect(page.getByLabel("Valor da linha 1")).toHaveValue("");
    await page.getByLabel("Forma da linha 1").selectOption("pix");
    await page.getByLabel("Valor da linha 1").fill("100");
    await page.getByRole("button", { name: /A prazo \/ crediário/ }).click();
    await expect(page.getByLabel("Forma da linha 2")).toHaveValue("a_prazo");
    await page.getByLabel("Valor da linha 2").fill("300,00");
    await page.getByLabel("Vencimento da parte a prazo").fill(venc);
    await page.getByLabel("Observação da parte a prazo").fill("rascunho de B");
    const rascunhoB = async () => {
      await expect(page.getByRole("heading", { name: new RegExp(`^${codigoB} · `) })).toBeVisible();
      await expect(page.getByLabel("Forma da linha 1")).toHaveValue("pix");
      await expect(page.getByLabel("Valor da linha 1")).toHaveValue("100");
      await expect(page.getByLabel("Forma da linha 2")).toHaveValue("a_prazo");
      await expect(page.getByLabel("Valor da linha 2")).toHaveValue("300,00");
      await expect(page.getByLabel("Vencimento da parte a prazo")).toHaveValue(venc);
      await expect(page.getByLabel("Observação da parte a prazo")).toHaveValue("rascunho de B");
    };
    await rascunhoB();
    expect(chegou).toBe(true);

    // Libera a resposta de A com o operador em B.
    liberar();
    await expect(page.getByText(new RegExp(`^${codigoA}: Registrado`)).first()).toBeVisible();

    // Saldo REAL de B carregado (400): o rascunho de B continua igual e VÁLIDO para B.
    await expect(page.getByRole("button", { name: /Registrar R\$\s100,00 \+ R\$\s300,00 a prazo/ })).toBeEnabled();
    await rascunhoB();

    // Banco: A gravou uma vez; B intocada.
    expect(await efeitos(prisma, storeId, osA)).toMatchObject({ titulos: 1, pagamentos: [350], marcadores: [50], caixa: [350], movs: [350] });
    expect(await efeitos(prisma, storeId, osB)).toMatchObject({ titulos: 0, pagamentos: [], caixa: [], movs: [] });
    console.log(`[E2E-D] loja=${storeId} osA=${osA} osB=${osB}`);
  } finally {
    await prisma.$disconnect();
  }
});
