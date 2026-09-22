// OPS-V4-FLUXO-CURTO-001 / R04+R05 — ponte opt-in da troca de loja.
//
// CAMADA: unidade pura (matriz de decisão) + componente montado (provider
// real). Prova o comportamento anterior SEM registro (troca imediata) e o
// bloqueio com guarda suja (sem tocar ACL, seleção automática,
// cookies/persistência ou demais módulos).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  aplicarTrocaLojaComGuarda,
  registrarGuardaTrocaLojaV4,
  LojaAtivaProvider,
  useLojaAtiva,
  type GuardaTrocaLojaV4,
} from "./loja-ativa";

afterEach(() => {
  cleanup();
  registrarGuardaTrocaLojaV4(null);
  vi.unstubAllGlobals();
});

describe("R04 — decisão pura da ponte opt-in", () => {
  it("sem guarda: troca imediata (comportamento anterior preservado)", () => {
    const trocar = vi.fn();
    expect(
      aplicarTrocaLojaComGuarda({ guarda: null, trocar, descricao: "x" }),
    ).toBe("trocada");
    expect(trocar).toHaveBeenCalledTimes(1);
  });

  it("guarda limpa: troca imediata, sem pêndulo", () => {
    const trocar = vi.fn();
    const solicitarSaida = vi.fn(() => "livre" as const);
    const guarda: GuardaTrocaLojaV4 = { temRascunhoSujo: () => false, solicitarSaida };
    expect(aplicarTrocaLojaComGuarda({ guarda, trocar, descricao: "x" })).toBe("trocada");
    expect(trocar).toHaveBeenCalledTimes(1);
    expect(solicitarSaida).not.toHaveBeenCalled();
  });

  it("guarda suja + pêndulo livre: troca executa uma vez", () => {
    const trocar = vi.fn();
    const solicitarSaida = vi.fn(() => "livre" as const);
    const guarda: GuardaTrocaLojaV4 = { temRascunhoSujo: () => true, solicitarSaida };
    expect(aplicarTrocaLojaComGuarda({ guarda, trocar, descricao: "x" })).toBe("trocada");
    expect(solicitarSaida).toHaveBeenCalledTimes(1);
  });

  it("guarda suja + pêndulo bloqueado: NÃO troca (Cancel impede a saída)", () => {
    const trocar = vi.fn();
    const solicitarSaida = vi.fn((_t: () => void, _d: string) => "bloqueada" as const);
    const guarda: GuardaTrocaLojaV4 = { temRascunhoSujo: () => true, solicitarSaida };
    expect(aplicarTrocaLojaComGuarda({ guarda, trocar, descricao: "x" })).toBe("bloqueada");
    expect(trocar).not.toHaveBeenCalled();
    expect(solicitarSaida).toHaveBeenCalledTimes(1);
  });
});

function mockRedeOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url).includes("/api/stores") && !String(url).includes("/settings")) {
        return {
          ok: true,
          json: async () => ({ stores: [{ id: "loja-a", name: "Loja A" }] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
}

function HarnessTroca({ destino }: { destino: string }) {
  const { lojaAtivaId, setLojaAtivaId, refreshStoresList } = useLojaAtiva();
  useEffect(() => {
    void refreshStoresList();
  }, [refreshStoresList]);
  return (
    <div>
      <span data-testid="loja">{lojaAtivaId ?? "VAZIA"}</span>
      <button type="button" onClick={() => setLojaAtivaId(destino)}>
        trocar
      </button>
    </div>
  );
}

describe("R05 — provider montado: comportamento anterior sem registro", () => {
  beforeEach(() => {
    mockRedeOk();
    window.alert = vi.fn() as unknown as typeof window.alert;
    window.localStorage.clear();
  });

  it("sem guarda registrada, a troca é imediata", async () => {
    render(
      <LojaAtivaProvider>
        <HarnessTroca destino="loja-b" />
      </LojaAtivaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loja").textContent).toBe("loja-a"));
    fireEvent.click(screen.getByText("trocar"));
    await waitFor(() => expect(screen.getByTestId("loja").textContent).toBe("loja-b"));
  });

  it("guarda limpa: troca imediata, pêndulo nem abre", async () => {
    const solicitarSaida = vi.fn(() => "livre" as const);
    registrarGuardaTrocaLojaV4({ temRascunhoSujo: () => false, solicitarSaida });
    render(
      <LojaAtivaProvider>
        <HarnessTroca destino="loja-b" />
      </LojaAtivaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loja").textContent).toBe("loja-a"));
    fireEvent.click(screen.getByText("trocar"));
    await waitFor(() => expect(screen.getByTestId("loja").textContent).toBe("loja-b"));
    expect(solicitarSaida).not.toHaveBeenCalled();
  });

  it("guarda suja + bloqueio: a loja NÃO troca e o pêndulo é solicitado", async () => {
    const trocarSpy = vi.fn();
    const solicitarSaida = vi.fn((_t: () => void, _d: string) => {
      trocarSpy();
      return "bloqueada" as const;
    });
    registrarGuardaTrocaLojaV4({ temRascunhoSujo: () => true, solicitarSaida });
    render(
      <LojaAtivaProvider>
        <HarnessTroca destino="loja-b" />
      </LojaAtivaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loja").textContent).toBe("loja-a"));
    fireEvent.click(screen.getByText("trocar"));
    // Dá tempo da troca imediata acontecer, se houvesse: não acontece.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId("loja").textContent).toBe("loja-a");
    expect(solicitarSaida).toHaveBeenCalledTimes(1);
    expect(trocarSpy).toHaveBeenCalledTimes(1);
    expect(solicitarSaida.mock.calls[0]?.[1]).toMatch(/loja-b/);
  });
});
