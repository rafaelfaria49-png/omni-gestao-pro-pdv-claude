import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// SPRINT_3D.2 — ENTREGA UNIFICADA (bug B1)
// ----------------------------------------------------------------------------
// Invariante: TODA transição para "entregue" é roteada para o fluxo canônico
// `registrarEntregaV3` (entrega formal + garantia + estoque + evento), e NENHUMA
// transição "status-only" finaliza a entrega. Transições não-entrega seguem o
// caminho normal da máquina única e NÃO chamam o fluxo de entrega.
// ============================================================================

interface PagamentoMockV3 {
  total: number;
  recebido: number;
  saldo: number;
  status: string;
}
interface CancelContaReceberMockResult {
  ok: boolean;
  reason?: string;
  data?: unknown;
}

const entrega = vi.hoisted(() => ({ registrarEntregaV3: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const estoque = vi.hoisted(() => ({ restaurarEstoqueOSV3: vi.fn(async () => ({ status: "restored" })) }));
const fin = vi.hoisted(() => ({
  cancelContaReceber: vi.fn(async (): Promise<CancelContaReceberMockResult> => ({ ok: true, data: {} })),
}));
const pdv = vi.hoisted(() => ({
  lerPagamentoOSV3: vi.fn(async (): Promise<PagamentoMockV3> => ({ total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" })),
}));

vi.mock("./entrega-actions", () => ({ registrarEntregaV3: entrega.registrarEntregaV3 }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { ordemServico: { findFirst: prismaMock.findFirst, update: prismaMock.update } } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Ana" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/financeiro/services/contas-receber-service", () => ({ cancelContaReceber: fin.cancelContaReceber }));
vi.mock("./estoque-sync", () => ({ restaurarEstoqueOSV3: estoque.restaurarEstoqueOSV3 }));
// GOAL OPS-V3-CANCELAR-OS-CONTRATO-SEGURO-019: `aplicarTransicaoStatusV3` agora lê
// o pagamento autoritativo (`lerPagamentoOSV3`) antes de cancelar — mockado aqui
// porque este arquivo testa só o roteamento de status (entrega/cancelamento), não
// o motor de pagamento (que tem suíte própria).
vi.mock("./pdv-servico-actions", () => ({ lerPagamentoOSV3: pdv.lerPagamentoOSV3 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { aplicarTransicaoStatusV3 } from "./status-actions";

beforeEach(() => {
  entrega.registrarEntregaV3.mockReset();
  prismaMock.findFirst.mockReset();
  prismaMock.update.mockReset();
  estoque.restaurarEstoqueOSV3.mockClear();
  fin.cancelContaReceber.mockClear();
  fin.cancelContaReceber.mockResolvedValue({ ok: true, data: {} });
  pdv.lerPagamentoOSV3.mockClear();
  pdv.lerPagamentoOSV3.mockResolvedValue({ total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" });
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

  it("cancelamento com motivo e sem pagamento NÃO chama o fluxo de entrega (restaura estoque + cancela CR)", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "em_execucao", timeline: [] } });
    prismaMock.update.mockResolvedValue({});

    await aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Cliente desistiu do serviço" });

    expect(entrega.registrarEntregaV3).not.toHaveBeenCalled();
    expect(estoque.restaurarEstoqueOSV3).toHaveBeenCalledTimes(1);
    expect(fin.cancelContaReceber).toHaveBeenCalledTimes(1);
    expect(fin.cancelContaReceber).toHaveBeenCalledWith(expect.objectContaining({ motivo: "Cliente desistiu do serviço" }));
  });
});

// ---------------------------------------------------------------------------
// GOAL OPS-V3-CANCELAR-OS-CONTRATO-SEGURO-019 — política de cancelamento seguro:
// motivo obrigatório + bloqueio quando há pagamento recebido + retorno de
// `cancelContaReceber` nunca ignorado. Transições não-cancelamento intocadas.
// ---------------------------------------------------------------------------
describe("GOAL OPS-V3-CANCELAR-OS-CONTRATO-SEGURO-019 — bloqueios de cancelamento", () => {
  beforeEach(() => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "em_execucao", timeline: [] } });
    prismaMock.update.mockResolvedValue({});
  });

  it("sem motivo: rejeita e não escreve status nem CR", async () => {
    await expect(aplicarTransicaoStatusV3("loja-1", "os1", "cancelada")).rejects.toThrow(/motivo/i);
    expect(prismaMock.update).not.toHaveBeenCalled();
    expect(fin.cancelContaReceber).not.toHaveBeenCalled();
  });

  it("motivo curto (<5 caracteres): rejeita e não escreve nada", async () => {
    await expect(aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "abc" })).rejects.toThrow(/mín/i);
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("pagamento TOTAL recebido: bloqueia e mantém status anterior (sem write, sem cancelar CR)", async () => {
    pdv.lerPagamentoOSV3.mockResolvedValue({ total: 300, recebido: 300, saldo: 0, status: "quitado" });
    await expect(
      aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Cliente desistiu" }),
    ).rejects.toThrow("Esta OS possui pagamento recebido. Estorne o recebimento antes de cancelar.");
    expect(prismaMock.update).not.toHaveBeenCalled();
    expect(fin.cancelContaReceber).not.toHaveBeenCalled();
  });

  it("pagamento PARCIAL recebido: bloqueia e mantém status anterior (sem write)", async () => {
    pdv.lerPagamentoOSV3.mockResolvedValue({ total: 480, recebido: 200, saldo: 280, status: "parcial" });
    await expect(
      aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Cliente desistiu" }),
    ).rejects.toThrow("Esta OS possui pagamento recebido. Estorne o recebimento antes de cancelar.");
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("cancelContaReceber retorna ok:false por motivo que NÃO é 'not_found': aborta, não muda status", async () => {
    fin.cancelContaReceber.mockResolvedValue({ ok: false, reason: "titulo_estornado" });
    await expect(
      aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Cliente desistiu" }),
    ).rejects.toThrow();
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("cancelContaReceber retorna 'not_found' (OS nunca cobrada): prossegue normalmente", async () => {
    fin.cancelContaReceber.mockResolvedValue({ ok: false, reason: "not_found" });
    await aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Cliente desistiu" });
    expect(prismaMock.update).toHaveBeenCalledTimes(1);
  });

  it("OS entregue não pode cancelar (bloqueado pela máquina única — status nunca muda)", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "entregue", timeline: [] } });
    await expect(
      aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Teste de bloqueio" }),
    ).rejects.toThrow(/entregue/i);
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("OS já cancelada não pode cancelar de novo (bloqueado pela máquina única — from === to)", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "cancelada", timeline: [] } });
    await expect(
      aplicarTransicaoStatusV3("loja-1", "os1", "cancelada", { motivo: "Teste de bloqueio" }),
    ).rejects.toThrow("A OS já está neste status.");
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("OS cancelada não pode ser reativada para outro status (bloqueado pela máquina única)", async () => {
    prismaMock.findFirst.mockResolvedValue({ id: "os1", payload: { operacaoStatusV3: "cancelada", timeline: [] } });
    await expect(aplicarTransicaoStatusV3("loja-1", "os1", "aberta")).rejects.toThrow(/não pode ser reativada/i);
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it("transição não-cancelamento (pronta) nunca lê pagamento — comportamento intocado", async () => {
    await aplicarTransicaoStatusV3("loja-1", "os1", "pronta");
    expect(pdv.lerPagamentoOSV3).not.toHaveBeenCalled();
    expect(fin.cancelContaReceber).not.toHaveBeenCalled();
    expect(prismaMock.update).toHaveBeenCalledTimes(1);
  });
});
