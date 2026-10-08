import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";

const mocks = vi.hoisted(() => ({
  autorizada: vi.fn(),
  comum: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "qa-003", name: "Operador QA" } } }) }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-003" }) }));
vi.mock("@/lib/operacoes-v3/nova-os-actions", () => ({
  criarOSServicoAutorizadoV3: mocks.autorizada,
  criarOSEnterpriseV3: mocks.comum,
}));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ClienteAtendimentoSection", () => ({
  ClienteAtendimentoSection: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({
      modo: "novo", existente: null,
      novo: { nome: "Cliente QA", telefone: "", documento: "", email: "" },
    })}>Preencher cliente QA</button>
  ),
}));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/AparelhoAtendimentoSection", () => ({
  AparelhoAtendimentoSection: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({
      tipo: "celular", marca: "Samsung", modelo: "Galaxy QA", imei: "", cor: "", defeitoRelatado: "Tela quebrada",
    })}>Preencher aparelho QA</button>
  ),
}));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ServicoCatalogLookup", () => ({
  ServicoCatalogLookup: () => null,
}));

import { NovaOSModal } from "@/components/operacoes-v4-preview/parts/NovaOSModal";

const osAprovada = { id: "os-003", codigo: "OS-003", status: "aprovado", operacaoStatusV3: "aprovado" };

function mount() {
  const onOSCriada = vi.fn();
  const closeNovaOS = vi.fn();
  render(<NovaOSModal v={{ novaOSOpen: true, onOSCriada, closeNovaOS } as unknown as V4Vals} />);
  fireEvent.click(screen.getByRole("button", { name: "Preencher cliente QA" }));
  fireEvent.click(screen.getByRole("button", { name: "Preencher aparelho QA" }));
  return { onOSCriada, closeNovaOS };
}

function preencherServico() {
  fireEvent.change(screen.getByLabelText("Nome do serviço"), { target: { value: "Troca de tela" } });
  fireEvent.change(screen.getByLabelText("Valor de venda"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("Custo interno"), { target: { value: "92" } });
  fireEvent.change(screen.getByLabelText("Garantia em dias"), { target: { value: "90" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.autorizada.mockResolvedValue({ os: osAprovada });
  mocks.comum.mockResolvedValue({ os: { id: "os-aberta", status: "aberta" } });
});
afterEach(cleanup);

describe("OPS-V4-FLUXO-CURTO-003 — Nova OS montada", () => {
  it("U01/U02/U07: serviço válido aberto usa action autorizada e entrega a OS real sem confirmação redundante", async () => {
    const { onOSCriada } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Serviço já autorizado/ }));
    preencherServico();
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(mocks.autorizada).toHaveBeenCalledTimes(1));
    expect(mocks.comum).not.toHaveBeenCalled();
    const draft = mocks.autorizada.mock.calls[0]?.[1];
    expect(draft.itens).toEqual([expect.objectContaining({ descricao: "Troca de tela", valorUnitario: 300, custoUnitario: 92, garantiaDias: 90 })]);
    expect(onOSCriada).toHaveBeenCalledWith(osAprovada);
  });

  it("U05: falha mantém o formulário, erro recuperável e modal aberto", async () => {
    mocks.autorizada.mockRejectedValueOnce(new Error("Falha transitória"));
    const { onOSCriada, closeNovaOS } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Serviço já autorizado/ }));
    preencherServico();
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(screen.getByText("Falha transitória")).toBeTruthy());
    expect(screen.getByLabelText("Nome do serviço")).toHaveProperty("value", "Troca de tela");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onOSCriada).not.toHaveBeenCalled();
    expect(closeNovaOS).not.toHaveBeenCalled();
  });

  it("U06: diagnóstico sem preço usa caminho comum", async () => {
    const { onOSCriada } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Precisa de diagnóstico/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(mocks.comum).toHaveBeenCalledTimes(1));
    expect(mocks.autorizada).not.toHaveBeenCalled();
    expect(mocks.comum.mock.calls[0]?.[1].itens).toEqual([]);
    expect(onOSCriada).toHaveBeenCalledWith({ id: "os-aberta", status: "aberta" });
  });

  it("busy-lock: dois cliques da mesma interação criam uma única OS", async () => {
    let resolve!: (v: unknown) => void;
    mocks.autorizada.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { onOSCriada } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Serviço já autorizado/ }));
    preencherServico();
    const button = screen.getByRole("button", { name: "Criar Ordem de Serviço" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.autorizada).toHaveBeenCalledTimes(1);
    resolve({ os: osAprovada });
    await waitFor(() => expect(onOSCriada).toHaveBeenCalledWith(osAprovada));
  });
});
