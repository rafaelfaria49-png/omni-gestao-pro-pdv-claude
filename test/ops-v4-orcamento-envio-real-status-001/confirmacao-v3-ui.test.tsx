import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
const actions = vi.hoisted(() => ({ preparar: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({ enviarOrcamentoV3: actions.enviar, gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), aprovarOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ prepararCompartilhamentoOrcamentoV3: actions.preparar }));
import { useOrcamentoV3 } from "@/components/operacoes-v3/hooks/use-orcamento-v3";
beforeEach(() => { vi.resetAllMocks(); actions.preparar.mockResolvedValue({ tentativaId: "t-v3" }); actions.enviar.mockResolvedValue({ id: "os-v3" }); });
describe("contrato do hook V3 — declaração manual explícita", () => {
  it("sem declaração não prepara nem confirma; com declaração usa tentativa/canal auditados", async () => {
    const success = vi.fn(); const { result } = renderHook(() => useOrcamentoV3("unidade-a", "os-v3", success));
    await act(async () => { expect(await result.current.enviar(false as any)).toBe(false); });
    expect(actions.preparar).not.toHaveBeenCalled(); expect(actions.enviar).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.enviar(true)).toBe(true); });
    expect(actions.preparar).toHaveBeenCalledWith("unidade-a", "os-v3", "outro");
    expect(actions.enviar).toHaveBeenCalledWith("unidade-a", "os-v3", { tentativaId: "t-v3", confirmado: true });
    expect(success).toHaveBeenCalledOnce();
  });
  it("falha na confirmação mantém erro e não informa sucesso", async () => {
    actions.enviar.mockRejectedValue(new Error("Não foi possível confirmar"));
    const success = vi.fn(); const { result } = renderHook(() => useOrcamentoV3("unidade-a", "os-v3", success));
    await act(async () => { expect(await result.current.enviar(true)).toBe(false); });
    expect(result.current.error).toBe("Não foi possível confirmar"); expect(success).not.toHaveBeenCalled();
  });
});
