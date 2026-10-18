import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
const mocks = vi.hoisted(() => ({ criar: vi.fn(), marcar: vi.fn(), preparar: vi.fn(), loja: "unidade-a" }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: mocks.loja }) }));
vi.mock("@/lib/operacoes-v3/orcamento-rapido-actions", () => ({ criarOrcamentoRapidoV3: mocks.criar }));
vi.mock("@/lib/operacoes-v3/comercial-pre-os-actions", () => ({ marcarOrcamentoPreOsV3: mocks.marcar }));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ prepararCompartilhamentoOrcamentoV3: mocks.preparar }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ClienteAtendimentoSection", () => ({ ClienteAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/AparelhoAtendimentoSection", () => ({ AparelhoAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ServicoCatalogLookup", () => ({ ServicoCatalogLookup: () => null }));
import { OrcamentoRapidoModal } from "@/components/operacoes-v4-preview/parts/OrcamentoRapidoModal";
import { orcamentoRapidoFormVazioV4 } from "@/lib/operacoes-v4/orcamento-rapido-form";

beforeEach(() => {
  vi.resetAllMocks(); mocks.loja = "unidade-a";
  mocks.criar.mockResolvedValue({ osId: "os-a" }); mocks.marcar.mockResolvedValue({}); mocks.preparar.mockResolvedValue({ tentativaId: "t-a" });
});
afterEach(cleanup);
function montar() {
  const base = orcamentoRapidoFormVazioV4();
  const form = { ...base, clienteModo: "novo", clienteNovoNome: "Cliente", clienteNovoTelefone: "11999990000", aparelhoMarca: "Marca", aparelhoModelo: "Modelo", defeitoRelatado: "Tela", grupoRotulo: "Tela", variantes: base.variantes.map((v, i) => ({ ...v, rotulo: `Tela ${i}`, valor: 300 + i * 100 })) };
  const criado = vi.fn();
  const montado = render(<OrcamentoRapidoModal v={{ orcamentoRapidoOpen: true, orcamentoRapidoInitialValues: form, closeOrcamentoRapido: vi.fn(), onOrcamentoRapidoCriado: criado } as unknown as V4Vals} />);
  return Object.assign(criado, montado);
}
describe("criação comercial V4 sempre em rascunho", () => {
  it.each(["Salvar rascunho", "Criar sem enviar"])("%s cria sem preparação ou envio", async (botao) => {
    const criado = montar(); fireEvent.click(screen.getByRole("button", { name: botao }));
    await waitFor(() => expect(criado).toHaveBeenCalledWith("os-a"));
    expect(mocks.marcar.mock.calls[0][2].statusComercial).toBe("rascunho"); expect(mocks.preparar).not.toHaveBeenCalled();
  });
  it("Criar e preparar mantém rascunho e prepara apenas o canal", async () => {
    const criado = montar(); fireEvent.click(screen.getByRole("button", { name: "Criar e preparar compartilhamento" }));
    await waitFor(() => expect(criado).toHaveBeenCalledWith("os-a"));
    expect(mocks.marcar.mock.calls[0][2].statusComercial).toBe("rascunho"); expect(mocks.preparar).toHaveBeenCalledWith("unidade-a", "os-a", "whatsapp");
  });
  it("falha depois da criação permite concluir sem criar outra OS, incluindo cliques repetidos", async () => {
    mocks.marcar.mockRejectedValueOnce(new Error("falha de carimbo"));
    const criado = montar(); const botao = screen.getByRole("button", { name: "Criar e preparar compartilhamento" });
    fireEvent.click(botao); fireEvent.click(botao);
    await screen.findByText(/Orçamento já criado em rascunho/);
    expect(mocks.criar).toHaveBeenCalledOnce(); expect(criado).not.toHaveBeenCalled();
    fireEvent.click(botao); await waitFor(() => expect(criado).toHaveBeenCalledWith("os-a"));
    expect(mocks.criar).toHaveBeenCalledOnce(); expect(mocks.marcar).toHaveBeenCalledTimes(2);
  });
  it("resposta de um formulário já descartado não seleciona a OS antiga na loja atual", async () => {
    let terminar!: (r: { osId: string }) => void;
    mocks.criar.mockImplementationOnce(() => new Promise((r) => { terminar = r; }));
    const criado = montar(); fireEvent.click(screen.getByRole("button", { name: "Criar sem enviar" }));
    criado.unmount(); mocks.loja = "unidade-b";
    terminar({ osId: "os-antiga" });
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith("unidade-a", "os-antiga", expect.objectContaining({ statusComercial: "rascunho" })));
    expect(criado).not.toHaveBeenCalled();
  });
});
