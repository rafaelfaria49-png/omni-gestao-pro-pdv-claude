import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";

const mocks = vi.hoisted(() => ({
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => mocks);

import { PdvServicoV3 } from "@/components/operacoes-v3/pages/PdvServicoV3";
import { OperacoesV3Context, type OperacoesV3ContextValue } from "@/components/operacoes-v3/context/OperacoesV3Context";

const VENC = "2099-12-31";
/** Intl pt-BR separa "R$" do número com espaço não separável (U+00A0). */
const txt = (s: string | null | undefined) => (s ?? "").replace(/\u00a0/g, " ");
const desabilitado = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

function os(id: string, codigo: string): OrdemServico {
  return {
    id,
    codigo,
    status: "pronta",
    operacaoStatusV3: "pronta",
    cliente: { nome: `Cliente ${codigo}` },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
    orcamento: {
      id: `orc-${id}`,
      status: "aprovado",
      pecas: [],
      servicos: [
        { id: "s1", descricao: "Troca de tela", valor: 300 },
        { id: "s2", descricao: "Limpeza interna", valor: 100 },
      ],
      desconto: 0,
      total: 400,
      criadoEm: "2026-10-01T12:00:00.000Z",
    },
  } as unknown as OrdemServico;
}

const ctxBase = (ordens: OrdemServico[], selectedOsId: string): OperacoesV3ContextValue => ({
  storeId: "loja-qa",
  activeScreen: "pdv-servico",
  selectedOsId,
  navigate: vi.fn(),
  openOS: vi.fn(),
  ordens,
  loading: false,
  primeiraCarga: false,
  error: null,
  reload: vi.fn(),
  mudarStatus: vi.fn(async () => true),
  abrirNovaOS: vi.fn(),
  notificar: vi.fn(),
  acaoEmConstrucao: vi.fn(),
});

function leitura(over: Record<string, unknown> = {}) {
  return { total: 400, recebido: 0, saldo: 400, status: "aberto", sessao: { aberta: true, sessaoId: "sessao-1", operador: "Caixa QA" }, aPrazo: null, ...over };
}

function okMisto(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    jaRegistrado: false,
    operacaoId: "op-x",
    tituloId: "tit-1",
    pagamento: { total: 400, recebido: 350, saldo: 50, status: "parcial" },
    aPrazo: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true, autorizadoPor: "Operador QA" },
    valorRecebidoAgora: 350,
    valorAPrazo: 50,
    recibo: {
      numeroOS: "OS-A",
      cliente: "Cliente OS-A",
      equipamento: "Samsung A54",
      formas: [{ forma: "debito", label: "Débito", valor: 350 }],
      intencaoLabel: "Pagamento parcial — saldo a prazo",
      valorPago: 350,
      totalOS: 400,
      recebidoAcumulado: 350,
      saldoRestante: 50,
      statusPagamento: "parcial",
      statusLabel: "Parcial",
      dataHora: "2026-10-03T15:00:00.000Z",
      operador: "Operador QA",
      tipoComprovante: "recebimento_misto",
      situacaoLabel: "Pagamento parcial — saldo a prazo",
      aPrazo: { valor: 50, vencimento: VENC },
    },
    ...over,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function montar(ordens = [os("os-a", "OS-A")], selecionada = "os-a") {
  const ctx = ctxBase(ordens, selecionada);
  const utils = render(
    <OperacoesV3Context.Provider value={ctx}>
      <PdvServicoV3 />
    </OperacoesV3Context.Provider>,
  );
  return { ...utils, ctx };
}

async function prepararDebito350MaisAPrazo() {
  await screen.findByText(/Saldo a receber/);
  await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
  fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
  fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "debito" } });
  fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "350" } });
  fireEvent.click(screen.getByRole("button", { name: /A prazo \/ crediário/ }));
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.lerPagamentoOSV3.mockImplementation(async () => leitura());
});
afterEach(() => cleanup());

