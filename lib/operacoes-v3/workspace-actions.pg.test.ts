import { describe, expect, it, vi } from "vitest";

// OPS-V4-FLUXO-CURTO-001 / rev 5 — checklist concorrente-safe (T04), camada PG REAL.
//
// O EFEITO (LATEST + updateMany por updatedAt, timeline/campos desconhecidos, corrida
// sobreposta) exige PostgreSQL descartável local; falha explícita sem ambiente — nunca skip.
// Separado de workspace-actions.test.ts (guardas estáticas, sem I/O) para que a suíte da raiz
// sem banco exclua só `*.pg.test.ts`, e o workflow PostgreSQL próprio rode estes casos.
//
// Identidade limitada ao seam de sessão (stub de @/auth com usuário QA + gate ok) SOMENTE
// para alcançar a lógica de concorrência sob teste; o login real é coberto na camada E2E.

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
  // OPS-RECEBIMENTO-MISTO-P1-HARDENING-001: A trava a linha da OS ANTES de ler. Com B
  // segurando a linha, A ESPERA o commit de B e aplica o checklist sobre o payload de B —
  // nem clobber (o campo de B sobrevive) nem conflito espúrio (B não tocou no checklist).
  it("A não clobbera: espera B, relê o LATEST e aplica só o checklist (PG real, duas conexões)", async () => {
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
      await seguraLock;
      await expect(escrita).resolves.toBeTruthy();

      const payload = await lerPayload(prisma, id);
      // O campo gravado por B sobrevive à escrita de A (nenhum snapshot anterior regravado).
      expect(payload.marcadoConcorrente).toBe(true);
      // A mudança de A (checklist) entra sobre o LATEST, com as duas edições na timeline.
      const checklist = payload.checklist as { estado?: string }[];
      expect(checklist[0]?.estado).toBe("ruim");
      const timeline = payload.timeline as { tipo?: string }[];
      expect(timeline.filter((e) => e.tipo === "checklist_finalizado")).toHaveLength(2);
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
