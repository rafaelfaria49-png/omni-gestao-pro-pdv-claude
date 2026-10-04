// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — Nova OS V4 montada: bloco "Datas e prazos".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";

const mocks = vi.hoisted(() => ({ autorizada: vi.fn(), comum: vi.fn() }));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "qa", name: "Operador QA" } } }) }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-qa" }) }));
vi.mock("@/lib/operacoes-v3/nova-os-actions", () => ({ criarOSServicoAutorizadoV3: mocks.autorizada, criarOSEnterpriseV3: mocks.comum }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ClienteAtendimentoSection", () => ({
  ClienteAtendimentoSection: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ modo: "novo", existente: null, novo: { nome: "Cliente QA", telefone: "", documento: "", email: "" } })}>
      Preencher cliente QA
    </button>
  ),
}));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/AparelhoAtendimentoSection", () => ({
  AparelhoAtendimentoSection: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ tipo: "celular", marca: "Moto", modelo: "G", imei: "", cor: "", defeitoRelatado: "Não liga" })}>
      Preencher aparelho QA
    </button>
  ),
}));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ServicoCatalogLookup", () => ({ ServicoCatalogLookup: () => null }));

import { NovaOSModal } from "@/components/operacoes-v4-preview/parts/NovaOSModal";

// 04/10/2026 15:00 na loja (America/Sao_Paulo).
const AGORA = new Date("2026-10-04T18:00:00.000Z");

function montar() {
  const onOSCriada = vi.fn();
  render(<NovaOSModal v={{ novaOSOpen: true, onOSCriada, closeNovaOS: vi.fn() } as unknown as V4Vals} />);
  fireEvent.click(screen.getByRole("button", { name: "Preencher cliente QA" }));
  fireEvent.click(screen.getByRole("button", { name: "Preencher aparelho QA" }));
  // Diagnóstico: caminho comum, sem serviço obrigatório.
  fireEvent.click(screen.getByRole("button", { name: /Precisa de diagnóstico/ }));
  return { onOSCriada };
}

const entradaDia = () => screen.getByLabelText(/^Data de entrada do aparelho/) as HTMLInputElement;
const entradaHora = () => screen.getByLabelText(/Horário \(opcional\) — Data de entrada do aparelho/) as HTMLInputElement;
const previsaoDia = () => screen.getByLabelText(/^Previsão de entrega/) as HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.clearAllMocks();
  mocks.comum.mockResolvedValue({ os: { id: "os-1", status: "aberta" } });
  mocks.autorizada.mockResolvedValue({ os: { id: "os-2", status: "aprovado" } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Nova OS V4 — Datas e prazos", () => {
  it("bloco visível logo após 'Tipo de entrada' e antes do Cliente; rótulos claros; entrada começa em hoje, agora", () => {
    montar();
    const tipo = screen.getByText("Tipo de entrada");
    const datas = screen.getByRole("heading", { name: "Datas e prazos" });
    const cliente = screen.getByRole("button", { name: /^Cliente/ });
    expect(tipo.compareDocumentPosition(datas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(datas.compareDocumentPosition(cliente) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entradaDia().value).toBe("2026-10-04");
    expect(entradaHora().value).toBe("15:00");
    expect(previsaoDia().value).toBe("");
    expect(screen.getByText(/Quando o aparelho realmente entrou na loja/)).toBeTruthy();
    expect(screen.queryByText("Previsão / SLA")).toBeNull();
  });

  it("D01/D03: entrada de ontem sem horário → rascunho com âncora técnica + precisão 'dia'; cadastro fica com o servidor", async () => {
    const { onOSCriada } = montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-10-03" } });
    // Trocar o dia descarta o horário automático da abertura.
    expect(entradaHora().value).toBe("");
    expect(screen.getByText(/Entrada há 1 dia\. O cadastro da OS continua com a data de hoje\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(mocks.comum).toHaveBeenCalledTimes(1));
    const draft = mocks.comum.mock.calls[0]![1];
    expect(draft.recepcao.dataEntrada).toBe("2026-10-03T15:00:00.000Z");
    expect(draft.recepcao.dataEntradaMeta).toEqual({ precisao: "dia", dia: "2026-10-03" });
    expect(draft.recepcao.previsaoEntrega).toBeUndefined();
    expect(onOSCriada).toHaveBeenCalled();
  });

  it("D04: data com horário segue a parede da loja", async () => {
    montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-09-24" } });
    fireEvent.change(entradaHora(), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(mocks.comum).toHaveBeenCalled());
    expect(mocks.comum.mock.calls[0]![1].recepcao).toMatchObject({
      dataEntrada: "2026-09-24T12:30:00.000Z",
      dataEntradaMeta: { precisao: "data_hora", dia: "2026-09-24" },
    });
  });

  it("D05: entrada no futuro → erro junto ao campo, foco no campo e NENHUMA chamada ao servidor", async () => {
    montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-10-06" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    const alerta = await screen.findByText(/Data de entrada do aparelho não pode ficar no futuro/);
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(entradaDia().getAttribute("aria-invalid")).toBe("true");
    expect(entradaDia().getAttribute("aria-describedby")).toContain("novaos-entrada-erro");
    await waitFor(() => expect(document.activeElement).toBe(entradaDia()));
    expect(mocks.comum).not.toHaveBeenCalled();
    // Formulário continua aberto com os dados digitados.
    expect(entradaDia().value).toBe("2026-10-06");
  });

  it("previsão antes da entrada → erro no campo da previsão, sem chamada", async () => {
    montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-10-02" } });
    fireEvent.change(previsaoDia(), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    expect(await screen.findByText(/previsão de entrega não pode ser anterior à entrada do aparelho/i)).toBeTruthy();
    expect(mocks.comum).not.toHaveBeenCalled();
  });

  it("D07: previsão vencida (registro retroativo) exige confirmação explícita e não é alterada", async () => {
    montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-09-24" } });
    fireEvent.change(previsaoDia(), { target: { value: "2026-09-28" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    expect(await screen.findByText(/A previsão de entrega está no passado/)).toBeTruthy();
    expect(mocks.comum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Essa previsão já passou/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(mocks.comum).toHaveBeenCalled());
    expect(mocks.comum.mock.calls[0]![1].recepcao).toMatchObject({
      previsaoEntrega: "2026-09-28T15:00:00.000Z",
      previsaoEntregaMeta: { precisao: "dia", dia: "2026-09-28" },
    });
  });

  it("D19: trocar o tipo de entrada preserva as datas; erro do servidor mantém o formulário", async () => {
    mocks.comum.mockRejectedValueOnce(new Error("Falha simulada do servidor."));
    montar();
    fireEvent.change(entradaDia(), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: /Serviço já autorizado/ }));
    fireEvent.click(screen.getByRole("button", { name: /Precisa de diagnóstico/ }));
    expect(entradaDia().value).toBe("2026-09-30");
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    expect(await screen.findByText("Falha simulada do servidor.")).toBeTruthy();
    expect(entradaDia().value).toBe("2026-09-30");
  });

  it("editor de serviço usa 'Tempo estimado do serviço' (não vira previsão de entrega)", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Serviço já autorizado/ }));
    expect(screen.getByLabelText("Tempo estimado do serviço")).toBeTruthy();
    expect(screen.queryByText(/^Prazo$/)).toBeNull();
  });
});
