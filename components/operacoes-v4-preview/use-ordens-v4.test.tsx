// OPS-V4-FLUXO-CURTO-001 / R03 — leitores de OS (geração e invalidação).
//
// CAMADA: componente montado (hook real + actions mockadas com promessas
// controladas). Prova que resposta tardia, erro e desmontagem respeitam a
// geração atual (loja+OS): nada de A vaza em B, nada toca estado morto.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { alvoAindaSelecionado, resolverOSSelecionada } from "@/lib/operacoes-v4/entrada-form";
import type { OrdemServico } from "@/types/os";

vi.mock("@/app/actions/ordens", () => ({
  listOrdens: vi.fn(),
  getOrdem: vi.fn(),
}));

import { listOrdens, getOrdem } from "@/app/actions/ordens";
import { useOrdensV4, useOrdemV4 } from "./use-ordens-v4";

const mockListOrdens = vi.mocked(listOrdens);
const mockGetOrdem = vi.mocked(getOrdem);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function linhaOS(id: string, loja: string, codigo: string): OrdemServico {
  return { id, storeId: loja, codigo } as unknown as OrdemServico;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("R03 — geração de requisição (contrato executável em leitura)", () => {
  it("documenta a regra: limpar seleção/loja invalida a geração pendente", () => {
    const detalhe = { id: "os-1", storeId: "loja-a" } as unknown as OrdemServico;
    expect(resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-a", ordemDetail: detalhe, ordens: [] })).toBe(detalhe);
    expect(alvoAindaSelecionado({ lojaId: "a", osId: "1" }, { lojaId: "b", osId: "1" })).toBe(false);
  });
});

describe("R03 — detalhe montado: troca rápida A→B descarta a resposta de A", () => {
  it("resposta tardia de A não repovoa após trocar para B", async () => {
    const pendA = deferred<OrdemServico | null>();
    const pendB = deferred<OrdemServico | null>();
    mockGetOrdem.mockImplementation((_sid: string, id: string) =>
      id === "os-1" ? pendA.promise : pendB.promise,
    );
    const { result, rerender } = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    expect(result.current.loading).toBe(true);
    rerender({ sid: "loja-b", id: "os-2" });
    await act(async () => {
      pendA.resolve(linhaOS("os-1", "loja-a", "A-TARDIA"));
    });
    // A resposta de A chegou com B selecionada: descartada, sem dado de A em B.
    expect(result.current.ordem).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      pendB.resolve(linhaOS("os-2", "loja-b", "B-ATUAL"));
    });
    expect(result.current.ordem?.codigo).toBe("B-ATUAL");
    expect(result.current.loading).toBe(false);
  });

  it("A→B→A: resposta antiga de A não sobrescreve a nova leitura de A", async () => {
    const p1 = deferred<OrdemServico | null>();
    const p2 = deferred<OrdemServico | null>();
    const p3 = deferred<OrdemServico | null>();
    const chamadas: string[] = [];
    mockGetOrdem.mockImplementation((_sid: string, id: string) => {
      chamadas.push(id);
      if (chamadas.length === 1) return p1.promise;
      if (chamadas.length === 2) return p2.promise;
      return p3.promise;
    });
    const { result, rerender } = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    rerender({ sid: "loja-b", id: "os-2" });
    rerender({ sid: "loja-a", id: "os-1" });
    await act(async () => {
      p1.resolve(linhaOS("os-1", "loja-a", "A-ANTIGA"));
    });
    expect(result.current.ordem).toBeNull();
    await act(async () => {
      p3.resolve(linhaOS("os-1", "loja-a", "A-NOVA"));
    });
    expect(result.current.ordem?.codigo).toBe("A-NOVA");
    await act(async () => {
      p2.resolve(linhaOS("os-2", "loja-b", "B-TARDIA"));
    });
    // B tardia não contamina A atual.
    expect(result.current.ordem?.codigo).toBe("A-NOVA");
  });

  it("erro de A não suja B; erro de B aparece só em B", async () => {
    const pendA = deferred<OrdemServico | null>();
    const pendB = deferred<OrdemServico | null>();
    mockGetOrdem.mockImplementation((_sid: string, id: string) =>
      id === "os-1" ? pendA.promise : pendB.promise,
    );
    const { result, rerender } = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    rerender({ sid: "loja-b", id: "os-2" });
    await act(async () => {
      pendA.reject(new Error("falha em A"));
    });
    expect(result.current.error).toBeNull();
    await act(async () => {
      pendB.reject(new Error("falha em B"));
    });
    expect(result.current.error).toBe("falha em B");
  });

  it("limpar a seleção zera detalhe e erro sem chamar a action", async () => {
    const pend = deferred<OrdemServico | null>();
    mockGetOrdem.mockReturnValue(pend.promise);
    const { result, rerender } = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    expect(mockGetOrdem).toHaveBeenCalledTimes(1);
    rerender({ sid: null, id: null });
    expect(result.current.ordem).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    await act(async () => {
      pend.resolve(linhaOS("os-1", "loja-a", "TARDIA"));
    });
    // Resolução após limpeza: geração inválida, nada ressurge.
    expect(result.current.ordem).toBeNull();
    expect(mockGetOrdem).toHaveBeenCalledTimes(1);
  });

  it("desmontar com promessa controlada não quebra; remontar recarrega", async () => {
    const pend = deferred<OrdemServico | null>();
    mockGetOrdem.mockReturnValue(pend.promise);
    const { unmount } = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    unmount();
    await act(async () => {
      pend.resolve(linhaOS("os-1", "loja-a", "TARDIA"));
    });
    // Sem exceção e sem estado morto: remontar dispara nova geração e carrega.
    const pend2 = deferred<OrdemServico | null>();
    mockGetOrdem.mockReturnValue(pend2.promise);
    const segundo = renderHook(({ sid, id }) => useOrdemV4(sid, id), {
      initialProps: { sid: "loja-a" as string | null, id: "os-1" as string | null },
    });
    await act(async () => {
      pend2.resolve(linhaOS("os-1", "loja-a", "NOVA"));
    });
    expect(segundo.result.current.ordem?.codigo).toBe("NOVA");
    segundo.unmount();
  });
});

