import { describe, expect, it, vi, afterAll } from "vitest";

// OPS-V4-FLUXO-CURTO-001 / R01+R02 — escrita/leitura coerente + concorrência.
//
// CAMADA: integração PG real (duas conexões, transações sobrepostas).
// REQUISITO DE AMBIENTE (falha explícita, nunca skip): banco descartável
// local provisionado com o schema vigente, apontado por
// OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL (mesmo
// alvo local). Sem isso a COLETA lança BLOQUEIO_EXPLICITO — ausência de
// ambiente é impedimento, não caso aprovado.
//
// Identidade é limitada ao seam de sessão (stub de @/auth com usuário QA +
// gate ok) SOMENTE para alcançar a lógica de concorrência sob teste; o login
// real é coberto na camada E2E. O caminho condicional (updateMany por
// updatedAt), a mesclagem sobre o LATEST e o erro de conflito são o código
// real de produção, sem bypass.

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "qa-fluxo-curto", name: "QA FluxoCurto" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guard-enterprise", () => ({
  requireEnterpriseWith: vi.fn(async () => ({ ok: true })),
}));

import { PrismaClient, Prisma } from "@/generated/prisma";
import { lerProvaEntradaV3 } from "@/lib/operacoes-v3/prova-entrada-model";
import { salvarIdentificacaoV3 } from "@/lib/operacoes-v3/prova-entrada-actions";
import { ehConflitoConcorrenciaV3 } from "@/lib/operacoes-v4/entrada-form";
import { salvarDadosBasicosOSV3 } from "@/lib/operacoes-v3/dados-basicos-actions";
import type { OrdemServico } from "@/types/os";
import type { SalvarDadosBasicosInputV3 } from "@/lib/operacoes-v3/dados-basicos-model";

function exigirBancoLocal(): string {
  const raw = (process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL ?? "").trim();
  const app = (process.env.DATABASE_URL ?? "").trim();
  const direct = (process.env.DIRECT_URL ?? "").trim();
  if (!raw || !app || !direct) {
    throw new Error(
      "BLOQUEIO_EXPLICITO_PG: integração exige banco descartável local " +
        "(OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL apontando ao mesmo alvo). " +
        "Ausência de ambiente é impedimento, não aprovação.",
    );
  }
  const alvos = [raw, app, direct].map((s) => new URL(s));
  for (const u of alvos) {
    if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname.toLowerCase())) {
      throw new Error(`BLOQUEIO_EXPLICITO_PG: URL deve ser local (recebido: ${u.hostname}).`);
    }
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (chave(alvos[0]!) !== chave(alvos[1]!) || chave(alvos[0]!) !== chave(alvos[2]!)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao mesmo banco descartável.");
  }
  return raw;
}

const TEST_URL = exigirBancoLocal();

const prisma = new PrismaClient({ datasourceUrl: TEST_URL });
const prismaB = new PrismaClient({ datasourceUrl: TEST_URL });

const RUN = `fc001-${Date.now().toString(36)}`;
let seq = 0;
const uid = (p: string) => `${p}-${RUN}-${(seq += 1)}`;

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  await prismaB.$disconnect().catch(() => {});
});

async function criarLojaQA(): Promise<string> {
  const id = uid("loja-qa");
  await prisma.store.create({ data: { id, name: "QA FluxoCurto" } });
  return id;
}

