// OPS-V4-FLUXO-CURTO-001 / R04+R05 — guarda de rascunho: store puro + hook montado.
//
// CAMADA: unidade pura (regras de saída) + componente montado (hook real,
// diálogo de salvar/descartar/cancelar agindo sobre a UI). Sem storage
// genérico em nenhum fluxo; rascunho em memória da sessão.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import {
  criarGuardaRascunhos,
  saidaEtapaExigeGuardaV4,
  useGuardaRascunhos,
  type GuardaRascunhosV4,
} from "./use-entrada-draft-guard";

const CHAVE_A = "loja-a::os-1";

function acoesSpy(saveResult = true) {
  return {
    salvar: vi.fn(async () => saveResult),
    descartar: vi.fn(() => {}),
  };
}

describe("R04 — store puro: saídas reais, não só stash", () => {
  it("sem sujeira a saída é livre e imediata", () => {
    const g = criarGuardaRascunhos<string>();
    const sair = vi.fn();
    g.publicar(CHAVE_A, "rascunho", false, null);
    expect(g.solicitarSaida(sair, { chave: CHAVE_A, descricao: "trocar" })).toBe("livre");
    expect(sair).toHaveBeenCalledTimes(1);
    expect(g.pendente).toBeNull();
  });

  it("chave sem registro: saída livre (nada a guardar)", () => {
    const g = criarGuardaRascunhos<string>();
    const sair = vi.fn();
    expect(g.solicitarSaida(sair, { chave: CHAVE_A })).toBe("livre");
    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("com sujeira a saída BLOQUEIA e abre o pêndulo (sem rodar a saída)", () => {
    const g = criarGuardaRascunhos<string>();
    const sair = vi.fn();
    g.publicar(CHAVE_A, "digitado", true, acoesSpy());
    expect(g.solicitarSaida(sair, { chave: CHAVE_A, descricao: "trocar de OS" })).toBe("bloqueada");
    expect(sair).not.toHaveBeenCalled();
    expect(g.pendente).toEqual({ chave: CHAVE_A, descricao: "trocar de OS" });
  });

  it("cancelar IMPEDE a saída: nada salvo, nada descartado, nada roda", async () => {
    const g = criarGuardaRascunhos<string>();
    const acoes = acoesSpy();
    const sair = vi.fn();
    g.publicar(CHAVE_A, "digitado", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    g.cancelarSaida();
    expect(g.pendente).toBeNull();
    expect(sair).not.toHaveBeenCalled();
    expect(acoes.salvar).not.toHaveBeenCalled();
    expect(acoes.descartar).not.toHaveBeenCalled();
    expect(g.obter(CHAVE_A)?.rascunho).toBe("digitado");
    // Salvar após cancelar não faz nada (sem pêndulo).
    expect(await g.confirmarSalvamento()).toBe("aguardando");
    expect(sair).not.toHaveBeenCalled();
  });

  it("salvar captura o alvo original e só libera a saída após sucesso", async () => {
    const g = criarGuardaRascunhos<string>();
    const acoes = acoesSpy(true);
    const sair = vi.fn();
    g.publicar(CHAVE_A, "digitado", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    expect(await g.confirmarSalvamento()).toBe("saiu");
    expect(acoes.salvar).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledTimes(1);
    // Rascunho persistido sai da guarda.
    expect(g.obter(CHAVE_A)).toBeUndefined();
    expect(g.pendente).toBeNull();
  });

  it("falha no salvar mantém rascunho e pêndulo (sem saída)", async () => {
    const g = criarGuardaRascunhos<string>();
    const acoes = acoesSpy(false);
    const sair = vi.fn();
    g.publicar(CHAVE_A, "digitado", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    expect(await g.confirmarSalvamento()).toBe("aguardando");
    expect(sair).not.toHaveBeenCalled();
    expect(g.obter(CHAVE_A)?.rascunho).toBe("digitado");
    expect(g.pendente?.chave).toBe(CHAVE_A);
  });

  it("descartar limpa a chave e libera a saída", () => {
    const g = criarGuardaRascunhos<string>();
    const acoes = acoesSpy();
    const sair = vi.fn();
    g.publicar(CHAVE_A, "digitado", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    expect(g.confirmarDescarte()).toBe("saiu");
    expect(acoes.descartar).toHaveBeenCalledTimes(1);
    expect(acoes.salvar).not.toHaveBeenCalled();
    expect(sair).toHaveBeenCalledTimes(1);
    expect(g.obter(CHAVE_A)).toBeUndefined();
  });

  it("sem ação de salvar registrada, salvamento não sai (descarte/cancele)", async () => {
    const g = criarGuardaRascunhos<string>();
    g.publicar(CHAVE_A, "digitado", true, null);
    const sair = vi.fn();
    g.solicitarSaida(sair, { chave: CHAVE_A });
    expect(await g.confirmarSalvamento()).toBe("aguardando");
    expect(sair).not.toHaveBeenCalled();
  });

  it("limparTudo esvazia rascunhos e pêndulo (perda de sessão/acesso)", () => {
    const g = criarGuardaRascunhos<string>();
    g.publicar(CHAVE_A, "a", true, acoesSpy());
    g.publicar("loja-b::os-9", "b", false, null);
    g.solicitarSaida(vi.fn(), { chave: CHAVE_A });
    g.limparTudo();
    expect(g.temSujo()).toBe(false);
    expect(g.obter(CHAVE_A)).toBeUndefined();
    expect(g.pendente).toBeNull();
  });
});

describe("R04 — nenhum fluxo toca storage genérico", () => {
  let setSpy: ReturnType<typeof vi.spyOn>;
  let getSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    setSpy = vi.spyOn(Storage.prototype, "setItem");
    getSpy = vi.spyOn(Storage.prototype, "getItem");
  });
  afterEach(() => {
    setSpy.mockRestore();
    getSpy.mockRestore();
  });

  it("publicar/sair/salvar/descartar/cancelar/limpar não usam localStorage", async () => {
    const g = criarGuardaRascunhos<string>();
    const acoes = acoesSpy(true);
    const sair = vi.fn();
    g.publicar(CHAVE_A, "pin-1234-dado-sensivel", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    await g.confirmarSalvamento();
    g.publicar(CHAVE_A, "outro", true, acoes);
    g.solicitarSaida(sair, { chave: CHAVE_A });
    g.confirmarDescarte();
    g.cancelarSaida();
    g.limparTudo();
    expect(setSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
  });
});

describe("T11 — sair da Entrada para outra etapa com rascunho sujo exige o pêndulo", () => {
  it("saidaEtapaExigeGuardaV4: só Entrada → outra etapa", () => {
    expect(saidaEtapaExigeGuardaV4("entrada", "execucao")).toBe(true);
    expect(saidaEtapaExigeGuardaV4("entrada", "diagnostico")).toBe(true);
    expect(saidaEtapaExigeGuardaV4("entrada", "entrada")).toBe(false);
    expect(saidaEtapaExigeGuardaV4("execucao", "diagnostico")).toBe(false);
    expect(saidaEtapaExigeGuardaV4("diagnostico", "entrada")).toBe(false);
    expect(saidaEtapaExigeGuardaV4("", "execucao")).toBe(false);
  });

  it("go(stage) sai da Entrada pelo pêndulo; demais deslocamentos são diretos (guarda estática)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const dir = dirname(fileURLToPath(import.meta.url));
    const hook = readFileSync(join(dir, "use-v4-preview.ts"), "utf8");
    const go = hook.slice(hook.indexOf("const go = (stage"), hook.indexOf("// ---- rail ----"));
    expect(go).toContain("saidaEtapaExigeGuardaV4(st.stage, stage)");
    expect(go).toContain("sairComGuarda(sair,");
    // Sem sujeira a guarda libera imediato (livre) — o fluxo direto segue igual.
    const g = criarGuardaRascunhos<string>();
    const sair = vi.fn();
    expect(g.solicitarSaida(sair, { chave: CHAVE_A, descricao: "ir para a etapa execucao" })).toBe("livre");
    expect(sair).toHaveBeenCalledTimes(1);
    // Com sujeira bloqueia; Cancelar permanece (saída não roda).
    g.publicar(CHAVE_A, "digitado", true, acoesSpy());
    expect(g.solicitarSaida(sair, { chave: CHAVE_A, descricao: "ir para a etapa execucao" })).toBe("bloqueada");
    g.cancelarSaida();
    expect(sair).toHaveBeenCalledTimes(1);
    expect(g.sujo(CHAVE_A)).toBe(true);
  });
});

function Harness({ apiRef }: { apiRef: { current: GuardaRascunhosV4<string> | null } }) {
  const g = useGuardaRascunhos<string>();
  const ref = useRef(apiRef);
  ref.current = apiRef;
  useEffect(() => {
    apiRef.current = g;
  }, [g, apiRef]);
  const p = g.pendente;
  return (
    <div>
      <span data-testid="sujo">{g.temSujo() ? "SUJO" : "LIMPO"}</span>
      {p ? (
        <div role="alertdialog" aria-label="saída com rascunho">
          <span data-testid="descricao">{p.descricao}</span>
          <button type="button" onClick={() => void g.confirmarSalvamento()}>
            Salvar
          </button>
          <button type="button" onClick={() => g.confirmarDescarte()}>
            Descartar
          </button>
          <button type="button" onClick={() => g.cancelarSaida()}>
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("R05 — hook montado: diálogo de saída age sobre a UI", () => {
  it("sujeira abre o diálogo; Cancelar impede a saída", async () => {
    const apiRef: { current: GuardaRascunhosV4<string> | null } = { current: null };
    const sair = vi.fn();
    render(<Harness apiRef={apiRef} />);
    expect(screen.getByTestId("sujo").textContent).toBe("LIMPO");
    act(() => {
      apiRef.current?.publicar(CHAVE_A, "digitado", true, acoesSpy());
    });
    expect(screen.getByTestId("sujo").textContent).toBe("SUJO");
    let resultado: string | null = null;
    act(() => {
      resultado = apiRef.current?.solicitarSaida(sair, { chave: CHAVE_A, descricao: "trocar de OS" }) ?? null;
    });
    expect(resultado).toBe("bloqueada");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByTestId("descricao").textContent).toBe("trocar de OS");
    await screen.findByText("Salvar");
    fireEvent.click(screen.getByText("Cancelar"));
    expect(sair).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("sujo").textContent).toBe("SUJO");
  });

  it("Salvar no diálogo persiste e libera a saída original", async () => {
    const apiRef: { current: GuardaRascunhosV4<string> | null } = { current: null };
    const sair = vi.fn();
    const acoes = acoesSpy(true);
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current?.publicar(CHAVE_A, "digitado", true, acoes);
      apiRef.current?.solicitarSaida(sair, { chave: CHAVE_A, descricao: "trocar de loja" });
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByText("Salvar"));
    expect(acoes.salvar).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("sujo").textContent).toBe("LIMPO");
  });

  it("Descartar no diálogo limpa e libera a saída", async () => {
    const apiRef: { current: GuardaRascunhosV4<string> | null } = { current: null };
    const sair = vi.fn();
    const acoes = acoesSpy(true);
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current?.publicar(CHAVE_A, "digitado", true, acoes);
      apiRef.current?.solicitarSaida(sair, { chave: CHAVE_A });
    });
    fireEvent.click(screen.getByText("Descartar"));
    expect(acoes.descartar).toHaveBeenCalledTimes(1);
    expect(acoes.salvar).not.toHaveBeenCalled();
    expect(sair).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sujo").textContent).toBe("LIMPO");
  });
});
