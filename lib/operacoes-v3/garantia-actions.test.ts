import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const prismaTx: Record<string, unknown> = { ordemServico: db };
  prismaTx.$transaction = async (fn: (tx: unknown) => unknown) => fn(prismaTx);
  prismaTx.$queryRaw = async () => [{ id: "os-travada" }];
  return { prisma: prismaTx };
});
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-002", name: "Operador QA" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./event-publisher", () => ({ emitirEventoOperacaoV3: vi.fn() }));

import { salvarGarantiaOSV3 } from "./garantia-actions";

beforeEach(() => {
  db.findFirst.mockReset();
  db.update.mockReset();
  db.findFirst.mockResolvedValue({
    id: "os-002",
    payload: { id: "os-002", codigo: "OS-002", aberturaV3: { origem: "balcao" }, timeline: [] },
  });
  db.update.mockResolvedValue({});
});

describe("salvarGarantiaOSV3 — persistência normalizada no servidor", () => {
  it.each([
    ["sem_garantia", 90, 0],
    ["oxidacao", 90, 0],
    ["tela", 0, 90],
    ["tela", 45, 45],
  ])("%s + %i persiste prazo %i na OS da loja selecionada", async (modeloId, entrada, esperado) => {
    const salvo = await salvarGarantiaOSV3("loja-qa", "os-002", { modeloId, prazoDias: entrada });
    // Releitura do payload MAIS RECENTE sob a trava, sempre escopada pela loja.
    expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "os-002", storeId: "loja-qa" } }));
    const update = db.update.mock.calls[0]?.[0];
    expect(update?.where).toEqual({ id: "os-002" });
    expect(update?.data.payload.aberturaV3.garantiaPrevista).toMatchObject({ modelo: modeloId, prazoDias: esperado });
    expect(update?.data.payload.aberturaV3.origem).toBe("balcao");
    expect(update?.data.payload.timeline).toHaveLength(1);
    expect((salvo as unknown as { aberturaV3: { garantiaPrevista: { prazoDias: number } } }).aberturaV3.garantiaPrevista.prazoDias).toBe(esperado);
  });

  it("não grava quando a OS não pertence à loja ativa", async () => {
    db.findFirst.mockResolvedValue(null);
    await expect(salvarGarantiaOSV3("outra-loja", "os-002", { modeloId: "tela", prazoDias: 90 })).rejects.toThrow("OS não encontrada");
    expect(db.update).not.toHaveBeenCalled();
  });
});
