import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GarantiaEditorV3, CoberturasGarantiaResumoV3 } from "@/components/operacoes-v3/components/GarantiaEditorV3";
import { GarantiaOSCard } from "@/components/operacoes-v4-preview/parts/stages/EntregaStage";
import { PrintPreviewV3 } from "@/components/operacoes-v3/components/print/PrintPreviewV3";
import { adicionarVersaoTermoGarantiaV3 } from "@/lib/operacoes-v3/garantia-termos-model";
import { comPadroesGarantiaServicosV3, gravarCoberturasGarantiaV3, lerCoberturasGarantiaV3 } from "@/lib/operacoes-v3/garantia-servicos-model";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import { osGarantiasSinteticaV3 } from "./fixtures";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const os = () => comPadroesGarantiaServicosV3(osGarantiasSinteticaV3());
describe("editor recolhido e coberturas reais", () => {
  it("condições idênticas usam resumo compacto sem perder as duas linhas do mesmo catálogo", () => {
    const igual = osGarantiasSinteticaV3();
    igual.orcamento!.servicos = igual.orcamento!.servicos.filter((c) => c.id === "tela-1" || c.id === "tela-2");
    render(<CoberturasGarantiaResumoV3 os={igual} />);
    expect(screen.getByText("2 serviços · condições iguais")).toBeTruthy();
    expect(screen.getAllByText("90 dias")).toHaveLength(1);
    expect(screen.getAllByText("Troca de Tela")).toHaveLength(2);
  });
  it("começa recolhido, mostra cada prazo e abre condições ou edição explicitamente", () => {
    const v = { realOS: os(), salvarGarantia: vi.fn(), entrega: { garantia: { temGarantia: true, situacao: "Por serviço", situacaoTone: "info" } } } as unknown as V4Vals;
    render(<GarantiaOSCard v={v} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getAllByText("90 dias")).toHaveLength(2);
    expect(screen.getByText("30 dias")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{ name: "Ver condições" }));
    expect(screen.getByRole("region",{ name: "Condições por serviço" })).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("button",{ name: "Alterar prazo" }));
    expect(screen.getByRole("spinbutton")).toHaveProperty("value","90");
    expect(screen.getByRole("combobox",{ name: "Serviço" })).toBeTruthy();
  });
  it("extensão exige motivo, envia ID real e mantém as outras linhas", async () => {
    const salvar = vi.fn(async () => true);
    render(<GarantiaEditorV3 os={os()} salvar={salvar} origem="v4" />);
    fireEvent.change(screen.getByRole("combobox",{ name: "Serviço" }),{ target: { value: "tela-2" } });
    fireEvent.change(screen.getByRole("spinbutton"),{ target: { value: "720" } });
    fireEvent.click(screen.getByRole("button",{ name: "Salvar garantia" }));
    expect(salvar).not.toHaveBeenCalled(); expect(screen.getByRole("alert").textContent).toMatch(/motivo obrigatório/);
    fireEvent.change(screen.getByLabelText(/Motivo da alteração/),{ target: { value: "Extensão sintética autorizada" } });
    fireEvent.click(screen.getByRole("button",{ name: "Salvar garantia" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ linhaId: "tela-2", modeloId: "tela", prazoDias: 720, motivo: "Extensão sintética autorizada", esperado: expect.any(String), origem: "v4" })));
  });
  it("falha preserva rascunho; resposta tardia não aparece em outra OS/loja", async () => {
    let responder!: (v: boolean) => void;
    const salvar = vi.fn(() => new Promise<boolean>((r) => { responder = r; }));
    const inicial = os();
    const view = render(<GarantiaEditorV3 key="a" os={inicial} salvar={salvar} />);
    fireEvent.change(screen.getByRole("spinbutton"),{ target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Motivo da alteração/),{ target: { value: "Extensão" } });
    fireEvent.click(screen.getByRole("button",{ name: "Salvar garantia" }));
    const outra = osGarantiasSinteticaV3({ id: "outra-os", storeId: "outra-loja" });
    view.rerender(<GarantiaEditorV3 key="b" os={outra} salvar={salvar} />);
    await act(async () => responder(false));
    expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByRole("spinbutton")).toHaveProperty("value","90");
  });
});
describe("impressão versionada", () => {
  it("prévia/legado bloqueiam impressão; versões emitidas usam conteúdo e auditoria da versão escolhida", async () => {
    const printed = vi.fn(), close = vi.fn(), print = vi.spyOn(window,"print").mockImplementation(() => {});
    const view = render(<PrintPreviewV3 tipo="termo_garantia" os={os()} onClose={close} onPrinted={printed} />);
    await waitFor(() => expect(screen.getByRole("button",{ name: "Imprimir" })).toHaveProperty("disabled",true));
    let emitida = adicionarVersaoTermoGarantiaV3({ ...os(), entregueEm: "2026-10-13T12:00:00Z" },{ tipo: "original", agora: "2026-10-13T12:00:00Z", operadorId: "qa", operador: "QA", motivo: "Entrega", origem: "teste" });
    const c = lerCoberturasGarantiaV3(emitida); c[1].prazoDias = 60;
    emitida = adicionarVersaoTermoGarantiaV3(gravarCoberturasGarantiaV3(emitida,c),{ tipo: "aditivo", agora: "2026-10-14T12:00:00Z", operadorId: "qa", operador: "QA", motivo: "Extensão", origem: "teste" });
    view.rerender(<PrintPreviewV3 tipo="termo_garantia" os={emitida} onClose={close} onPrinted={printed} />);
    expect(screen.getByRole("combobox",{ name: "Versão do termo" })).toHaveProperty("value","2");
    fireEvent.change(screen.getByRole("combobox",{ name: "Versão do termo" }),{ target: { value: "1" } });
    fireEvent.click(screen.getByRole("button",{ name: "Imprimir" }));
    expect(print).toHaveBeenCalledTimes(1); expect(printed).toHaveBeenCalledWith("termo_garantia",1);
    expect(document.querySelector("#og-print-root")?.textContent).toContain("30 dias");
    expect(document.querySelector("#og-print-root")?.textContent).not.toContain("60 dias");
    fireEvent.keyDown(document.activeElement ?? document.body,{ key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
