import { beforeEach, describe, expect, it, vi } from "vitest";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";

const mocks = vi.hoisted(() => ({
  osFindMany: vi.fn(),
  titleFindMany: vi.fn(),
  auth: vi.fn(),
  requireEnterpriseWith: vi.fn(),
  assertActiveStoreId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ordemServico: { findMany: mocks.osFindMany },
    contaReceberTitulo: { findMany: mocks.titleFindMany },
  },
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: mocks.requireEnterpriseWith }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: mocks.assertActiveStoreId }));

import { lerProjecaoFinanceiraOSV4, lerProjecoesFinanceirasOSV4 } from "./financial-projection-actions";

const storeId = "store-a";
const osId = "os-1";

function osRow(id = osId, total = 300) {
  return {
    id,
    numero: "OS-TESTE",
    status: "Pronta",
    valorTotal: total,
    payload: {
      id,
      codigo: "OS-TESTE",
      status: "pronta",
      operacaoStatusV3: "pronta",
      timeline: [],
      orcamento: {
        id: "orc-1", status: "aprovado", sintetizado: false, total, desconto: 0,
        servicos: total > 0 ? [{ id: "s1", descricao: "Serviço", valor: total }] : [], pecas: [], criadoEm: "2026-07-01T10:00:00.000Z",
      },
    },
  };
}

function titleRow(id = osId, total = 300) {
  return {
    id: `cr-${id}`,
    storeId,
    localKey: localKeyContaReceberOSV3(storeId, id),
    valor: total,
    status: "pago",
    payload: { ordemServicoId: id, historico: [{ tipo: "liquidacao", valor: total, formaPagamento: "pix" }] },
  };
}

beforeEach(() => {
  mocks.osFindMany.mockReset().mockResolvedValue([osRow()]);
  mocks.titleFindMany.mockReset().mockResolvedValue([titleRow()]);
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  mocks.requireEnterpriseWith.mockReset().mockResolvedValue({ ok: true });
  mocks.assertActiveStoreId.mockReset();
});

describe("financial-projection-actions — reader autenticado e scoped", () => {
  it("consulta OS e CR sempre pela loja autorizada e devolve DTO sem payload bruto", async () => {
    const result = await lerProjecaoFinanceiraOSV4(storeId, osId);
    expect(mocks.assertActiveStoreId).toHaveBeenCalledWith(storeId, "Operações V4");
    expect(mocks.osFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId, id: { in: [osId] } } }));
    expect(mocks.titleFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId, localKey: { in: [localKeyContaReceberOSV3(storeId, osId)] } },
    }));
    expect(result).toMatchObject({ storeId, osId, financialStatus: "PAID", receivedTotal: 300, balance: 0 });
    expect(result).not.toHaveProperty("payload");
  });

  it("exige sessão válida antes de ler banco", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(lerProjecaoFinanceiraOSV4(storeId, osId)).rejects.toThrow(/login/i);
    expect(mocks.osFindMany).not.toHaveBeenCalled();
  });

  it("exige permissão de Operações da unidade", async () => {
    mocks.requireEnterpriseWith.mockResolvedValue({ ok: false, error: "negado" });
    await expect(lerProjecaoFinanceiraOSV4(storeId, osId)).rejects.toThrow("negado");
    expect(mocks.osFindMany).not.toHaveBeenCalled();
  });

  it("cross-store não encontra a OS e nunca consulta título de outra unidade", async () => {
    mocks.osFindMany.mockResolvedValue([]);
    await expect(lerProjecaoFinanceiraOSV4("store-b", osId)).rejects.toThrow("OS não encontrada.");
    expect(mocks.osFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-b", id: { in: [osId] } } }));
    expect(mocks.titleFindMany).not.toHaveBeenCalled();
  });

  it("falha da CR vira UNKNOWN explícito, nunca projeção zerada", async () => {
    mocks.titleFindMany.mockRejectedValue(new Error("database unavailable"));
    const result = await lerProjecaoFinanceiraOSV4(storeId, osId);
    expect(result).toMatchObject({
      financialStatus: "UNKNOWN", consistencyStatus: "UNKNOWN", expectedTotal: null,
      receivedTotal: null, balance: null, canReceive: false, canDeliver: false, errorCode: "RECEIVABLE_READ_FAILED",
    });
  });

  it("reader em lote faz uma consulta e mantém identidade por OS", async () => {
    mocks.osFindMany.mockResolvedValue([osRow("os-1", 300), osRow("os-2", 200)]);
    mocks.titleFindMany.mockResolvedValue([titleRow("os-1", 300), titleRow("os-2", 200)]);
    const result = await lerProjecoesFinanceirasOSV4(storeId, ["os-2", "os-1", "os-2"]);
    expect(mocks.osFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.titleFindMany).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.osId)).toEqual(["os-2", "os-1"]);
    expect(result.every((item) => item.financialStatus === "PAID")).toBe(true);
  });
});
