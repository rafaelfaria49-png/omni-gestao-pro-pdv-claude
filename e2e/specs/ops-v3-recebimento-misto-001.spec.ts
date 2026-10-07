import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma";
import { dismissFirstAccessWizardIfPresent } from "../helpers";

/**
 * OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — PDV de Serviço V3 no app real (build local).
 *
 * Só PostgreSQL LOCAL DESCARTÁVEL (`ops_v3_misto_qa*`) com massa sintética. A prova é
 * feita pelo BANCO (título, pagamentos, caixa, saldo), não pelo toast.
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

/** Vencimento futuro em data civil (sem fuso): +30 dias a partir de hoje em São Paulo. */
function vencimentoFuturo(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + 30)).toISOString().slice(0, 10);
}

const brData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function abrirReceber(page: Page) {
  await page.goto("/dashboard/operacoes-v3");
  await dismissFirstAccessWizardIfPresent(page);
  // UI pronta ANTES do clique: a árvore do dashboard é remontada quando a loja ativa termina
  // de resolver (`OperationsProvider key={opsStorageKey}` em app-ops-providers.tsx), e a
  // remontagem devolve o shell à aba inicial — um clique anterior se perde. "Precisa de
  // atenção" só renderiza com a loja já resolvida (storeId); daí em diante a chave é final.
  await expect(page.getByRole("heading", { name: "Precisa de atenção", exact: true })).toBeVisible();
  const aba = page.getByRole("navigation", { name: "Operações" }).getByRole("button", { name: "Receber", exact: true });
  await expect(aba).toBeVisible();
  await aba.click();
  await expect(aba).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Ordem de serviço", { exact: true })).toBeVisible();
}

