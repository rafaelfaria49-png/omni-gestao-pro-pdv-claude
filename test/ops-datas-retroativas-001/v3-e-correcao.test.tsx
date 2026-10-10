// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — V3 montada (Nova OS, Atendimento rápido, Pós-venda)
// e "Corrigir datas" (V3 e V4): mesmo significado das datas nas duas versões.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";

const mocks = vi.hoisted(() => ({
  criarOSEnterpriseV3: vi.fn(),
  finalizarAtendimentoRapidoV3: vi.fn(),
  getCaixaSessaoAbertaV3: vi.fn(),
  registrarEntregaV3: vi.fn(),
  salvarAssinaturaRetiradaV3: vi.fn(),
  corrigirDatasOSV3: vi.fn(),
}));

vi.mock("@/api/clientes", () => ({ listClientes: vi.fn(async () => []) }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-qa" }) }));
vi.mock("@/lib/operacoes-v3/nova-os-actions", () => ({ criarOSEnterpriseV3: mocks.criarOSEnterpriseV3 }));
vi.mock("@/lib/operacoes-v3/atendimento-rapido-actions", () => ({ finalizarAtendimentoRapidoV3: mocks.finalizarAtendimentoRapidoV3 }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({ getCaixaSessaoAbertaV3: mocks.getCaixaSessaoAbertaV3 }));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: mocks.registrarEntregaV3,
  salvarAssinaturaRetiradaV3: mocks.salvarAssinaturaRetiradaV3,
}));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({ abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/datas-correcao-actions", () => ({ corrigirDatasOSV3: mocks.corrigirDatasOSV3 }));

import { NovaOSEnterpriseModalV3 } from "@/components/operacoes-v3/components/NovaOSEnterpriseModalV3";
import { AtendimentoRapidoV3 } from "@/components/operacoes-v3/pages/AtendimentoRapidoV3";
import { PosVendaV3 } from "@/components/operacoes-v3/components/PosVendaV3";
import { CorrigirDatasModalV3 } from "@/components/operacoes-v3/components/CorrigirDatasV3";
import { CorrigirDatasModalV4 } from "@/components/operacoes-v4-preview/parts/CorrigirDatasModalV4";
import { OperacoesV3Context, type OperacoesV3ContextValue } from "@/components/operacoes-v3/context/OperacoesV3Context";

const AGORA = new Date("2026-10-04T18:00:00.000Z"); // 04/10/2026 15:00 na loja
const TZ_ORIGINAL = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.criarOSEnterpriseV3.mockResolvedValue({ os: { id: "os-v3" } });
  mocks.getCaixaSessaoAbertaV3.mockResolvedValue({ aberta: true, sessaoId: "s1" });
  mocks.finalizarAtendimentoRapidoV3.mockResolvedValue({ osId: "os-ar", codigo: "OS-1", clienteNome: "Cliente Balcão", valorRecebido: 20, recibo: {} });
  mocks.registrarEntregaV3.mockResolvedValue({});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

function ctx(over: Partial<OperacoesV3ContextValue> = {}): OperacoesV3ContextValue {
  return {
    storeId: "loja-qa",
    activeScreen: "atendimento",
    selectedOsId: null,
    navigate: vi.fn(),
    openOS: vi.fn(),
    ordens: [],
    loading: false,
    primeiraCarga: false,
    error: null,
    reload: vi.fn(),
    mudarStatus: vi.fn(async () => true),
    abrirNovaOS: vi.fn(),
    notificar: vi.fn(),
    acaoEmConstrucao: vi.fn(),
    ...over,
  } as OperacoesV3ContextValue;
}

describe("Nova OS V3 — mesmo contrato de datas da V4 (D04/D20)", () => {
  it("navegador em outro fuso: a entrada informada segue a parede da loja; previsão só-dia sem horário inventado", async () => {
    process.env.TZ = "Asia/Tokyo";
    render(<NovaOSEnterpriseModalV3 open storeId="loja-qa" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Nome do cliente"), { target: { value: "Cliente V3" } });
    fireEvent.click(screen.getByRole("button", { name: /Equipamento/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: Apple, Samsung"), { target: { value: "Moto" } });
    fireEvent.change(screen.getByPlaceholderText("Ex.: iPhone 13 Pro"), { target: { value: "G" } });
    fireEvent.click(screen.getByRole("button", { name: /Problema/ }));
    fireEvent.change(screen.getByPlaceholderText("O que o cliente relatou?"), { target: { value: "Não liga" } });
    fireEvent.click(screen.getByRole("button", { name: /Recepção/ }));
    expect(screen.getByRole("heading", { name: "Datas e prazos" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Data de entrada do aparelho/), { target: { value: "2026-09-24" } });
    fireEvent.change(screen.getByLabelText(/Horário \(opcional\) — Data de entrada do aparelho/), { target: { value: "09:30" } });
    fireEvent.change(screen.getByLabelText(/^Previsão de entrega/), { target: { value: "2026-10-08" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar Ordem de Serviço/ }));
    await waitFor(() => expect(mocks.criarOSEnterpriseV3).toHaveBeenCalledTimes(1));
    expect(mocks.criarOSEnterpriseV3.mock.calls[0]![1].recepcao).toMatchObject({
      dataEntrada: "2026-09-24T12:30:00.000Z",
      dataEntradaMeta: { precisao: "data_hora", dia: "2026-09-24" },
      previsaoEntrega: "2026-10-08T15:00:00.000Z",
      previsaoEntregaMeta: { precisao: "dia", dia: "2026-10-08" },
    });
  });

  it("entrada no futuro: volta ao passo Recepção com o erro no campo; nada é enviado", async () => {
    render(<NovaOSEnterpriseModalV3 open storeId="loja-qa" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Recepção/ }));
    fireEvent.change(screen.getByLabelText(/^Data de entrada do aparelho/), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: /Resumo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Criar Ordem de Serviço/ }));
    expect(await screen.findByText(/não pode ficar no futuro/)).toBeTruthy();
    expect(screen.getByLabelText(/^Data de entrada do aparelho/)).toBeTruthy();
    expect(mocks.criarOSEnterpriseV3).not.toHaveBeenCalled();
  });
});

describe("Atendimento rápido V3 — mesma regra da V4 (D11)", () => {
  it("data anterior: explica o recebimento agora e envia a data do serviço com precisão", async () => {
    render(
      <OperacoesV3Context.Provider value={ctx()}>
        <AtendimentoRapidoV3 />
      </OperacoesV3Context.Provider>,
    );
    await waitFor(() => expect(mocks.getCaixaSessaoAbertaV3).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("Selecione acima ou digite o serviço"), { target: { value: "Película" } });
    fireEvent.change(screen.getAllByPlaceholderText("0,00")[0]!, { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/^Data do atendimento/), { target: { value: "2026-09-29" } });
    expect(screen.getByText(/A confirmação registra o recebimento agora, no caixa atual\./)).toBeTruthy();
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): sem forma pré-selecionada, finalizar
    // fica bloqueado até o operador escolher; o restante do cenário segue idêntico.
    expect((screen.getByRole("button", { name: /Finalizar serviço/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Forma de pagamento/), { target: { value: "dinheiro" } });
    fireEvent.click(screen.getByRole("button", { name: /Finalizar serviço/ }));
    await waitFor(() => expect(mocks.finalizarAtendimentoRapidoV3).toHaveBeenCalled());
    expect(mocks.finalizarAtendimentoRapidoV3.mock.calls[0]![1]).toMatchObject({
      dataEntrada: "2026-09-29T15:00:00.000Z",
      dataEntradaMeta: { precisao: "dia", dia: "2026-09-29" },
      dataConclusao: "2026-09-29T15:00:00.000Z",
    });
  });
});

function osPronta(): OrdemServico {
  return {
    id: "os-p",
    codigo: "OS-P",
    status: "pronta",
    operacaoStatusV3: "pronta",
    cliente: { nome: "Cliente P" },
    equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "G" },
    aberturaV3: { recepcao: { dataEntrada: "2026-09-25T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-09-25" } } },
    timeline: [],
  } as unknown as OrdemServico;
}

describe("Pós-venda V3 — entrega retroativa pelo caminho canônico (D13)", () => {
  it("envia a data efetiva; antes da entrada é recusada sem chamar o servidor", async () => {
    render(
      <PosVendaV3 os={osPronta()} storeId="loja-qa" ordens={[]} onChanged={vi.fn()} notificar={vi.fn()} onImprimirEntrega={vi.fn()} onAbrirRetornos={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar entrega/ }));
    expect(await screen.findByText(/não pode ser anterior à entrada do aparelho/)).toBeTruthy();
    expect(mocks.registrarEntregaV3).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-29" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar entrega/ }));
    await waitFor(() => expect(mocks.registrarEntregaV3).toHaveBeenCalled());
    expect(mocks.registrarEntregaV3.mock.calls[0]![2]).toMatchObject({
      dataEntrega: { iso: "2026-09-29T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-09-29" } },
    });
  });
});

