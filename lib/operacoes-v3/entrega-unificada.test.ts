import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// SPRINT_3D.2 — ENTREGA UNIFICADA (bug B1)
// ----------------------------------------------------------------------------
// Invariante: TODA transição para "entregue" é roteada para o fluxo canônico
// `registrarEntregaV3` (entrega formal + garantia + estoque + evento), e NENHUMA
// transição "status-only" finaliza a entrega. Transições não-entrega seguem o
// caminho normal da máquina única e NÃO chamam o fluxo de entrega.
// ============================================================================

const entrega = vi.hoisted(() => ({ registrarEntregaV3: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const estoque = vi.hoisted(() => ({ restaurarEstoqueOSV3: vi.fn(async () => ({ status: "restored" })) }));
const fin = vi.hoisted(() => ({ cancelContaReceber: vi.fn(async () => undefined) }));

vi.mock("./entrega-actions", () => ({ registrarEntregaV3: entrega.registrarEntregaV3 }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { ordemServico: { findFirst: prismaMock.findFirst, update: prismaMock.update } } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Ana" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/financeiro/services/contas-receber-service", () => ({ cancelContaReceber: fin.cancelContaReceber }));
vi.mock("./estoque-sync", () => ({ restaurarEstoqueOSV3: estoque.restaurarEstoqueOSV3 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { aplicarTransicaoStatusV3 } from "./status-actions";

beforeEach(() => {
  entrega.registrarEntregaV3.mockReset();
  prismaMock.findFirst.mockReset();
  prismaMock.update.mockReset();
  estoque.restaurarEstoqueOSV3.mockClear();
  fin.cancelContaReceber.mockClear();
});

describe("ENTREGA UNIFICADA (3D.2)", () => {
  it("transição para 'entregue' delega ao fluxo canônico (sem write status-only)", async () => {
    const osEntregue = { id: "os1", codigo: "OS-1", operacaoStatusV3: "entregue" };
    entrega.registrarEntregaV3.mockResolvedValue(osEntregue);

    const out = await aplicarTransicaoStatusV3("loja-1", "os1", "entregue");

    expect(entrega.registrarEntregaV3).toHaveBeenCalledTimes(1);
    expect(entrega.registrarEntregaV3).toHaveBeenCalledWith("loja-1", "os1");
    expect(out).toBe(osEntregue);
    // A delegação acontece ANTES de qualquer write status-only.
    expect(prismaMock.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("transição não-entrega (pronta) NÃO chama o fluxo de entrega e segue a máquina", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "em_execucao", timeline: [] } });
    prismaMock.update.mockResolvedValue({});

    await aplicarTransicaoStatusV3("loja-1", "os1", "pronta");

    expect(entrega.registrarEntregaV3).not.toHaveBeenCalled();
    expect(prismaMock.update).toHaveBeenCalledTimes(1);
  });

  it("cancelamento NÃO chama o fluxo de entrega (restaura estoque + cancela CR)", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "em_execucao", timeline: [] } });
    prismaMock.update.mockResolvedValue({});

    await aplicarTransicaoStatusV3("loja-1", "os1", "cancelada");

    expect(entrega.registrarEntregaV3).not.toHaveBeenCalled();
    expect(estoque.restaurarEstoqueOSV3).toHaveBeenCalledTimes(1);
    expect(fin.cancelContaReceber).toHaveBeenCalledTimes(1);
  });
});