async function criarOS(sid: string, modelo: string) {
  return prisma.ordemServico.create({
    data: {
      storeId: sid,
      equipamento: "",
      defeito: "",
      payload: {
        equipamento: { modelo },
        timeline: [],
        atualizadoEm: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

async function lerPayload(id: string) {
  const row = await prisma.ordemServico.findFirst({ where: { id }, select: { payload: true } });
  if (!row) throw new Error("OS de teste sumiu.");
  return row.payload as unknown as Record<string, unknown>;
}

describe("R01 — criar Violeta, editar Preto, persistir e reler", () => {
  it("uma escrita/leitura coerente preservando condição e campos alheios", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "E2E-Modelo R01");
    await salvarIdentificacaoV3(sid, id, { cor: "Violeta", modelo: "E2E-Modelo R01", imei: "111222333444555" });
    const v1 = lerProvaEntradaV3((await lerPayload(id)) as unknown as OrdemServico);
    expect(v1.identificacao.cor).toBe("Violeta");
    expect(v1.identificacao.modelo).toBe("E2E-Modelo R01");
    // Condição física e demais fatias intactas após a escrita.
    expect(v1.estadoFisico.length).toBeGreaterThan(0);
    expect(v1.estadoFisico.every((e) => e.status === "ok")).toBe(true);

    await salvarIdentificacaoV3(sid, id, { cor: "Preto" });
    const v2 = lerProvaEntradaV3((await lerPayload(id)) as unknown as OrdemServico);
    expect(v2.identificacao.cor).toBe("Preto");
    expect(v2.identificacao.imei).toBe("111222333444555");
    expect(v2.identificacao.modelo).toBe("E2E-Modelo R01");
    expect(v2.estadoFisico.every((e) => e.status === "ok")).toBe(true);
    // Espelho legado sincronizado sem apagar chaves alheias (R01: a leitura
    // efetiva prioriza equipamento.* — o espelho leva a cor editada).
    const payload = await lerPayload(id);
    expect((payload.equipamento as Record<string, unknown>).modelo).toBe("E2E-Modelo R01");
    expect((payload.equipamento as Record<string, unknown>).cor).toBe("Preto");
  });

  it("timeline e campos desconhecidos sobrevivem à edição", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo R01b");
    await prisma.ordemServico.update({
      where: { id },
      data: {
        payload: {
          equipamento: { modelo: "Modelo R01b" },
          timeline: [{ id: "ev-legado", tipo: "observacao", autor: "outra-sessao", conteudo: "legado" }],
          campoFuturo: { x: 1 },
          atualizadoEm: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await salvarIdentificacaoV3(sid, id, { cor: "Azul" });
    const payload = await lerPayload(id);
    expect(payload["campoFuturo"]).toEqual({ x: 1 });
    const timeline = payload["timeline"] as unknown[];
    expect(timeline.length).toBe(2);
    expect(timeline[0]).toMatchObject({ id: "ev-legado" });
    const v = lerProvaEntradaV3(payload as unknown as OrdemServico);
    expect(v.identificacao.cor).toBe("Azul");
  });
});

describe("R02 — edições independentes preservadas; mesmo campo conflita explícito", () => {
  it("cor e defeito de sessões distintas coexistem com eventos de ambas", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo R02");
    await salvarIdentificacaoV3(sid, id, { cor: "Verde" }, undefined, { cor: "" });
    await salvarDadosBasicosOSV3(
      sid,
      id,
      {
        defeitoRelatado: "Tela trincada",
        prioridade: "media",
        recebidoPor: "QA",
        localFisico: "balcao",
        previsaoEntrega: "",
        origem: "balcao",
        observacoes: "",
      },
      {
        defeitoRelatado: "",
        prioridade: "",
        origem: "",
        recebidoPor: "",
        localFisico: "",
        observacoes: "",
      },
    );
    const payload = await lerPayload(id);
    const v = lerProvaEntradaV3(payload as unknown as OrdemServico);
    expect(v.identificacao.cor).toBe("Verde");
    const timeline = payload["timeline"] as { metadata?: { evento?: string } }[];
    const eventos = timeline.map((e) => e.metadata?.evento);
    expect(eventos).toContain("identificacao_atualizada");
    expect(eventos).toContain("dados_basicos_atualizados");
  });

  it("duas conexões: escrita sobreposta vira conflito, sem clobber", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo R02c");
    await salvarIdentificacaoV3(sid, id, { cor: "Violeta" });

    // Sessão B segura o lock da linha e commita depois (bump de updatedAt).
    const seguraLock = prismaB.$transaction(async (tx) => {
      const atual = await tx.ordemServico.findFirst({ where: { id } });
      await tx.ordemServico.update({
        where: { id },
        data: { payload: { ...(atual!.payload as object), marcadoConcorrente: true } as unknown as Prisma.InputJsonValue },
      });
      await new Promise((r) => setTimeout(r, 2500));
    });
    // Dá tempo do lock ser adquirido; a action lê o pré-commit e bloqueia nele.
    await new Promise((r) => setTimeout(r, 400));
    const escrita = salvarIdentificacaoV3(sid, id, { cor: "Preto" });
    await expect(escrita).rejects.toSatisfy(ehConflitoConcorrenciaV3);
    await seguraLock;

    const payload = await lerPayload(id);
    expect(payload["marcadoConcorrente"]).toBe(true);
    const v = lerProvaEntradaV3(payload as unknown as OrdemServico);
    expect(v.identificacao.cor).toBe("Violeta");
  }, 30000);

  it("stale sequencial: B salva modelo=M2; A com baseline M1 salva só cor → M2 + Preto", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "M1");
    // Baseline M1/Violeta (primeira escrita como a UI: modelo M1 já visível via
    // equipamento.semente, cor vazia; só cor é preenchida de fato).
    await salvarIdentificacaoV3(
      sid,
      id,
      { modelo: "M1", cor: "Violeta" },
      undefined,
      { modelo: "M1", cor: "" },
    );
    // Sessão B (atualizada): muda só o modelo.
    await salvarIdentificacaoV3(sid, id, { modelo: "M2" }, undefined, { modelo: "M1" });
    // Sessão A (stale em M1/Violeta): muda só a cor — modelo intocado nunca viaja.
    await salvarIdentificacaoV3(sid, id, { cor: "Preto" }, undefined, { cor: "Violeta" });
    const v = lerProvaEntradaV3((await lerPayload(id)) as unknown as OrdemServico);
    expect(v.identificacao.modelo).toBe("M2");
    expect(v.identificacao.cor).toBe("Preto");
  });

  it("mesmo campo: B salva cor=Verde; A com baseline Violeta tenta Preto → conflito, Verde fica", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "M1");
    await salvarIdentificacaoV3(sid, id, { cor: "Violeta" }, undefined, { cor: "" });
    await salvarIdentificacaoV3(sid, id, { cor: "Verde" }, undefined, { cor: "Violeta" });
    await expect(salvarIdentificacaoV3(sid, id, { cor: "Preto" }, undefined, { cor: "Violeta" })).rejects.toSatisfy(
      ehConflitoConcorrenciaV3,
    );
    const v = lerProvaEntradaV3((await lerPayload(id)) as unknown as OrdemServico);
    expect(v.identificacao.cor).toBe("Verde");
  });

  it("limpeza explícita via opts remove só o campo com baseline", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "M1");
    await salvarIdentificacaoV3(sid, id, { serial: "S1", cor: "Violeta" }, undefined, { serial: "", cor: "" });
    await salvarIdentificacaoV3(sid, id, {}, ["serial"], { serial: "S1" });
    const v = lerProvaEntradaV3((await lerPayload(id)) as unknown as OrdemServico);
    expect(v.identificacao.serial).toBeUndefined();
    expect(v.identificacao.cor).toBe("Violeta");
  });

  it("dados básicos stale: B salva prioridade=alta; A com baseline D1 salva defeito=D2", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo DB");
    const base: SalvarDadosBasicosInputV3 = {
      defeitoRelatado: "D1",
      prioridade: "media",
      recebidoPor: "QA",
      localFisico: "balcao",
      previsaoEntrega: "",
      origem: "balcao",
      observacoes: "",
    };
    await salvarDadosBasicosOSV3(sid, id, base, {
      defeitoRelatado: "",
      prioridade: "",
      origem: "",
      recebidoPor: "",
      localFisico: "",
      observacoes: "",
    });
    // Sessão B (atualizada): muda só a prioridade.
    await salvarDadosBasicosOSV3(sid, id, { ...base, prioridade: "alta" }, { prioridade: "media" });
    // Sessão A (stale): muda só o defeito, com baseline D1.
    await salvarDadosBasicosOSV3(sid, id, { ...base, defeitoRelatado: "D2" }, { defeitoRelatado: "D1" });
    const payload = await lerPayload(id);
    const recepcao = (payload.aberturaV3 as Record<string, Record<string, unknown>>).recepcao;
    expect(recepcao.prioridade).toBe("alta");
    expect((payload.equipamento as Record<string, unknown>).defeitoRelatado).toBe("D2");
  });

  it("dados básicos mesmo campo: B salva D9; A com baseline D1 tenta D2 → conflito", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo DB2");
    const base: SalvarDadosBasicosInputV3 = {
      defeitoRelatado: "D1",
      prioridade: "media",
      recebidoPor: "QA",
      localFisico: "balcao",
      previsaoEntrega: "",
      origem: "balcao",
      observacoes: "",
    };
    await salvarDadosBasicosOSV3(sid, id, base, {
      defeitoRelatado: "",
      prioridade: "",
      origem: "",
      recebidoPor: "",
      localFisico: "",
      observacoes: "",
    });
    await salvarDadosBasicosOSV3(sid, id, { ...base, defeitoRelatado: "D9" }, { defeitoRelatado: "D1" });
    await expect(
      salvarDadosBasicosOSV3(sid, id, { ...base, defeitoRelatado: "D2" }, { defeitoRelatado: "D1" }),
    ).rejects.toSatisfy(ehConflitoConcorrenciaV3);
    const payload = await lerPayload(id);
    expect((payload.equipamento as Record<string, unknown>).defeitoRelatado).toBe("D9");
  });

  it("duas conexões: dados básicos sobrepostos também conflitam", async () => {
    const sid = await criarLojaQA();
    const { id } = await criarOS(sid, "Modelo R02d");
    const seguraLock = prismaB.$transaction(async (tx) => {
      const atual = await tx.ordemServico.findFirst({ where: { id } });
      await tx.ordemServico.update({
        where: { id },
        data: { payload: { ...(atual!.payload as object), marcadoConcorrente: true } as unknown as Prisma.InputJsonValue },
      });
      await new Promise((r) => setTimeout(r, 2500));
    });
    await new Promise((r) => setTimeout(r, 400));
    const escrita = salvarDadosBasicosOSV3(sid, id, {
      defeitoRelatado: "Conflito",
      prioridade: "media",
      recebidoPor: "QA",
      localFisico: "balcao",
      previsaoEntrega: "",
      origem: "balcao",
      observacoes: "",
    });
    await expect(escrita).rejects.toSatisfy(ehConflitoConcorrenciaV3);
    await seguraLock;
  }, 30000);
});