// ---------------------------------------------------------------------------
// Corrigir datas (V3 e V4)
// ---------------------------------------------------------------------------

const ENTREGA_ISO = "2026-09-29T19:00:00.000Z"; // 29/09 16:00 na loja
function osEntregue(): OrdemServico {
  return {
    id: "os-e",
    codigo: "OS-E",
    status: "entregue",
    operacaoStatusV3: "entregue",
    criadoEm: "2026-10-04T17:00:00.000Z",
    cliente: { nome: "Cliente E" },
    equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "G" },
    aberturaV3: {
      versao: 1,
      recepcao: { dataEntrada: "2026-09-25T13:00:00.000Z", dataEntradaMeta: { precisao: "data_hora", dia: "2026-09-25" } },
      garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
    },
    entregueEm: ENTREGA_ISO,
    retirada: { confirmado: true, retiradoEm: ENTREGA_ISO },
    entregaV3: { entregueEm: ENTREGA_ISO, entregueEmMeta: { precisao: "data_hora", dia: "2026-09-29" }, registradoEm: "2026-10-04T17:30:00.000Z" },
    timeline: [],
  } as unknown as OrdemServico;
}

describe("Corrigir datas — impacto que só o servidor enxerga (R3)", () => {
  it("o servidor pede confirmação de garantia que a prévia não via: a janela mostra o impacto e a 2ª tentativa vai confirmada", async () => {
    // Sem garantia no payload: a prévia local não vê impacto; o servidor vê uma linha real ativa.
    const os = osEntregue();
    (os as unknown as { aberturaV3: Record<string, unknown> }).aberturaV3 = {
      versao: 1,
      recepcao: { dataEntrada: "2026-09-25T13:00:00.000Z", dataEntradaMeta: { precisao: "data_hora", dia: "2026-09-25" } },
    };
    const impacto = {
      temImpacto: true,
      payloadDeslocado: false,
      encerradasIntocadas: 0,
      linhas: [{ id: "g-1", dataInicioAntes: ENTREGA_ISO, dataFimAntes: "2026-12-28T19:00:00.000Z", dataInicio: "2026-09-27T19:00:00.000Z", dataFim: "2026-12-26T19:00:00.000Z" }],
      assinatura: "assinatura-linha-real",
    };
    mocks.corrigirDatasOSV3
      .mockResolvedValueOnce({ ok: false, tipo: "confirmacao", campo: "dataEntrega", garantia: impacto, mensagem: "Confira o impacto na garantia e confirme antes de salvar." })
      .mockResolvedValueOnce({ ok: true, diff: [], garantia: impacto, os: {} });
    const onSalvo = vi.fn();
    render(<CorrigirDatasModalV3 open os={os} storeId="loja-qa" onClose={vi.fn()} onSalvo={onSalvo} />);
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-27" } });
    expect(screen.queryByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Entregue na sexta, registrado hoje." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    const caixa = await screen.findByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ });
    expect(screen.getByText(/A garantia muda junto com a entrega/)).toBeTruthy();
    fireEvent.click(caixa);
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).toHaveBeenCalledTimes(2));
    expect(mocks.corrigirDatasOSV3.mock.calls[1]![2]).toMatchObject({ confirmarImpactoGarantia: true, assinaturaImpactoGarantia: "assinatura-linha-real" });
    expect(onSalvo).toHaveBeenCalled();
  });
});