describe("R03 — lista montada: sem loja não busca; troca descarta anterior", () => {
  it("sem loja: vazio imediato, sem chamada; com loja: lista carrega", async () => {
    const pend = deferred<OrdemServico[]>();
    mockListOrdens.mockReturnValue(pend.promise);
    const { result, rerender } = renderHook(({ sid }) => useOrdensV4(sid), {
      initialProps: { sid: null as string | null },
    });
    expect(result.current.ordens).toEqual([]);
    expect(result.current.primeiraCarga).toBe(false);
    expect(mockListOrdens).not.toHaveBeenCalled();
    rerender({ sid: "loja-a" });
    await act(async () => {
      pend.resolve([linhaOS("os-1", "loja-a", "A1")]);
    });
    expect(result.current.ordens.map((o) => o.codigo)).toEqual(["A1"]);
  });

  it("troca de loja A→B: resposta tardia de A não repovoa a lista de B", async () => {
    const pendA = deferred<OrdemServico[]>();
    const pendB = deferred<OrdemServico[]>();
    mockListOrdens.mockImplementation((sid: string) => (sid === "loja-a" ? pendA.promise : pendB.promise));
    const { result, rerender } = renderHook(({ sid }) => useOrdensV4(sid), {
      initialProps: { sid: "loja-a" as string | null },
    });
    rerender({ sid: "loja-b" });
    await act(async () => {
      pendA.resolve([linhaOS("os-1", "loja-a", "A1")]);
    });
    expect(result.current.ordens).toEqual([]);
    await act(async () => {
      pendB.resolve([linhaOS("os-2", "loja-b", "B1")]);
    });
    expect(result.current.ordens.map((o) => o.codigo)).toEqual(["B1"]);
  });
});
