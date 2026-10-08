// @vitest-environment node
//
// OPS-V4-FLUXO-CURTO-005 — integração PostgreSQL real (P01–P08). Actions V3
// REAIS (as mesmas que a próxima ação aciona) e o reader REAL da projeção
// financeira, sobre massa sintética em banco local descartável. Identidade só no
// seam de sessão (stub de @/auth + gate ok). Ausência de ambiente =
// BLOQUEIO_EXPLICITO_PG (nunca skip). A derivação é lida SEMPRE do read-back.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-005", name: "Operador QA 005", role: "ADMIN" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { Prisma, PrismaClient } from "@/generated/prisma";
import { aplicarTransicaoStatusV3 } from "@/lib/operacoes-v3/status-actions";
import { receberOSV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";
import { derivarProximaAcaoV4, type ProximaAcaoV4 } from "@/lib/operacoes-v4/proxima-acao-v4";
// Helper OFICIAL do repositório (`financeiro:seed`): cria o título canônico
// (os-faturamento) ausente — mesmo padrão de import do hardening-p1 (#238).
type SeedModulo = {
  seedContasReceberOS: (
    db: PrismaClient,
    opts: { storeId: string; dryRun: boolean; log?: (...a: unknown[]) => void; logError?: (...a: unknown[]) => void },
  ) => Promise<unknown>;
};
const seedModulo = async (): Promise<SeedModulo> => (await import("../../scripts/seed-contas-receber-os.mjs")) as unknown as SeedModulo;

function exigirBancoLocal(): string {
  const urls = [
    process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
  ].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) {
    throw new Error(
      "BLOQUEIO_EXPLICITO_PG: configure OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL " +
        "para o PostgreSQL local descartável. Ausência de ambiente é impedimento, não aprovação.",
    );
  }
  const alvos = urls.map((v) => new URL(v));
  if (alvos.some((u) => !["127.0.0.1", "localhost", "::1"].includes(u.hostname.toLowerCase()))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (alvos.some((u) => chave(u) !== chave(alvos[0]!))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao mesmo banco descartável.");
  }
  return urls[0]!;
}

const prisma = new PrismaClient({ datasourceUrl: exigirBancoLocal() });
const sufixo = Date.now().toString(36);
const storeId = `loja-pg-005-${sufixo}`;
const criadoEm = "2026-10-07T12:00:00.000Z";
let seq = 0;

afterAll(async () => {
  await prisma.$disconnect();
});

type Evento = { tipo: string; metadata?: Record<string, unknown> };
type Payload = { operacaoStatusV3?: string; status?: string; timeline: Evento[]; entregueEm?: string; entregaV3?: unknown; orcamento?: { status?: string; sintetizado?: boolean } };

async function criarOS(statusV3: string, valorTotal = 400): Promise<string> {
  const n = ++seq;
  const numero = `OS-PG-005-${sufixo}-${n}`;
  const statusV2 = statusV3 === "recebida" ? "pronta" : statusV3;
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero,
      equipamento: "Samsung Galaxy QA",
      defeito: "Tela quebrada",
      status: "EmAnalise",
      valorTotal,
      payload: {
        storeId,
        codigo: numero,
        criadoEm,
        cliente: { nome: `Cliente PG 005 ${sufixo}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada" },
        status: statusV2,
        operacaoStatus: statusV2,
        operacaoStatusV3: statusV3,
        valorTotal,
        orcamento: {
          id: `orc-${n}`,
          status: "aprovado",
          sintetizado: false,
          respondidoEm: criadoEm,
          servicos: [{ id: `srv-${n}`, descricao: "Troca de tela", valor: valorTotal }],
          pecas: [],
          desconto: 0,
          total: valorTotal,
          criadoEm,
        },
        timeline: [{ id: `ev-${n}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm }],
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

async function lerOS(id: string) {
  const row = await prisma.ordemServico.findUniqueOrThrow({ where: { id }, select: { id: true, payload: true } });
  return { id: row.id, ...(row.payload as unknown as Payload) };
}

/** Próxima ação derivada do READ-BACK (OS + projeção financeira real). */
async function proximaAcao(id: string): Promise<ProximaAcaoV4> {
  const os = await lerOS(id);
  const projection = await lerProjecaoFinanceiraOSV4(storeId, id);
  return derivarProximaAcaoV4({
    os,
    carga: "estabelecida",
    orcamento: { materializado: !!os.orcamento && os.orcamento.sintetizado !== true, status: os.orcamento?.status ?? null },
    financeiro: { projection, loading: false, error: null },
  });
}

const mudancas = (os: Payload) => os.timeline.filter((e) => e.tipo === "mudanca_status");

async function efeitos() {
  const [titulos, caixa, movimentos, vendas, estoque] = await Promise.all([
    prisma.contaReceberTitulo.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.venda.count({ where: { storeId } }),
    prisma.movimentacaoEstoque.count({ where: { storeId } }),
  ]);
  return { titulos, caixa, movimentos, vendas, estoque };
}

describe("OPS-V4-FLUXO-CURTO-005 — PostgreSQL descartável (P01–P08)", () => {
  it("prepara loja sintética", async () => {
    await prisma.store.create({ data: { id: storeId, name: `Loja PG 005 ${sufixo}` } });
  });

  it("P01 aberta → próxima ação 'Iniciar diagnóstico' grava UMA transição real para diagnóstico", async () => {
    const id = await criarOS("aberta");
    const antes = await efeitos();
    const acao = await proximaAcao(id);
    expect(acao).toMatchObject({ escrita: "iniciar_diagnostico", efeito: "write" });
    await aplicarTransicaoStatusV3(storeId, id, "diagnostico"); // = iniciarDiagnostico
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("diagnostico");
    expect(mudancas(os)).toHaveLength(1);
    expect((await proximaAcao(id)).titulo).toBe("Revisar orçamento");
    expect(await efeitos()).toEqual(antes);
  });

  it("P02 aprovado → 'Iniciar execução' grava em_execucao uma única vez; depois aponta à Execução", async () => {
    const id = await criarOS("aprovado");
    const antes = await efeitos();
    expect(await proximaAcao(id)).toMatchObject({ escrita: "iniciar_execucao", stage: "execucao" });
    await aplicarTransicaoStatusV3(storeId, id, "em_execucao"); // = iniciarServico
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("em_execucao");
    expect(mudancas(os)).toHaveLength(1);
    expect(await proximaAcao(id)).toMatchObject({ titulo: "Marcar como pronta", efeito: "navigate", stage: "execucao" });
    expect(os.entregueEm).toBeUndefined();
    expect(await efeitos()).toEqual(antes);
  });

  let osPronta = "";
  it("P03 em_execucao → pronta pela ação real da etapa; a próxima ação passa a depender do financeiro (nunca entrega às cegas)", async () => {
    osPronta = await criarOS("em_execucao");
    expect((await proximaAcao(osPronta)).escrita).toBeUndefined(); // navegar não marca pronta
    expect((await lerOS(osPronta)).operacaoStatusV3).toBe("em_execucao");
    await aplicarTransicaoStatusV3(storeId, osPronta, "pronta"); // = marcarPronta (botão da Execução)
    const os = await lerOS(osPronta);
    expect(os.operacaoStatusV3).toBe("pronta");
    expect(mudancas(os)).toHaveLength(1);
    const acao = await proximaAcao(osPronta);
    expect(acao.stage).toBe("financeiro");
    expect(acao.id).not.toBe("confirmar-entrega");
  });

  let sessaoId = "";
  it("P04 pronta com saldo (título canônico + pagamento parcial 350) → 'Receber pagamento' no Financeiro", async () => {
    await (await seedModulo()).seedContasReceberOS(prisma, { storeId, dryRun: false, log: () => {}, logError: () => {} });
    expect(await proximaAcao(osPronta)).toMatchObject({ titulo: "Receber pagamento", stage: "financeiro", efeito: "navigate" });
    sessaoId = (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA 005", status: "ABERTA" } })).id;
    await receberOSV3(storeId, osPronta, { valor: 350, forma: "dinheiro", sessaoId });
    const parcial = await proximaAcao(osPronta);
    expect(parcial).toMatchObject({ titulo: "Receber pagamento", stage: "financeiro" });
    expect(parcial.descricao).toMatch(/R\$\s?50,00/);
  });

  it("P05 pronta quitada (350+50 pelo helper oficial) → 'Confirmar entrega', só navegando à Entrega", async () => {
    await receberOSV3(storeId, osPronta, { valor: 50, forma: "pix", sessaoId });
    expect(await proximaAcao(osPronta)).toMatchObject({ titulo: "Confirmar entrega", stage: "entrega", efeito: "navigate" });
  });

  it("P06 confirmar entrega continua separado: derivar/navegar não entrega (status segue pronta)", async () => {
    const antes = await efeitos();
    await proximaAcao(osPronta);
    await proximaAcao(osPronta);
    const os = await lerOS(osPronta);
    expect(os.operacaoStatusV3).toBe("pronta");
    expect(os.entregueEm).toBeUndefined();
    expect(os.entregaV3).toBeUndefined();
    expect(os.timeline.some((e) => e.tipo === "entrega_cliente")).toBe(false);
    expect(await efeitos()).toEqual(antes);
  });

  it("P07 duas requisições rápidas da mesma escrita → uma transição e um evento", async () => {
    const id = await criarOS("aprovado");
    const resultados = await Promise.allSettled([
      aplicarTransicaoStatusV3(storeId, id, "em_execucao"),
      aplicarTransicaoStatusV3(storeId, id, "em_execucao"),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(recusa.reason?.message ?? recusa.reason)).toMatch(/já está neste status|Não é possível mover/);
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("em_execucao");
    expect(mudancas(os).filter((e) => e.metadata?.para === "em_execucao")).toHaveLength(1);
  });

  it("P08 troca concorrente de estado → a escrita velha é recusada e a releitura deriva a ação nova", async () => {
    const id = await criarOS("aprovado");
    const snapshot = await proximaAcao(id);
    expect(snapshot.escrita).toBe("iniciar_execucao");
    await aplicarTransicaoStatusV3(storeId, id, "em_execucao"); // outra sessão iniciou antes
    await expect(aplicarTransicaoStatusV3(storeId, id, "em_execucao")).rejects.toThrow(); // clique com snapshot velho
    const os = await lerOS(id);
    expect(mudancas(os)).toHaveLength(1);
    expect(await proximaAcao(id)).toMatchObject({ titulo: "Marcar como pronta", efeito: "navigate" });
  });

  it("aguardando aprovação → espera honesta; nada aprova sozinho", async () => {
    const id = await criarOS("aguardando_aprovacao");
    const acao = await proximaAcao(id);
    expect(acao).toMatchObject({ estado: "aguardando", efeito: "navigate", stage: "orcamento" });
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("aguardando_aprovacao");
    expect(mudancas(os)).toHaveLength(0);
  });
});
