import { afterEach, describe, expect, it, vi } from "vitest";

type AnyFn = (...args: any[]) => any;

const getOrdemMock = vi.fn<AnyFn>();
vi.mock("@/app/actions/ordens", () => ({ getOrdem: (...args: unknown[]) => getOrdemMock(...args) }));

const enviarOrcamentoMock = vi.fn<AnyFn>();
const registrarEnvioMock = vi.fn<AnyFn>();
vi.mock("./orcamento-actions", () => ({
  enviarOrcamentoV3: (...args: unknown[]) => enviarOrcamentoMock(...args),
  registrarEnvioOrcamento: (...args: unknown[]) => registrarEnvioMock(...args),
}));

import { enviarOrcamentoPorCanalV3 } from "./orcamento-envio-actions";

function osComOrcamento(status: string, over: Record<string, unknown> = {}) {
  return {
    id: "os-1",
    codigo: "OS-0001",
    orcamento: { id: "orc-1", status, desconto: 0, total: 200, criadoEm: "x", servicos: [], pecas: [], ...over },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("enviarOrcamentoPorCanalV3 — primeiro envio (rascunho)", () => {
  it("chama enviarOrcamentoV3 e depois registrarEnvioOrcamento; retorna reenvio:false", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho"));
    enviarOrcamentoMock.mockResolvedValue({ id: "os-1", orcamento: { status: "enviado", validoAte: "2026-02-01T00:00:00.000Z" } });
    registrarEnvioMock.mockResolvedValue({ id: "os-1", orcamento: { status: "enviado", validoAte: "2026-02-01T00:00:00.000Z" } });

    const res = await enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp");

    expect(enviarOrcamentoMock).toHaveBeenCalledWith("loja-x", "os-1");
    expect(registrarEnvioMock).toHaveBeenCalledWith("loja-x", "os-1", "whatsapp");
    expect(res).toEqual({
      ok: true,
      reenvio: false,
      avisoRegistro: false,
      os: { id: "os-1", orcamento: { status: "enviado", validoAte: "2026-02-01T00:00:00.000Z" } },
    });
  });

  it("enviarOrcamentoV3 é chamado ANTES de registrarEnvioOrcamento (ordem importa)", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho"));
    const ordem: string[] = [];
    enviarOrcamentoMock.mockImplementation(async () => {
      ordem.push("enviar");
      return { id: "os-1" };
    });
    registrarEnvioMock.mockImplementation(async () => {
      ordem.push("registrar");
      return { id: "os-1" };
    });
    await enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp");
    expect(ordem).toEqual(["enviar", "registrar"]);
  });

  it("falha no registro APÓS envio bem-sucedido: ok:true com avisoRegistro:true (nunca mascarado, nunca lançado)", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho"));
    const osEnviada = { id: "os-1", orcamento: { status: "enviado", validoAte: "2026-02-01T00:00:00.000Z" } };
    enviarOrcamentoMock.mockResolvedValue(osEnviada);
    registrarEnvioMock.mockRejectedValue(new Error("Falha ao gravar auditoria."));

    const res = await enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp");

    expect(res).toEqual({ ok: true, reenvio: false, avisoRegistro: true, os: osEnviada });
  });

  it("falha no PRIMEIRO envio (enviarOrcamentoV3) propaga o erro — nada de sucesso parcial", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho"));
    enviarOrcamentoMock.mockRejectedValue(new Error("Falha ao enviar."));
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow("Falha ao enviar.");
    expect(registrarEnvioMock).not.toHaveBeenCalled();
  });
});

describe("enviarOrcamentoPorCanalV3 — reenvio (já enviado)", () => {
  it("NÃO chama enviarOrcamentoV3; só registrarEnvioOrcamento; retorna reenvio:true", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("enviado", { validoAte: "2026-02-01T00:00:00.000Z" }));
    registrarEnvioMock.mockResolvedValue({ id: "os-1", orcamento: { status: "enviado", validoAte: "2026-02-01T00:00:00.000Z" } });

    const res = await enviarOrcamentoPorCanalV3("loja-x", "os-1", "presencial");

    expect(enviarOrcamentoMock).not.toHaveBeenCalled();
    expect(registrarEnvioMock).toHaveBeenCalledWith("loja-x", "os-1", "presencial");
    expect(res.reenvio).toBe(true);
    expect(res.avisoRegistro).toBe(false);
    // validoAte preservado — vem do mock de registrarEnvioOrcamento, que nunca o altera de verdade.
    expect((res.os as { orcamento?: { validoAte?: string } }).orcamento?.validoAte).toBe("2026-02-01T00:00:00.000Z");
  });

  it("falha no registro do reenvio propaga o erro (não há sucesso parcial a relatar)", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("enviado"));
    registrarEnvioMock.mockRejectedValue(new Error("Falha ao registrar reenvio."));
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "outro")).rejects.toThrow("Falha ao registrar reenvio.");
  });
});

describe("enviarOrcamentoPorCanalV3 — estados inválidos", () => {
  it("rejeita orçamento aprovado", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("aprovado"));
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow(/aprovado/);
    expect(enviarOrcamentoMock).not.toHaveBeenCalled();
    expect(registrarEnvioMock).not.toHaveBeenCalled();
  });

  it("rejeita orçamento recusado", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("recusado"));
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow(/recusado/);
  });

  it("rejeita quando não há orçamento materializado (ausente)", async () => {
    getOrdemMock.mockResolvedValue({ id: "os-1", codigo: "OS-0001" });
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow(/não tem orçamento materializado/);
  });

  it("rejeita quando o orçamento ainda é prévia (sintetizado)", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho", { sintetizado: true }));
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow(/não tem orçamento materializado/);
  });

  it("rejeita quando a OS não existe", async () => {
    getOrdemMock.mockResolvedValue(null);
    await expect(enviarOrcamentoPorCanalV3("loja-x", "os-1", "whatsapp")).rejects.toThrow("OS não encontrada.");
  });

  it("rejeita storeId vazio antes de qualquer I/O", async () => {
    await expect(enviarOrcamentoPorCanalV3("", "os-1", "whatsapp")).rejects.toThrow(/unidade ativa/);
    expect(getOrdemMock).not.toHaveBeenCalled();
  });
});

describe("enviarOrcamentoPorCanalV3 — multi-loja", () => {
  it("storeId é trimado e repassado consistentemente a todas as chamadas", async () => {
    getOrdemMock.mockResolvedValue(osComOrcamento("rascunho"));
    enviarOrcamentoMock.mockResolvedValue({ id: "os-1" });
    registrarEnvioMock.mockResolvedValue({ id: "os-1" });
    await enviarOrcamentoPorCanalV3("  loja-y  ", "os-1", "whatsapp");
    expect(getOrdemMock.mock.calls[0]![0]).toBe("loja-y");
    expect(enviarOrcamentoMock.mock.calls[0]![0]).toBe("loja-y");
    expect(registrarEnvioMock.mock.calls[0]![0]).toBe("loja-y");
  });
});