describe("Corrigir datas — V3", () => {
  it("D14/D15: mostra antes, exige motivo e confirmação da garantia; envia só o campo alterado com a baseline vista", async () => {
    const onSalvo = vi.fn();
    mocks.corrigirDatasOSV3.mockResolvedValue({ ok: true, diff: [], garantia: { temImpacto: true, linhas: [], encerradasIntocadas: 0, payloadDeslocado: false }, os: {} });
    render(<CorrigirDatasModalV3 open os={osEntregue()} storeId="loja-qa" onClose={vi.fn()} onSalvo={onSalvo} />);
    expect(screen.getAllByText(/Valor atual: 29\/09\/2026 16:00/).length).toBe(1);
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-27" } });
    expect(await screen.findByText(/A garantia muda junto com a entrega/)).toBeTruthy();
    expect(screen.getByText(/Início: 29\/09\/2026 → 27\/09\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText(/Informe o motivo da correção/)).toBeTruthy();
    expect(mocks.corrigirDatasOSV3).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Entregue na sexta, registrado hoje." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText(/Confira o impacto na garantia e confirme/)).toBeTruthy();
    expect(mocks.corrigirDatasOSV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).toHaveBeenCalledTimes(1));
    const [sid, osId, input] = mocks.corrigirDatasOSV3.mock.calls[0]!;
    expect(sid).toBe("loja-qa");
    expect(osId).toBe("os-e");
    // Horário INFORMADO (16:00) é preservado ao trocar só o dia — visível e removível ("Sem horário").
    expect(input).toEqual({
      alteracoes: { dataEntrega: { iso: "2026-09-27T19:00:00.000Z", meta: { precisao: "data_hora", dia: "2026-09-27" } } },
      esperados: { dataEntrega: ENTREGA_ISO },
      motivo: "Entregue na sexta, registrado hoje.",
      confirmarImpactoGarantia: true,
      // Assinatura do impacto exibido (prévia): o servidor só aplica esse impacto.
      assinaturaImpactoGarantia: expect.stringContaining("2026-09-27T19:00:00.000Z"),
    });
    expect(onSalvo).toHaveBeenCalled();
  });

  it("R5: servidor devolve impacto diferente do confirmado → caixa desmarcada; reenvio leva a assinatura do servidor", async () => {
    const os = osEntregue();
    const impactoServidor = {
      temImpacto: true,
      payloadDeslocado: false,
      encerradasIntocadas: 0,
      linhas: [{ id: "g-1", dataInicioAntes: ENTREGA_ISO, dataFimAntes: "2026-12-28T19:00:00.000Z", dataInicio: "2026-09-27T19:00:00.000Z", dataFim: "2026-12-26T19:00:00.000Z" }],
      assinatura: "assinatura-do-servidor",
    };
    mocks.corrigirDatasOSV3
      .mockResolvedValueOnce({ ok: false, tipo: "confirmacao", campo: "dataEntrega", garantia: impactoServidor, mensagem: "O impacto na garantia mudou desde a sua confirmação. Confira o impacto atualizado e confirme de novo." })
      .mockResolvedValueOnce({ ok: true, diff: [], garantia: impactoServidor, os: {} });
    render(<CorrigirDatasModalV3 open os={os} storeId="loja-qa" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-27" } });
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Entregue na sexta, registrado hoje." } });
    const caixa = (await screen.findByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ })) as HTMLInputElement;
    fireEvent.click(caixa);
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).toHaveBeenCalledTimes(1));
    const primeira = mocks.corrigirDatasOSV3.mock.calls[0]![2] as { assinaturaImpactoGarantia?: string };
    expect(primeira.assinaturaImpactoGarantia).toBeTruthy();
    expect(primeira.assinaturaImpactoGarantia).not.toBe("assinatura-do-servidor");
    expect(await screen.findByText(/mudou desde a sua confirmação/)).toBeTruthy();
    const caixaDepois = screen.getByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ }) as HTMLInputElement;
    expect(caixaDepois.checked).toBe(false);
    fireEvent.click(caixaDepois);
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).toHaveBeenCalledTimes(2));
    expect(mocks.corrigirDatasOSV3.mock.calls[1]![2]).toMatchObject({ confirmarImpactoGarantia: true, assinaturaImpactoGarantia: "assinatura-do-servidor" });
  });

  it("entrega LEGADA (sem metadata): o horário era o do registro e é descartado ao trocar o dia", async () => {
    mocks.corrigirDatasOSV3.mockResolvedValue({ ok: true, diff: [], garantia: { temImpacto: false, linhas: [], encerradasIntocadas: 0, payloadDeslocado: false }, os: {} });
    const legado = { ...osEntregue(), entregaV3: { entregueEm: ENTREGA_ISO, registradoEm: ENTREGA_ISO } } as unknown as OrdemServico;
    render(<CorrigirDatasModalV3 open os={legado} storeId="loja-qa" onClose={vi.fn()} onSalvo={vi.fn()} />);
    expect((screen.getByLabelText(/Horário \(opcional\) — Data da entrega/) as HTMLInputElement).value).toBe("16:00");
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-27" } });
    expect((screen.getByLabelText(/Horário \(opcional\) — Data da entrega/) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Registro legado corrigido" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.corrigirDatasOSV3.mock.calls[0]![2].alteracoes).toEqual({
      dataEntrega: { iso: "2026-09-27T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-09-27" } },
    });
  });

  it("D17: conflito do servidor aparece no formulário, que continua aberto com os dados", async () => {
    mocks.corrigirDatasOSV3.mockResolvedValue({ ok: false, tipo: "conflito", campo: "dataEntrada", mensagem: "Data de entrada do aparelho mudou desde que você abriu a correção (agora: 26/09/2026). Reabra a correção e revise." });
    const onSalvo = vi.fn();
    render(<CorrigirDatasModalV3 open os={osEntregue()} storeId="loja-qa" onClose={vi.fn()} onSalvo={onSalvo} />);
    fireEvent.change(screen.getByLabelText(/^Data de entrada do aparelho/), { target: { value: "2026-09-24" } });
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Ajuste da entrada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect((await screen.findAllByText(/mudou desde que você abriu a correção/)).length).toBeGreaterThan(0);
    expect(onSalvo).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^Data de entrada do aparelho/) as HTMLInputElement).value).toBe("2026-09-24");
  });
});

describe("Corrigir datas — V4 (mesmo estado, janela da V4)", () => {
  it("entrega posterior à entrada; erro de regra aparece ao vivo junto ao campo", async () => {
    render(<CorrigirDatasModalV4 open os={osEntregue()} onClose={vi.fn()} onSalvo={vi.fn()} />);
    expect(screen.getByText(/Corrige só as datas\. Nada é entregue, cobrado ou enviado de novo\./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-09-20" } });
    expect(await screen.findByText(/Data da entrega não pode ser anterior à data de entrada do aparelho/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar correção" }));
    await waitFor(() => expect(mocks.corrigirDatasOSV3).not.toHaveBeenCalled());
  });
});