describe("PDV de Serviço V3 — recebimento misto (montado)", () => {
  it("débito 350 + 'A prazo / crediário' sugere 50, exige vencimento e mostra o resumo e o botão do caso", async () => {
    montar();
    await prepararDebito350MaisAPrazo();

    expect((screen.getByLabelText("Valor da linha 2") as HTMLInputElement).value).toBe("50,00");
    expect((screen.getByLabelText("Forma da linha 2") as HTMLSelectElement).value).toBe("a_prazo");
    expect(screen.getByTestId("bloco-a-prazo").textContent).toMatch(/valor NÃO recebido agora/);

    const botao = () => screen.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ });
    expect(desabilitado(botao())).toBe(true);
    expect(txt(screen.getByTestId("resumo-misto").textContent)).toMatch(/Informe o vencimento/);

    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    expect(desabilitado(botao())).toBe(false);
    const resumo = txt(screen.getByTestId("resumo-misto").textContent);
    expect(resumo).toContain("Total da OSR$ 400,00");
    expect(resumo).toContain("Recebido anteriormenteR$ 0,00");
    expect(resumo).toContain("Receber agoraR$ 350,00 — Débito");
    expect(resumo).toContain("Deixar a prazoR$ 50,00");
    expect(resumo).toContain("Vencimento31/12/2099");
    expect(resumo).toContain("Saldo que continuará em abertoR$ 50,00 (a prazo)");
  });

  it("duplo clique antes do primeiro await → UMA chamada; envia só o imediato como dinheiro e o resto como a prazo", async () => {
    const pendente = deferred<unknown>();
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(() => pendente.promise);
    const { ctx } = montar();
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    const botao = screen.getByRole("button", { name: /Registrar R\$\s350,00 \+ R\$\s50,00 a prazo/ });

    act(() => {
      botao.click();
      botao.click();
    });
    expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1);
    const [storeId, osId, input] = mocks.registrarRecebimentoMistoOSV3.mock.calls[0]!;
    expect(storeId).toBe("loja-qa");
    expect(osId).toBe("os-a");
    expect(input).toMatchObject({
      sessaoId: "sessao-1",
      pagamentosAgora: [{ forma: "debito", valor: 350 }],
      saldoAPrazo: { valor: 50, vencimento: VENC },
      saldoEsperado: 400,
    });
    expect(typeof input.operacaoId).toBe("string");

    await act(async () => {
      pendente.resolve(okMisto());
    });
    await screen.findByText(/Recebido R\$\s350,00 \+ R\$\s50,00 a prazo/);
    expect(ctx.notificar).toHaveBeenCalledWith(expect.stringMatching(/350,00 recebido \+ R\$\s50,00 a prazo/));
    expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1);
  });

  it("100% a prazo com caixa FECHADO: formaliza sem exigir caixa e sem pagamento imediato", async () => {
    mocks.lerPagamentoOSV3.mockImplementation(async () => leitura({ sessao: { aberta: false } }));
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(async () => okMisto({ valorRecebidoAgora: 0, valorAPrazo: 400 }));
    montar();
    await screen.findByText(/Saldo a receber/);
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.click(screen.getByRole("button", { name: /A prazo \/ crediário/ }));
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    expect(screen.getByText(/100% a prazo: nenhum valor entra no caixa/)).toBeTruthy();
    const botao = screen.getByRole("button", { name: /Formalizar R\$\s400,00 a prazo/ });
    expect(desabilitado(botao)).toBe(false);
    fireEvent.click(botao);
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.registrarRecebimentoMistoOSV3.mock.calls[0]![2]).toMatchObject({
      sessaoId: undefined,
      pagamentosAgora: [],
      saldoAPrazo: { valor: 400, vencimento: VENC },
    });
    expect(mocks.receberOSV3).not.toHaveBeenCalled();
  });

  it("linha em branco não é descartada em silêncio: erro visível e botão bloqueado", async () => {
    montar();
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar forma/ }));
    expect(txt(screen.getByTestId("resumo-misto").textContent)).toMatch(/Linha 3 \(PIX\): informe um valor maior que zero/);
    expect(desabilitado(screen.getByRole("button", { name: /Registrar R\$/ }))).toBe(true);
  });

  it("resultado desconhecido (falha de transporte): reenvio usa a MESMA operacaoId", async () => {
    mocks.registrarRecebimentoMistoOSV3
      .mockImplementationOnce(async () => {
        throw new Error("fetch failed");
      })
      .mockImplementationOnce(async () => okMisto({ jaRegistrado: true }));
    const { ctx } = montar();
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/Resultado não confirmado/);
    // O botão principal fica bloqueado: só a MESMA operação pode ser reenviada.
    expect(desabilitado(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }))).toBe(true);

    fireEvent.click(within(alerta).getByRole("button", { name: /Reenviar a mesma operação/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(2));
    const primeira = mocks.registrarRecebimentoMistoOSV3.mock.calls[0]![2];
    const segunda = mocks.registrarRecebimentoMistoOSV3.mock.calls[1]![2];
    expect(segunda.operacaoId).toBe(primeira.operacaoId);
    expect(segunda).toEqual(primeira);
    await waitFor(() => expect(ctx.notificar).toHaveBeenCalledWith(expect.stringMatching(/já estava registrada/)));
  });

  it("trocar de OS durante o salvamento: nada da OS A aparece na OS B e os valores digitados não migram", async () => {
    const pendente = deferred<unknown>();
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(() => pendente.promise);
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    await act(async () => {
      pendente.resolve(okMisto());
    });
    expect(screen.queryByText(/Recebido R\$\s350,00 \+ R\$\s50,00 a prazo/)).toBeNull();
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("Valor da linha 2")).toBeNull();
  });

  it("reabrir a OS mostra o saldo a prazo PERSISTIDO (valor e vencimento vindos do servidor)", async () => {
    mocks.lerPagamentoOSV3.mockImplementation(async () =>
      leitura({
        recebido: 350,
        saldo: 50,
        status: "parcial",
        aPrazo: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true, autorizadoPor: "Operador QA" },
      }),
    );
    montar();
    const card = await screen.findByTestId("a-prazo-persistido");
    expect(txt(card.textContent)).toMatch(/Saldo a prazo: R\$ 50,00/);
    expect(txt(card.textContent)).toMatch(/Vencimento 31\/12\/2099 · autorizado por Operador QA/);
  });

  it("recebimento imediato comum (sem a prazo) continua pelo caminho original receberOSV3", async () => {
    mocks.receberOSV3.mockImplementation(async () => ({
      os: {},
      pagamento: { total: 400, recebido: 400, saldo: 0, status: "quitado" },
      valorRecebido: 400,
      op: "liquidar",
      recibo: okMisto().recibo,
    }));
    montar();
    await screen.findByText(/Saldo a receber/);
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Quitar OS/ }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.receberOSV3.mock.calls[0]![2]).toMatchObject({ valor: 400, forma: "pix", sessaoId: "sessao-1" });
    expect(mocks.registrarRecebimentoMistoOSV3).not.toHaveBeenCalled();
  });
});
