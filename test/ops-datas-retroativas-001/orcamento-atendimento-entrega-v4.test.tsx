// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — Orçamento, Atendimento rápido e Entrega da V4 montados.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";

const mocks = vi.hoisted(() => ({
  criarOrcamentoRapidoV3: vi.fn(),
  marcarOrcamentoPreOsV3: vi.fn(),
  atualizarStatusComercialV3: vi.fn(),
  enviarOrcamentoPorCanalV3: vi.fn(),
  finalizarAtendimentoRapidoV3: vi.fn(),
  getCaixaSessaoAbertaV3: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "qa", name: "Operador QA" } } }) }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-qa" }) }));
vi.mock("@/lib/operacoes-v3/orcamento-rapido-actions", () => ({ criarOrcamentoRapidoV3: mocks.criarOrcamentoRapidoV3 }));
vi.mock("@/lib/operacoes-v3/comercial-pre-os-actions", () => ({
  marcarOrcamentoPreOsV3: mocks.marcarOrcamentoPreOsV3,
  atualizarStatusComercialV3: mocks.atualizarStatusComercialV3,
  converterOrcamentoEmOSV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ enviarOrcamentoPorCanalV3: mocks.enviarOrcamentoPorCanalV3 }));
vi.mock("@/lib/operacoes-v3/atendimento-rapido-actions", () => ({ finalizarAtendimentoRapidoV3: mocks.finalizarAtendimentoRapidoV3 }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({ getCaixaSessaoAbertaV3: mocks.getCaixaSessaoAbertaV3 }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ClienteAtendimentoSection", () => ({ ClienteAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/AparelhoAtendimentoSection", () => ({ AparelhoAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ServicoCatalogLookup", () => ({ ServicoCatalogLookup: () => null }));

import { OrcamentoRapidoModal } from "@/components/operacoes-v4-preview/parts/OrcamentoRapidoModal";
import { AtendimentoRapidoModal } from "@/components/operacoes-v4-preview/parts/AtendimentoRapidoModal";
import { EntregaStage } from "@/components/operacoes-v4-preview/parts/stages/EntregaStage";
import { orcamentoRapidoFormVazioV4, type OrcamentoRapidoFormV4 } from "@/lib/operacoes-v4/orcamento-rapido-form";
import { EMPTY_ENTREGA_VIEW } from "@/components/operacoes-v4-preview/os-adapter";

const AGORA = new Date("2026-10-04T18:00:00.000Z"); // 04/10/2026 15:00 na loja

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.clearAllMocks();
  mocks.criarOrcamentoRapidoV3.mockResolvedValue({ osId: "os-orc", codigo: "OS-1", clienteNome: "Ana" });
  mocks.marcarOrcamentoPreOsV3.mockResolvedValue({});
  mocks.getCaixaSessaoAbertaV3.mockResolvedValue({ aberta: true, sessaoId: "sessao-1" });
  mocks.finalizarAtendimentoRapidoV3.mockResolvedValue({ osId: "os-ar" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

function formOrcamento(): OrcamentoRapidoFormV4 {
  const f = orcamentoRapidoFormVazioV4(AGORA);
  return {
    ...f,
    clienteModo: "novo",
    clienteNovoNome: "Ana",
    clienteNovoTelefone: "11999990000",
    aparelhoMarca: "Moto",
    aparelhoModelo: "G",
    defeitoRelatado: "Tela",
    grupoRotulo: "ESCOLHA A TELA",
    variantes: f.variantes.map((v, i) => ({ ...v, rotulo: i === 0 ? "Original" : "Paralela", valor: i === 0 ? 400 : 250 })),
  };
}

function montarOrcamento() {
  const onOrcamentoRapidoCriado = vi.fn();
  render(
    <OrcamentoRapidoModal
      v={{ orcamentoRapidoOpen: true, orcamentoRapidoInitialValues: formOrcamento(), onOrcamentoRapidoCriado, closeOrcamentoRapido: vi.fn() } as unknown as V4Vals}
    />,
  );
  return { onOrcamentoRapidoCriado };
}

describe("Orçamento V4 — data da proposta não é entrada física (D08/D09/D10)", () => {
  it("D08: padrão hoje, validade +7, sem entrada; 'Criar sem enviar' não envia e não fabrica entrada", async () => {
    montarOrcamento();
    expect((screen.getByLabelText(/^Data do orçamento/) as HTMLInputElement).value).toBe("2026-10-04");
    expect((screen.getByLabelText(/^Válido até/) as HTMLInputElement).value).toBe("2026-10-11");
    expect(screen.queryByLabelText(/^Data de entrada do aparelho/)).toBeNull();
    expect(screen.getByLabelText("Tempo estimado após aprovação")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar sem enviar" }));
    await waitFor(() => expect(mocks.criarOrcamentoRapidoV3).toHaveBeenCalledTimes(1));
    const input = mocks.criarOrcamentoRapidoV3.mock.calls[0]![1];
    expect(input.datas).toEqual({
      dataProposta: { iso: "2026-10-04T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-10-04" } },
      validoAteDia: "2026-10-11",
      entradaAparelho: null,
    });
    expect(mocks.marcarOrcamentoPreOsV3.mock.calls[0]![2]).toMatchObject({ validadeDias: 7, statusComercial: "rascunho" });
    expect(mocks.enviarOrcamentoPorCanalV3).not.toHaveBeenCalled();
  });

  it("D10: proposta retroativa — validade acompanha a data; vencida é avisada e fica vencida", async () => {
    montarOrcamento();
    fireEvent.change(screen.getByLabelText(/^Data do orçamento/), { target: { value: "2026-09-10" } });
    expect((screen.getByLabelText(/^Válido até/) as HTMLInputElement).value).toBe("2026-09-17");
    expect(screen.getByText(/Proposta já vencida: fica registrada assim, sem prorrogação\./)).toBeTruthy();
    expect(screen.getByText(/Proposta de 24 dias atrás/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar sem enviar" }));
    await waitFor(() => expect(mocks.criarOrcamentoRapidoV3).toHaveBeenCalled());
    expect(mocks.criarOrcamentoRapidoV3.mock.calls[0]![1].datas).toMatchObject({ validoAteDia: "2026-09-17", entradaAparelho: null });
  });

  it("D09: 'Aparelho já está na loja' mostra a entrada real e a envia junto (sem aprovar/converter)", async () => {
    montarOrcamento();
    fireEvent.click(screen.getByRole("checkbox", { name: /Aparelho já está na loja/ }));
    fireEvent.change(screen.getByLabelText(/^Data de entrada do aparelho/), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByLabelText(/Horário \(opcional\) — Data de entrada do aparelho/), { target: { value: "10:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar sem enviar" }));
    await waitFor(() => expect(mocks.criarOrcamentoRapidoV3).toHaveBeenCalled());
    expect(mocks.criarOrcamentoRapidoV3.mock.calls[0]![1].datas.entradaAparelho).toEqual({
      iso: "2026-10-02T13:15:00.000Z",
      meta: { precisao: "data_hora", dia: "2026-10-02" },
    });
    expect(mocks.marcarOrcamentoPreOsV3.mock.calls[0]![2].statusComercial).toBe("rascunho");
  });

  it("validade antes da proposta → erro no campo, nada é criado", async () => {
    montarOrcamento();
    fireEvent.change(screen.getByLabelText(/^Válido até/), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar sem enviar" }));
    expect(await screen.findByText(/A validade não pode ser anterior à data do orçamento/)).toBeTruthy();
    expect(mocks.criarOrcamentoRapidoV3).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Atendimento rápido
// ---------------------------------------------------------------------------

async function montarAtendimento() {
  const onAtendimentoRapidoConcluido = vi.fn();
  render(<AtendimentoRapidoModal v={{ atendimentoRapidoOpen: true, onAtendimentoRapidoConcluido, closeAtendimentoRapido: vi.fn() } as unknown as V4Vals} />);
  await screen.findByText("Caixa aberto");
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "Película" } });
  fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "20" } });
  return { onAtendimentoRapidoConcluido };
}

describe("Atendimento rápido V4 — data do serviço, recebimento agora (D11)", () => {
  it("padrão hoje: sem aviso retroativo", async () => {
    await montarAtendimento();
    expect((screen.getByLabelText(/^Data do atendimento/) as HTMLInputElement).value).toBe("2026-10-04");
    expect(screen.queryByText(/registra o recebimento agora/)).toBeNull();
  });

  it("data anterior: explica que o recebimento é agora, no caixa atual; envia a data do serviço", async () => {
    await montarAtendimento();
    fireEvent.change(screen.getByLabelText(/^Data do atendimento/), { target: { value: "2026-09-29" } });
    expect(screen.getByText("A data informa quando o serviço aconteceu. A confirmação registra o recebimento agora, no caixa atual.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e emitir recibo" }));
    await waitFor(() => expect(mocks.finalizarAtendimentoRapidoV3).toHaveBeenCalled());
    expect(String((window.confirm as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0])).toMatch(/recebimento é registrado agora, no caixa atual/);
    const input = mocks.finalizarAtendimentoRapidoV3.mock.calls[0]![1];
    expect(input).toMatchObject({
      dataEntrada: "2026-09-29T15:00:00.000Z",
      dataEntradaMeta: { precisao: "dia", dia: "2026-09-29" },
      dataConclusao: "2026-09-29T15:00:00.000Z",
      dataConclusaoMeta: { precisao: "dia", dia: "2026-09-29" },
    });
  });

  it("detalhar entrada e saída: saída antes da entrada é recusada antes de qualquer efeito", async () => {
    await montarAtendimento();
    fireEvent.click(screen.getByRole("button", { name: "Detalhar entrada e saída" }));
    fireEvent.change(screen.getByLabelText(/^Entrada/), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText(/Horário \(opcional\) — Entrada/), { target: { value: "14:00" } });
    fireEvent.change(screen.getByLabelText(/^Saída/), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText(/Horário \(opcional\) — Saída/), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e emitir recibo" }));
    expect(await screen.findByText(/não pode ser anterior à entrada/)).toBeTruthy();
    expect(mocks.finalizarAtendimentoRapidoV3).not.toHaveBeenCalled();
  });

  it("serviço no futuro → erro e nenhuma chamada", async () => {
    await montarAtendimento();
    fireEvent.change(screen.getByLabelText(/^Data do atendimento/), { target: { value: "2026-10-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e emitir recibo" }));
    expect(await screen.findByText(/não pode ficar no futuro/)).toBeTruthy();
    expect(mocks.finalizarAtendimentoRapidoV3).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Entrega (card de confirmação)
// ---------------------------------------------------------------------------

function vEntrega(over: Record<string, unknown> = {}) {
  const confirmarEntrega = vi.fn(async () => true);
  const v = {
    realOS: {
      id: "os-e",
      aberturaV3: { recepcao: { dataEntrada: "2026-09-25T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-09-25" } } },
    },
    entregaAcoes: { podeConfirmar: true, bloqueadaPorSaldo: false, semCobrancaLancada: false, leituraFinanceiraBloqueada: false, autorizadaAPrazo: false, autorizadaSemCobranca: false },
    entrega: { ...EMPTY_ENTREGA_VIEW, fotosSaida: [], garantia: { ...EMPTY_ENTREGA_VIEW.garantia } },
    confirmarEntrega,
    openCorrigirDatas: vi.fn(),
    openDocPrint: vi.fn(),
    goOrcamento: vi.fn(),
    openReceberPagamento: vi.fn(),
    adicionarFotoSaida: vi.fn(),
    removerFotoSaida: vi.fn(),
    salvarGarantia: vi.fn(),
    ...over,
  } as unknown as V4Vals;
  return { v, confirmarEntrega };
}

describe("Entrega V4 — data efetiva pelo caminho canônico (D13)", () => {
  it("padrão intacto (hoje, agora): confirma sem data → servidor usa o horário exato", async () => {
    const { v, confirmarEntrega } = vEntrega();
    render(<EntregaStage v={v} />);
    expect((screen.getByLabelText(/^Data da entrega/) as HTMLInputElement).value).toBe("2026-10-04");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar entrega real" }));
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalledWith(undefined, undefined));
  });

  it("entrega retroativa: aviso + data efetiva enviada à action canônica", async () => {
    const { v, confirmarEntrega } = vEntrega();
    render(<EntregaStage v={v} />);
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-29" } });
    expect(screen.getByText(/Entrega com data anterior/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar entrega real" }));
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalled());
    expect(confirmarEntrega).toHaveBeenCalledWith(undefined, { iso: "2026-09-29T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-09-29" } });
  });

  it("entrega antes da entrada → erro no campo e nenhuma confirmação", async () => {
    const { v, confirmarEntrega } = vEntrega();
    render(<EntregaStage v={v} />);
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar entrega real" }));
    expect(await screen.findByText(/Data da entrega não pode ser anterior à entrada do aparelho/)).toBeTruthy();
    expect(confirmarEntrega).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("bloqueio por saldo continua valendo: sem campo de data, sem confirmação", () => {
    const { v } = vEntrega({ entregaAcoes: { podeConfirmar: false, bloqueadaPorSaldo: true, saldoPendente: 50 } });
    render(<EntregaStage v={v} />);
    expect(screen.queryByLabelText(/^Data da entrega/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar entrega real" })).toBeNull();
  });
});
