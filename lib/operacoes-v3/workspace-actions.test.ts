import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// OPS-V4-FLUXO-CURTO-001 / rev 5 — checklist concorrente-safe (T04).
//
// CAMADA unidade (sem I/O, sem banco): guarda estática da disciplina +
// erro explícito + outros handlers inalterados. O EFEITO (LATEST + updateMany
// por updatedAt, timeline/campos desconhecidos, corrida sobreposta) é provado
// na seção PG real deste mesmo arquivo (banco descartável local, falha
// explícita sem ambiente — nunca skip).
//
// Identidade limitada ao seam de sessão (stub de @/auth com usuário QA + gate
// ok) SOMENTE para alcançar a lógica de concorrência sob teste; o login real
// é coberto na camada E2E. O caminho condicional, a mesclagem sobre o LATEST
// e o erro de conflito são o código real de produção, sem bypass.

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "qa-fluxo-curto", name: "QA FluxoCurto" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guard-enterprise", () => ({
  requireEnterpriseWith: vi.fn(async () => ({ ok: true })),
}));

import { PrismaClient, Prisma } from "@/generated/prisma";
import { salvarChecklistEntradaV3 } from "./workspace-actions";
import { salvarIdentificacaoV3 } from "./prova-entrada-actions";
import {
  CONFLITO_CONCORRENCIA_V3,
  ehConflitoConcorrenciaV3,
  erroConflitoConcorrenciaV3,
} from "@/lib/operacoes-v4/entrada-form";

function srcWorkspace(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "workspace-actions.ts"), "utf8");
}

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

const RUN = `ws001-${Date.now().toString(36)}`;
let seq = 0;
const uid = (p: string) => `${p}-${RUN}-${(seq += 1)}`;

async function criarLojaQA(prisma: PrismaClient): Promise<string> {
  const id = uid("loja-qa");
  await prisma.store.create({ data: { id, name: "QA Checklist" } });
  return id;
}

