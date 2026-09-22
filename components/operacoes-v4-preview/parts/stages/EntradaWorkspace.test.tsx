// OPS-V4-FLUXO-CURTO-001 / R04+R05 — rascunho do workspace (mesclagem e saídas).
//
// CAMADA: unidade da mesclagem por fatia + componente montado (editor real:
// digitação, refresh durante digitação, salvar com intent, descartar e stash
// por loja+OS via guarda). Nenhum `it.skip`: DOM provido pelo runner dedicado
// (test/ops-v4-fluxo-curto/vitest.config.ts).
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { SessionProvider } from "next-auth/react";
import userEvent from "@testing-library/user-event";

function SessaoWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider session={null}>{children}</SessionProvider>;
}

function renderComSessao(ui: ReactElement) {
  return render(ui, { wrapper: SessaoWrapper });
}
import { mesclarNaoTocadas, seedEntradaEditor } from "@/lib/operacoes-v4/entrada-form";
import { seedDadosBasicos } from "@/lib/operacoes-v4/dados-basicos-form";
import { criarGuardaRascunhos } from "../../use-entrada-draft-guard";
import type { V4Vals } from "../../use-v4-preview";
import { EntradaWorkspace } from "./EntradaWorkspace";
import { EntradaStage } from "./EntradaStage";

afterEach(() => {
  cleanup();
});

describe("R04 — mesclarNaoTocadas (fatia não tocada adota o servidor)", () => {
  it("adota fatias iguais à linha de base e preserva as tocadas", () => {
    const atual = { a: "typed", b: "old" };
    const salvo = { a: "old", b: "old" };
    const novo = { a: "server-new", b: "server-new" };
    const r = mesclarNaoTocadas(atual, salvo, novo);
    expect(r.mudou).toBe(true);
    expect(r.valor).toEqual({ a: "typed", b: "server-new" });
  });

  it("sem mudança no servidor, nada muda", () => {
    const atual = { a: "x" };
    const r = mesclarNaoTocadas(atual, { a: "x" }, { a: "x" });
    expect(r.mudou).toBe(false);
    expect(r.valor).toEqual({ a: "x" });
  });

  it("ignora chaves fora do rascunho atual (sem inventar campo)", () => {
    const r = mesclarNaoTocadas({ a: "x" }, { a: "x" }, { a: "x", z: "nova" } as Record<string, unknown>);
    expect(r.valor).toEqual({ a: "x" });
  });
});

function semente(cor: string, modelo: string) {
  const ed = seedEntradaEditor(null);
  ed.identificacao.cor = cor;
  ed.identificacao.modelo = modelo;
  return ed;
}

function vEditor(sobre?: Record<string, unknown>): V4Vals {
  const base = {
    selectedOsId: "os-1",
    realOS: null,
    os: { aparelho: "", cliente: "", imei: "", defeito: "", origem: "" },
    detailLoading: false,
    cargaEntradaEstabelecida: true,
    entradaEditorSeed: semente("", ""),
    dadosBasicosSeed: seedDadosBasicos(null),
    salvarIdentificacao: vi.fn(async () => true),
    salvarProvaEntrada: vi.fn(async () => true),
    salvarChecklist: vi.fn(async () => true),
    salvarAcessorios: vi.fn(async () => true),
    salvarDadosBasicos: vi.fn(async () => true),
    ...(sobre ?? {}),
  };
  return base as unknown as V4Vals;
}

describe("R04 — editor montado: refresh durante digitação (T03)", () => {
  it("semente assíncrona alimenta fatias não tocadas e preserva digitados", async () => {
    const { rerender } = renderComSessao(<EntradaWorkspace v={vEditor()} />);
    const cor = screen.getByLabelText("Cor") as HTMLInputElement;
    fireEvent.change(cor, { target: { value: "Preto" } });
    expect(cor.value).toBe("Preto");
    // Chega o detalhe do servidor: identificação e dados básicos novos.
    const edB = semente("Violeta", "M2");
    const dbB = seedDadosBasicos(null);
    dbB.prioridade = "alta";
    rerender(<EntradaWorkspace v={vEditor({ entradaEditorSeed: edB, dadosBasicosSeed: dbB })} />);
    // Fatia tocada (identificação) preserva a digitação por inteiro...
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Preto");
    // ...fatia intocada (dados básicos) adota o servidor.
    expect((screen.getByLabelText("Prioridade") as HTMLSelectElement).value).toBe("alta");
  });

  it("conflito no mesmo campo é explícito e bloqueia o salvar", async () => {
    const { rerender } = renderComSessao(<EntradaWorkspace v={vEditor()} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    // Servidor também mudou a identificação (outra sessão).
    rerender(<EntradaWorkspace v={vEditor({ entradaEditorSeed: semente("Azul", "M9") })} />);
    expect(await screen.findByText(/O servidor atualizou.*identificação/)).toBeTruthy();
    const salvar = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
  });
});

describe("R05 — editor montado: salvar com intent e descartar (T02/T11)", () => {
  it("salvar chama a action com o intent digitado e limpa o badge de sujeira", async () => {
    const salvarIdentificacao = vi.fn(async () => true);
    renderComSessao(<EntradaWorkspace v={vEditor({ salvarIdentificacao })} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(salvarIdentificacao).toHaveBeenCalledTimes(1);
    // Contrato pinado de cinco handlers: mapeador puro em argumento único (a
    // limpeza explícita é derivada no wrapper, coberta em entrada-form.test.ts).
    const [input] = salvarIdentificacao.mock.calls[0] as unknown as [Record<string, string>];
    expect(input).toMatchObject({ cor: "Preto" });
    await waitFor(() => expect(screen.queryByText("Alterações não salvas")).toBeNull());
  });

  it("descartar restaura o dado do servidor sem storage", async () => {
    renderComSessao(<EntradaWorkspace v={vEditor()} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
  });
});

describe("R04 — stage montado: stash por loja+OS restaura ao voltar", () => {
  it("digitação sobrevive à troca de OS e volta intacta", async () => {
    const guarda = criarGuardaRascunhos();
    const vA = vEditor({ selectedOsId: "os-1", rascunhos: guarda, osSelected: true });
    const { rerender } = renderComSessao(<EntradaStage v={vA} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    expect(guarda.sujo("sem-loja::os-1")).toBe(true);
    // Troca para outra OS: editor limpo com a semente dela.
    const vB = vEditor({
      selectedOsId: "os-2",
      rascunhos: guarda,
      osSelected: true,
      entradaEditorSeed: semente("Azul", "MB"),
    });
    rerender(<EntradaStage v={vB} />);
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Azul");
    // Volta: rascunho restaurado, sem perda.
    rerender(<EntradaStage v={vA} />);
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Preto");
  });
});
