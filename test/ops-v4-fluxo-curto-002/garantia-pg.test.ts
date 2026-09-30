import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-002", name: "Operador QA" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/operacoes-v3/event-publisher", () => ({ emitirEventoOperacaoV3: vi.fn() }));

import { Prisma, PrismaClient } from "@/generated/prisma";
import { buildNovaOSDraftFromFormV4 } from "@/lib/operacoes-v4/nova-os-draft-from-form";
import { salvarGarantiaOSV3 } from "@/lib/operacoes-v3/garantia-actions";

function exigirBancoDescartavel(): string {
  const urls = [
    process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
  ].map((value) => value?.trim() || "");
  if (urls.some((value) => !value)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: configure as três URLs para o PostgreSQL local descartável.");
  }
  const parsed = urls.map((value) => new URL(value));
  if (parsed.some((url) => !["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const target = (url: URL) => `${url.hostname}:${url.port}${url.pathname}${url.search}`;
  if (parsed.some((url) => target(url) !== target(parsed[0]!))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao mesmo banco descartável.");
  }
  return urls[0]!;
}

describe("OPS-V4-FLUXO-CURTO-002 — PostgreSQL real", () => {
  it("persiste a abertura 90 dias e substitui apenas a garantia atual por sem cobertura", async () => {
    const prisma = new PrismaClient({ datasourceUrl: exigirBancoDescartavel() });
    const storeId = `loja-002-${Date.now().toString(36)}`;
    let osId: string | null = null;
    try {
      await prisma.store.create({ data: { id: storeId, name: "Loja sintética 002" } });
      const draft = buildNovaOSDraftFromFormV4({
        clienteExistente: null,
        clienteNovo: { nome: "E2E Garantia 002" },
        equipamentoTipo: "celular",
        marca: "Samsung",
        modelo: "S22",
        defeitoRelatado: "Tela trincada",
        origem: "balcao",
        tipoEntrada: "servico_autorizado",
        servicoAutorizado: { descricao: "Troca de tela", valor: 300, custo: 92, garantiaDias: 90 },
      }, new Date("2026-09-28T12:00:00.000Z"));
      expect(draft.garantia.modelo).toBe("tela");
      expect(draft.garantia.prazoDias).toBe(90);
      expect(draft.itens[0]).toMatchObject({ descricao: "Troca de tela", valorUnitario: 300, custoUnitario: 92, garantiaDias: 90 });

      const aberturaV3 = {
        garantiaPrevista: { modelo: draft.garantia.modelo, prazoDias: draft.garantia.prazoDias },
        itensV3: draft.itens,
      };
      const row = await prisma.ordemServico.create({
        data: {
          storeId,
          numero: `OS-002-${Date.now()}`,
          equipamento: "Samsung S22",
          defeito: "Tela trincada",
          payload: {
            storeId,
            cliente: { nome: "E2E Garantia 002" },
            equipamento: { marca: "Samsung", modelo: "S22" },
            aberturaV3,
            timeline: [],
          } as unknown as Prisma.InputJsonValue,
        },
      });
      osId = row.id;

      const criada = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true } });
      const payloadInicial = criada.payload as unknown as { aberturaV3: typeof aberturaV3 };
      expect(payloadInicial.aberturaV3.garantiaPrevista).toMatchObject({ modelo: "tela", prazoDias: 90 });
      expect(payloadInicial.aberturaV3.itensV3[0]).toMatchObject({ garantiaDias: 90 });

      await salvarGarantiaOSV3(storeId, osId, { modeloId: "sem_garantia", prazoDias: 90 });
      const salva = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true } });
      const payloadFinal = salva.payload as unknown as { aberturaV3: typeof aberturaV3; timeline: Array<{ tipo: string }> };
      expect(payloadFinal.aberturaV3.garantiaPrevista).toMatchObject({ modelo: "sem_garantia", prazoDias: 0 });
      expect(payloadFinal.aberturaV3.itensV3[0]).toMatchObject({ garantiaDias: 90 });
      expect(payloadFinal.timeline.at(-1)?.tipo).toBe("garantia_gerada");
    } finally {
      if (osId) await prisma.ordemServico.delete({ where: { id: osId } });
      await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
