import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// SPRINT_3D.1 — ponte OS→Estoque da V3. Exercita a DECISÃO de quando/como chamar
// o adapter oficial (mockado) e o registro de erro na timeline. O adapter real
// já é testado pelo V2; aqui validamos o wiring: delegação, idempotência
// (passthrough de status), peça sem produto (nothing_to_consume) e erro→timeline.
// ============================================================================

const adapter = vi.hoisted(() => ({
  consumeEstoqueFromOS: vi.fn(),
  restoreEstoqueFromOS: vi.fn(),
}));
const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/operacoes/adapters/os-estoque", () => ({
  consumeEstoqueFromOS: adapter.consumeEstoqueFromOS,
  restoreEstoqueFromOS: adapter.restoreEstoqueFromOS,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { ordemServico: { findFirst: db.findFirst, update: db.update } },
}));

import { consumirEstoqueOSV3, restaurarEstoqueOSV3 } from "./estoque-sync";

beforeEach(() => {
  adapter.consumeEstoqueFromOS.mockReset();
  adapter.restoreEstoqueFromOS.mockReset();
  db.findFirst.mockReset();
  db.update.mockReset();
});

describe("estoque-sync · consumirEstoqueOSV3", () => {
  it("baixa estoque ao entregar, delegando ao adapter oficial", async () => {
    adapter.consumeEstoqueFromOS.mockResolvedValue({ ok: true, status: "consumed", movimentos: [{}, {}], ignored: [] });

    const r = await consumirEstoqueOSV3({ storeId: "loja-1", osId: "os1", operador: "Ana" });

    expect(r).toEqual({ status: "consumed", itens: 2 });
    expect(adapter.consumeEstoqueFromOS).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "loja-1", osId: "os1", operador: "Ana" }),
    );
    expect(db.update).not.toHaveBeenCalled(); // sucesso não escreve timeline de erro
  });

  it("idempotência: segunda entrega não baixa de novo (already_consumed)", async () => {
    adapter.consumeEstoqueFromOS.mockResolvedValue({ ok: true, status: "already_consumed", movimentos: [], ignored: [] });

    const r = await consumirEstoqueOSV3({ storeId: "loja-1", osId: "os1" });

    expect(r).toEqual({ status: "already_consumed", itens: 0 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("peça sem produto vinculado → nothing_to_consume (sem erro, sem baixa)", async () => {
    adapter.consumeEstoqueFromOS.mockResolvedValue({
      ok: true,
      status: "nothing_to_consume",
      movimentos: [],
      ignored: [{ source: "payload.pecas", ref: "nova-1", reason: "no_produto_match" }],
    });

    const r = await consumirEstoqueOSV3({ storeId: "loja-1", osId: "os1" });

    expect(r.status).toBe("nothing_to_consume");
    expect(r.itens).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("falha do adapter → registra estoque_sync_erro na timeline (best-effort, sem lançar)", async () => {
    adapter.consumeEstoqueFromOS.mockResolvedValue({ ok: false, status: "error", error: 'Estoque insuficiente para "Tela".', ignored: [] });
    db.findFirst.mockResolvedValue({ payload: { timeline: [{ id: "e0" }] } });
    db.update.mockResolvedValue({});

    const r = await consumirEstoqueOSV3({ storeId: "loja-1", osId: "os1" });

    expect(r.status).toBe("error");
    expect(r.error).toMatch(/insuficiente/);
    expect(db.update).toHaveBeenCalledTimes(1);
    const arg = db.update.mock.calls[0][0] as { data: { payload: { timeline: { tipo: string }[] } } };
    const tl = arg.data.payload.timeline;
    expect(tl).toHaveLength(2);
    expect(tl[tl.length - 1].tipo).toBe("estoque_sync_erro");
  });

  it("guarda parâmetros inválidos sem chamar o adapter", async () => {
    const r = await consumirEstoqueOSV3({ storeId: "  ", osId: "os1" });
    expect(r.status).toBe("error");
    expect(adapter.consumeEstoqueFromOS).not.toHaveBeenCalled();
  });
});

describe("estoque-sync · restaurarEstoqueOSV3", () => {
  it("restaura no cancelamento, delegando ao adapter (motivo automático)", async () => {
    adapter.restoreEstoqueFromOS.mockResolvedValue({ ok: true, status: "restored" });

    const r = await restaurarEstoqueOSV3({ storeId: "loja-1", osId: "os1", operador: "Ana" });

    expect(r).toEqual({ status: "restored" });
    expect(adapter.restoreEstoqueFromOS).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "loja-1", osId: "os1", motivo: "automatico", operador: "Ana" }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("falha do adapter na restauração → timeline de erro", async () => {
    adapter.restoreEstoqueFromOS.mockResolvedValue({ ok: false, status: "error", error: "boom" });
    db.findFirst.mockResolvedValue({ payload: { timeline: [] } });
    db.update.mockResolvedValue({});

    const r = await restaurarEstoqueOSV3({ storeId: "loja-1", osId: "os1" });

    expect(r.status).toBe("error");
    expect(db.update).toHaveBeenCalledTimes(1);
    const arg = db.update.mock.calls[0][0] as { data: { payload: { timeline: { tipo: string }[] } } };
    expect(arg.data.payload.timeline[0].tipo).toBe("estoque_sync_erro");
  });

  it("guarda parâmetros inválidos sem chamar o adapter", async () => {
    const r = await restaurarEstoqueOSV3({ storeId: "loja-1", osId: "" });
    expect(r.status).toBe("error");
    expect(adapter.restoreEstoqueFromOS).not.toHaveBeenCalled();
  });
});