async function lojaAtiva(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBeTruthy();
  return (await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")))!;
}

test("PDV de Serviço V3 — débito 350 + 50 a prazo num título único; depois os 50 quitam o MESMO título", async ({ page }) => {
  // O assistente de primeira loja abre de forma assíncrona (depois da carga da loja) e
  // cobre a tela: fecha-o sempre que aparecer, antes da próxima ação.
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click();
  });
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() });
  const venc = vencimentoFuturo();
  const marca = Date.now().toString(36);
  const codigo = `OS-E2E-${marca}`;
  try {
    await abrirReceber(page);
    const storeId = await lojaAtiva(page);

    // Massa sintética na loja ativa: OS com DOIS serviços (300 + 100) e caixa aberto.
    const osRow = await prisma.ordemServico.create({
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
          cliente: { nome: `Cliente E2E ${marca}` },
          equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
          status: "pronta",
          operacaoStatusV3: "pronta",
          orcamento: {
            id: `orc-${marca}`,
            status: "aprovado",
            pecas: [],
            servicos: [
              { id: `s1-${marca}`, descricao: "Troca de tela", valor: 300 },
              { id: `s2-${marca}`, descricao: "Limpeza interna", valor: 100 },
            ],
            desconto: 0,
            total: 400,
            criadoEm: new Date().toISOString(),
          },
          valorTotal: 400,
          timeline: [],
        },
      },
    });
    const osId = osRow.id;
    const aberta = await prisma.sessaoCaixa.findFirst({ where: { storeId, status: "ABERTA" }, orderBy: { abertaEm: "desc" } });
    const sessao = aberta ?? (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA E2E", status: "ABERTA" } }));

    // Recarrega para a lista da V3 enxergar a OS sintética recém-criada.
    await abrirReceber(page);
    const seletor = page.getByRole("combobox").filter({ has: page.locator(`option[value="${osId}"]`) });
    await seletor.selectOption(osId);
    // A lista V3 hidrata o cliente pela relação `Cliente` (a OS sintética não tem): basta o código.
    await expect(page.getByRole("heading", { name: new RegExp(`^${codigo} · `) })).toBeVisible();
    await expect(page.getByText("Saldo a receber")).toBeVisible();

    // Pagamento dividido: Débito 350 + "A prazo / crediário" (sugere os 50 restantes).
    await page.getByLabel(/Pagamento dividido/).check();
    await page.getByLabel("Forma da linha 1").selectOption("debito");
    await page.getByLabel("Valor da linha 1").fill("350");
    await page.getByRole("button", { name: /A prazo \/ crediário/ }).click();
    await expect(page.getByLabel("Valor da linha 2")).toHaveValue("50,00");
    const confirmar = page.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ });
    await expect(confirmar).toBeDisabled();
    await page.getByLabel("Vencimento da parte a prazo").fill(venc);
    const resumo = page.getByTestId("resumo-misto");
    await expect(resumo).toContainText("Deixar a prazo");
    await expect(resumo).toContainText(brData(venc));
    await expect(confirmar).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("1-resumo-antes-de-confirmar.png"), fullPage: true });
    await confirmar.click();
    await expect(page.getByText(/Recebido R\$\s350,00 \+ R\$\s50,00 a prazo/)).toBeVisible();

    // Prova pelo BANCO.
    const localKey = `os-faturamento:${storeId}:${osId}`;
    const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } });
    expect(titulos).toHaveLength(1);
    const titulo = titulos[0]!;
    expect(titulo).toMatchObject({ valor: 400, status: "parcial", vencimento: venc });
    const historico = ((titulo.payload as { historico?: Array<{ tipo: string; valor: number }> }).historico ?? []);
    expect(historico.filter((e) => e.tipo === "pagamento").map((e) => e.valor)).toEqual([350]);
    expect(historico.filter((e) => e.tipo === "a_prazo_autorizado").map((e) => e.valor)).toEqual([50]);
    const caixa = await prisma.caixaOperacao.findMany({ where: { storeId, sessaoId: sessao.id, payload: { path: ["ordemServicoId"], equals: osId } } });
    expect(caixa.map((c) => [c.tipo, c.valor, (c.payload as { formaPagamento?: string }).formaPagamento])).toEqual([["recebimento_cr", 350, "debito"]]);
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: titulo.id } });
    expect(movs.map((m) => [m.tipo, m.valor])).toEqual([["entrada", 350]]);
    const osDepois = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload as Record<string, any>;
    expect(osDepois.pagamentoV3).toMatchObject({ total: 400, recebido: 350, saldo: 50, status: "parcial" });
    expect(osDepois.aPrazoV3).toMatchObject({ valor: 50, vencimento: venc, status: "pendente" });

    // Comprovante: recebido 350 ≠ saldo a prazo 50; nunca "Quitação".
    await page.getByRole("button", { name: /Imprimir comprovante/ }).click();
    const recibo = page.locator("#og-recibo-root");
    await expect(recibo).toContainText("Recebido nesta operação");
    await expect(recibo).toContainText("Saldo a prazo");
    await expect(recibo).toContainText(brData(venc));
    await expect(recibo).toContainText("Pagamento parcial — saldo a prazo");
    await expect(recibo).not.toContainText("Quitação");
    await recibo.screenshot({ path: test.info().outputPath("2-comprovante-misto.png") });
    await page.getByRole("button", { name: /Voltar/ }).click();

    // Reabrir: saldo e vencimento vêm do servidor.
    await abrirReceber(page);
    await seletor.selectOption(osId);
    const persistido = page.getByTestId("a-prazo-persistido");
    await expect(persistido).toContainText(/Saldo a prazo: R\$\s50,00/);
    await expect(persistido).toContainText(`Vencimento ${brData(venc)}`);

    // Pagamento posterior dos 50: fluxo normal, MESMO título → quitado.
    await page.getByRole("button", { name: "Dinheiro", exact: true }).click();
    const quitar = page.getByRole("button", { name: /Quitar OS · R\$\s50,00/ });
    await expect(quitar).toBeEnabled();
    await quitar.click();
    await expect(page.getByText("OS quitada.", { exact: true }).first()).toBeVisible();
    const final = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } });
    expect(final).toHaveLength(1);
    expect(final[0]!.id).toBe(titulo.id);
    expect(final[0]!.status).toBe("pago");
    const histFinal = ((final[0]!.payload as { historico?: Array<{ tipo: string; valor: number }> }).historico ?? []);
    const recebido = histFinal.reduce((acc, e) => acc + (e.tipo === "pagamento" || e.tipo === "liquidacao" ? e.valor : e.tipo === "estorno_pagamento" ? -e.valor : 0), 0);
    expect(recebido).toBe(400);
    console.log(`[OPS-V3-RECEBIMENTO-MISTO-001] loja=${storeId} os=${osId} titulo=${titulo.id} venc=${venc}`);
  } finally {
    await prisma.$disconnect();
  }
});
