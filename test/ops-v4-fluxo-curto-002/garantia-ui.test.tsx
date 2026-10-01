import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import { DocumentosEntregaCard, GarantiaFormCard } from "@/components/operacoes-v4-preview/parts/stages/EntregaStage";

afterEach(cleanup);

function os(modelo?: string, prazoDias?: number, atualizadoEm = "t1"): OrdemServico {
  return {
    id: "os-002",
    storeId: "loja-002",
    atualizadoEm,
    ...(modelo ? { aberturaV3: { garantiaPrevista: { modelo, prazoDias } } } : {}),
  } as unknown as OrdemServico;
}

function vals(realOS: OrdemServico, salvarGarantia = vi.fn(async () => true)): V4Vals {
  return { realOS, salvarGarantia, openDocPrint: vi.fn() } as unknown as V4Vals;
}

describe("editor V4 de garantia montado", () => {
  it("Sem garantia força prazo zero visual e envia par coerente", async () => {
    const salvar = vi.fn(async () => true);
    render(<GarantiaFormCard v={vals(os("tela", 90), salvar)} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sem_garantia" } });
    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "0");
    expect(screen.getByRole("spinbutton")).toHaveProperty("disabled", true);
    expect(screen.getByText("Sem cobertura — prazo 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar garantia" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith({ modeloId: "sem_garantia", prazoDias: 0 }));
  });

  it("Tela carrega o prazo padrão e permite prazo coberto positivo", async () => {
    const salvar = vi.fn(async () => true);
    render(<GarantiaFormCard v={vals(os("sem_garantia", 0), salvar)} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tela" } });
    const prazo = screen.getByRole("spinbutton");
    expect(prazo).toHaveProperty("value", "90");
    expect(prazo).toHaveProperty("disabled", false);
    fireEvent.change(prazo, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar garantia" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith({ modeloId: "tela", prazoDias: 45 }));
  });

  it("falha e refresh da mesma OS preservam a edição e mostram erro recuperável", async () => {
    const salvar = vi.fn(async () => false);
    const v = vals(os("tela", 90), salvar);
    const view = render(<GarantiaFormCard v={v} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar garantia" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível salvar/));
    view.rerender(<GarantiaFormCard v={{ ...v, realOS: os("tela", 90, "t2") }} />);
    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "45");
    expect(screen.getByRole("button", { name: "Salvar garantia" })).toHaveProperty("disabled", false);
  });
});

describe("documentos V4 montados", () => {
  it("bloqueia termo sem garantia definida e libera após definição", () => {
    const v = vals(os());
    const view = render(<DocumentosEntregaCard v={v} />);
    expect(screen.getByRole("button", { name: "Imprimir Termo de Garantia" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Defina a garantia da OS antes de emitir o termo.")).toBeTruthy();
    const definida = { ...v, realOS: os("tela", 90) };
    view.rerender(<DocumentosEntregaCard v={definida} />);
    const botao = screen.getByRole("button", { name: "Imprimir Termo de Garantia" });
    expect(botao).toHaveProperty("disabled", false);
    fireEvent.click(botao);
    expect(definida.openDocPrint).toHaveBeenCalledWith("termo_garantia");
  });
});