async function criarOS(prisma: PrismaClient, sid: string, extraPayload: Record<string, unknown> = {}) {
  return prisma.ordemServico.create({
    data: {
      storeId: sid,
      equipamento: "",
      defeito: "",
      payload: {
        equipamento: { modelo: "Modelo-Checklist" },
        timeline: [],
        atualizadoEm: new Date().toISOString(),
        ...extraPayload,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

async function lerPayload(prisma: PrismaClient, id: string) {
  const row = await prisma.ordemServico.findFirst({ where: { id }, select: { payload: true } });
  if (!row) throw new Error("OS de teste sumiu.");
  return row.payload as unknown as Record<string, unknown>;
}

describe("T04 — checklist concorrente-safe: guarda estática da disciplina", () => {
  it("salvarChecklistEntradaV3 relê LATEST e condiciona por updatedAt com conflito explícito", () => {
    const src = srcWorkspace();
    // Recorte exclusivo do write de checklist: do export até o próximo export.
    const ini = src.indexOf("export async function salvarChecklistEntradaV3");
    const fim = src.indexOf("export async function salvarSenhaAcessoriosV3");
    expect(ini).toBeGreaterThanOrEqual(0);
    expect(fim).toBeGreaterThan(ini);
    const bloco = src.slice(ini, fim);
    expect(bloco, "transação").toContain("prisma.$transaction");
    expect(bloco, "releitura LATEST").toContain("findFirst");
    expect(bloco, "storeId correto").toContain("latest.storeId !== sid");
    expect(bloco, "captura updatedAt").toContain("updatedAt: true");
    expect(bloco, "preserva desconhecidos (spread LATEST)").toContain("...payload");
    expect(bloco, "preserva timeline LATEST").toContain("appendTimeline(payload, evento)");
    expect(bloco, "aplica somente checklist").toContain("checklist,");
    expect(bloco, "evento correspondente").toContain("checklist_finalizado");
    expect(bloco, "condicional").toContain("ordemServico.updateMany");
    expect(bloco, "precondição").toContain("updatedAt: latest.updatedAt");
    expect(bloco, "conflito explícito").toContain("erroConflitoConcorrenciaV3");
    // Sem update cego no write de checklist (o helper `gravar` com update()
    // permanece apenas para os demais write-paths, fora deste bloco).
    expect(bloco, "sem update cego no checklist").not.toContain("ordemServico.update({");
    expect(bloco, "sem gravar cego no checklist").not.toContain("return gravar(");
  });

  it("erro de conflito carrega CONFLITO_CONCORRENCIA e orienta recarregar", () => {
    const e = erroConflitoConcorrenciaV3("o checklist de entrada");
    expect(ehConflitoConcorrenciaV3(e)).toBe(true);
    expect((e as Error & { code?: string }).code).toBe(CONFLITO_CONCORRENCIA_V3);
    expect(e.message).toMatch(/outra sessão/);
    expect(e.message).toMatch(/Recarregue/);
  });
});

describe("D — nenhum outro handler de workspace-actions é semanticamente alterado", () => {
  it("salvarSenhaAcessoriosV3 e salvarDiagnosticoV3 preservam shape e via gravar", () => {
    const src = srcWorkspace();
    for (const nome of ["salvarSenhaAcessoriosV3", "salvarDiagnosticoV3"] as const) {
      expect(src, `${nome} existe`).toContain(`export async function ${nome}`);
    }
    // Ambos seguem pela via legada `gravar(id, next)` (update direto do payload
    // + revalidate), sem transação condicionada — escopo exclusivo do checklist
    // neste GOAL. Contar ocorrências: 2 (senha + diagnóstico), nenhuma no checklist.
    const ocorrencias = src.split("return gravar(id, next)").length - 1;
    expect(ocorrencias).toBe(2);
    expect(src, "senha preserva chaves").toContain("senhaEquipamento");
    expect(src, "senha preserva acessórios").toContain("equipamento.acessorios");
    expect(src, "diagnóstico preserva campo").toContain("diagnosticoV3");
    expect(src, "diagnóstico preserva evento").toContain("diagnostico_registrado");
  });
});

describe("A — B altera identificação/prova para Y; A salva checklist com estado anterior", () => {
  it("Y preservada + checklist A persistido + timeline correta + desconhecidos preservados (PG real)", async () => {
    const url = exigirBancoLocal();
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
      const sid = await criarLojaQA(prisma);
      const { id } = await criarOS(prisma, sid, {
        provaEntradaV3: {
          versao: 1,
          identificacao: { modelo: "M-X", cor: "Violeta", imei: "111" },
        },
        timeline: [{ id: "ev-legado", tipo: "observacao", autor: "outra-sessao", conteudo: "legado" }],
        campoFuturo: { x: 1 },
      });
      // Sessão B altera identificação/prova para Y (write-path real de produção).
      await salvarIdentificacaoV3(sid, id, { modelo: "M-Y", cor: "Preto", imei: "222" });
      // Sessão A salva checklist "usando estado anterior" (sem baseline: a ação
      // deve mesclar sobre o LATEST, nunca clobberar Y com snapshot amplo).
      const checklistA = [
        { id: "wifi", label: "Wi-Fi", estado: "ok" as const },
        { id: "tela", label: "Tela", estado: "ruim" as const },
      ];
      await salvarChecklistEntradaV3(sid, id, checklistA);
      const payload = await lerPayload(prisma, id);
      // Identificação/prova Y preservada.
      const prova = (payload.provaEntradaV3 as Record<string, Record<string, unknown>>).identificacao as Record<
        string,
        unknown
      >;
      // Leitura pode estar na prova ou no espelho legado; ao menos um deles tem Y.
      const equipamento = payload.equipamento as Record<string, unknown>;
      const modeloY = prova?.modelo === "M-Y" || equipamento?.modelo === "M-Y";
      expect(modeloY).toBe(true);
      // Checklist A persistido.
      expect(payload.checklist).toEqual(checklistA);
      // Timeline contém os eventos corretos (legado + identificação + checklist).
      const timeline = payload.timeline as { id?: string; tipo?: string; metadata?: { evento?: string } }[];
      expect(timeline.length).toBeGreaterThanOrEqual(3);
      expect(timeline[0]).toMatchObject({ id: "ev-legado" });
      const tipos = timeline.map((e) => e.tipo);
      expect(tipos).toContain("checklist_finalizado");
      // Campos desconhecidos preservados.
      expect(payload.campoFuturo).toEqual({ x: 1 });
      // Sem tocar status/valor/financeiro: colunas Prisma intactas.
      const linha = await prisma.ordemServico.findFirst({
        where: { id },
        select: { status: true, valorTotal: true, valorBase: true },
      });
      expect(linha?.valorTotal).toBe(0);
      expect(linha?.valorBase).toBe(0);
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });
});

describe("B — corrida sobreposta: B grava entre SELECT e UPDATE de A", () => {
  it("A não clobbera; recebe CONFLITO_CONCORRENCIA (PG real, duas conexões)", async () => {
    const url = exigirBancoLocal();
    const prisma = new PrismaClient({ datasourceUrl: url });
    const prismaB = new PrismaClient({ datasourceUrl: url });
    try {
      const sid = await criarLojaQA(prisma);
      const { id } = await criarOS(prisma, sid);
      await salvarChecklistEntradaV3(sid, id, [{ id: "wifi", label: "Wi-Fi", estado: "ok" }]);

      const seguraLock = prismaB.$transaction(async (tx) => {
        const atual = await tx.ordemServico.findFirst({ where: { id } });
        await tx.ordemServico.update({
          where: { id },
          data: { payload: { ...(atual!.payload as object), marcadoConcorrente: true } as unknown as Prisma.InputJsonValue },
        });
        await new Promise((r) => setTimeout(r, 2500));
      });
      await new Promise((r) => setTimeout(r, 400));
      const escrita = salvarChecklistEntradaV3(sid, id, [{ id: "wifi", label: "Wi-Fi", estado: "ruim" }]);
      await expect(escrita).rejects.toSatisfy(ehConflitoConcorrenciaV3);
      await seguraLock;

      const payload = await lerPayload(prisma, id);
      expect(payload.marcadoConcorrente).toBe(true);
      // Checklist da tentativa perdedora não clobberou o LATEST.
      const checklist = payload.checklist as { estado?: string }[];
      expect(checklist[0]?.estado).toBe("ok");
    } finally {
      await prisma.$disconnect().catch(() => {});
      await prismaB.$disconnect().catch(() => {});
    }
  }, 30000);
});

describe("C — checklist normal sem concorrência continua funcionando igual", () => {
  it("persiste checklist + evento + atualizadoEm preservando o resto (PG real)", async () => {
    const url = exigirBancoLocal();
    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
      const sid = await criarLojaQA(prisma);
      const { id } = await criarOS(prisma, sid, { campoFuturo: { y: 2 } });
      const itens = [
        { id: "a", label: "A", estado: "ok" as const },
        { id: "b", label: "B", estado: "nao_testado" as const },
      ];
      await salvarChecklistEntradaV3(sid, id, itens);
      const payload = await lerPayload(prisma, id);
      expect(payload.checklist).toEqual(itens);
      const timeline = payload.timeline as { tipo?: string; conteudo?: string }[];
      expect(timeline.length).toBe(1);
      expect(timeline[0]?.tipo).toBe("checklist_finalizado");
      expect(timeline[0]?.conteudo).toMatch(/1 OK/);
      expect(typeof payload.atualizadoEm).toBe("string");
      expect(payload.campoFuturo).toEqual({ y: 2 });
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });
});
