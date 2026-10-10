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
  localStorage.clear();
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
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): a linha nova nasce SEM forma — também
    // não é descartada em silêncio; escolhida a forma, o valor em branco segue bloqueando.
    expect(txt(screen.getByTestId("resumo-misto").textContent)).toMatch(/Linha 3: escolha a forma de pagamento/);
    expect(desabilitado(screen.getByRole("button", { name: /Registrar R\$/ }))).toBe(true);
    fireEvent.change(screen.getByLabelText("Forma da linha 3"), { target: { value: "pix" } });
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
    expect(alerta.textContent).toMatch(/Confirmação pendente de verificação/);
    // O botão principal fica bloqueado: só a MESMA operação pode ser reenviada.
    expect(desabilitado(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }))).toBe(true);

    fireEvent.click(within(alerta).getByRole("button", { name: /Verificar mesma confirmação/ }));
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

  it("resposta perdida no recebimento comum: reenviar o MESMO recebimento reaproveita a operacaoId", async () => {
    mocks.receberOSV3
      .mockImplementationOnce(async () => {
        throw new Error("Failed to fetch");
      })
      .mockImplementation(async () => ({
        os: {},
        pagamento: { total: 400, recebido: 400, saldo: 0, status: "quitado" },
        valorRecebido: 400,
        op: "liquidar",
        recibo: okMisto().recibo,
        jaRegistrado: true,
      }));
    montar();
    await screen.findByText(/Saldo a receber/);
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Quitar OS/ }));
    await screen.findByTestId("pendencia-recebimento");
    await waitFor(() => expect(desabilitado(screen.getByRole("button", { name: /Quitar OS/ }))).toBe(true));
    fireEvent.click(within(screen.getByTestId("pendencia-recebimento")).getByRole("button", { name: "Verificar mesma confirmação" }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(2));
    const [primeira, segunda] = mocks.receberOSV3.mock.calls.map((c) => c[2] as { operacaoId?: string });
    expect(primeira!.operacaoId).toMatch(/^[A-Za-z0-9._-]{8,120}$/);
    expect(segunda!.operacaoId).toBe(primeira!.operacaoId);
  });

  // R3/P1: a identidade de um resultado incerto não pode ser descartada por outra operação.
  it("recebimento comum: outro recebimento no meio NÃO descarta a chave do resultado incerto", async () => {
    const respostaComum = (saldo: number) => ({
      os: {},
      pagamento: { total: 400, recebido: 400 - saldo, saldo, status: "parcial" },
      valorRecebido: 0,
      op: "parcial",
      recibo: okMisto().recibo,
    });
    mocks.receberOSV3
      .mockImplementationOnce(async () => {
        throw new Error("Failed to fetch");
      })
      .mockImplementationOnce(async () => respostaComum(250))
      .mockImplementationOnce(async () => ({ ...respostaComum(250), jaRegistrado: true }));
    montar();
    await screen.findByText(/Saldo a receber/);
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    const receberValor = async (valor: string, chamadas: number) => {
      fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: valor } });
      await waitFor(() => expect(desabilitado(screen.getByRole("button", { name: /^Receber · / }))).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
      await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(chamadas));
    };
    await receberValor("100", 1); // R$100: resposta perdida
    await screen.findByTestId("pendencia-recebimento");
    // A revisão 7 impede outra confirmação no meio. Somente a original é verificada.
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "50" } });
    expect(desabilitado(screen.getByRole("button", { name: /^Receber · / }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
    expect(mocks.receberOSV3).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByTestId("pendencia-recebimento")).getByRole("button", { name: "Verificar mesma confirmação" }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(2));
    const [original, verificada] = mocks.receberOSV3.mock.calls.map((c) => c[2] as Record<string, unknown>);
    expect(verificada).toEqual(original);
    await waitFor(() => expect(screen.queryByTestId("pendencia-recebimento")).toBeNull());
    await receberValor("50", 3);
    expect(mocks.receberOSV3.mock.calls[2]![2].operacaoId).not.toBe(original!.operacaoId);
  });

  it("misto incerto: recusa NÃO conferida (sessão) mantém a MESMA chave; só ok ou recusa conferida a liberam", async () => {
    mocks.registrarRecebimentoMistoOSV3
      .mockImplementationOnce(async () => {
        throw new Error("fetch failed");
      })
      .mockImplementationOnce(async () => ({ ok: false, code: "nao_autenticado", mensagem: "Faça login para registrar o recebimento." }))
      .mockImplementationOnce(async () => ({ ok: false, code: "periodo_fechado", mensagem: "Período financeiro fechado.", naoRegistrada: true }));
    montar();
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: /Verificar mesma confirmação/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Verificar mesma confirmação" });
    // Recusa sem conferência: a pendência continua de pé, com a mesma operação.
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: /Verificar mesma confirmação/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(3));
    const chaves = mocks.registrarRecebimentoMistoOSV3.mock.calls.map((c) => (c[2] as { operacaoId: string }).operacaoId);
    expect(new Set(chaves).size).toBe(1);
    // Recusa CONFERIDA (nada gravado com a chave): só agora a pendência é liberada.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Verificar mesma confirmação/ })).toBeNull());
  });

  // R4/P1: pendência do misto é POR OS — uma segunda incerteza em outra OS não apaga a primeira.
  it("misto incerto em DUAS OS: cada uma guarda a sua pendência; voltar para A reenvia a operação de A", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(async () => {
      throw new Error("fetch failed");
    });
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await prepararDebito350MaisAPrazo();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    expect(screen.queryByRole("button", { name: /Verificar mesma confirmação/ })).toBeNull();
    // O modo dividido continua ligado na troca de OS (só os valores são zerados).
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "debito" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: /A prazo \/ crediário/ }));
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    await screen.findByRole("button", { name: /Verificar mesma confirmação/ });
    expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(2);

    mocks.registrarRecebimentoMistoOSV3.mockImplementation(async () => okMisto({ jaRegistrado: true }));
    fireEvent.change(screen.getByDisplayValue(/OS-B/), { target: { value: "os-a" } });
    await screen.findByRole("heading", { name: /OS-A · Cliente OS-A/ });
    fireEvent.click(await screen.findByRole("button", { name: /Verificar mesma confirmação/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(3));
    const [daA, daB, reenvio] = mocks.registrarRecebimentoMistoOSV3.mock.calls;
    expect([daA![1], daB![1], reenvio![1]]).toEqual(["os-a", "os-b", "os-a"]);
    expect(reenvio![2]).toEqual(daA![2]);
    expect((reenvio![2] as { operacaoId: string }).operacaoId).not.toBe((daB![2] as { operacaoId: string }).operacaoId);
  });

  // R4/P1: a chave do recebimento comum é o conteúdo ECONÔMICO — o formato da tela não importa.
  it("recebimento comum incerto: reenviar o MESMO conteúdo em split reaproveita a chave; saldo visto vai junto e é relido", async () => {
    mocks.receberOSV3
      .mockImplementationOnce(async () => {
        throw new Error("Failed to fetch");
      })
      .mockImplementationOnce(async () => ({
        os: {},
        pagamento: { total: 400, recebido: 100, saldo: 300, status: "parcial" },
        valorRecebido: 100,
        op: "parcial",
        recibo: okMisto().recibo,
        jaRegistrado: true,
      }));
    montar();
    await screen.findByText(/Saldo a receber/);
    await waitFor(() => expect(txt(document.body.textContent)).toContain("R$ 400,00"));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "100" } });
    await waitFor(() => expect(desabilitado(screen.getByRole("button", { name: /^Receber · / }))).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
    await screen.findByTestId("pendencia-recebimento");
    // Depois da falha a tela relê o saldo real (o recebimento pode ter entrado).
    await waitFor(() => expect(mocks.lerPagamentoOSV3).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "100" } });
    await waitFor(() => expect(desabilitado(screen.getByRole("button", { name: /^Receber · / }))).toBe(true));
    fireEvent.click(within(screen.getByTestId("pendencia-recebimento")).getByRole("button", { name: "Verificar mesma confirmação" }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(2));
    const [unica, split] = mocks.receberOSV3.mock.calls.map((c) => c[2] as Record<string, unknown>);
    expect(unica).toMatchObject({ valor: 100, forma: "pix", sessaoId: "sessao-1", saldoEsperado: 400 });
    expect(split).toEqual(unica);
    expect(split!.operacaoId).toBe(unica!.operacaoId);
  });

  // R3/P2: depois de um recebimento comum, o cartão "Saldo a prazo" acompanha o servidor.
  it("recebimento comum depois do misto atualiza o cartão a prazo (R$30) e o encerra na quitação", async () => {
    const aPrazoV3 = (valor: number, status = "pendente") => ({
      modo: "a_prazo", status, valor, vencimento: VENC, autorizadoEntrega: true, autorizadoPor: "Operador QA",
    });
    mocks.lerPagamentoOSV3.mockImplementation(async () =>
      leitura({ recebido: 350, saldo: 50, status: "parcial", aPrazo: aPrazoV3(50) }),
    );
    mocks.receberOSV3
      .mockImplementationOnce(async () => ({
        os: { aPrazoV3: aPrazoV3(30) },
        pagamento: { total: 400, recebido: 370, saldo: 30, status: "parcial" },
        valorRecebido: 20,
        op: "parcial",
        recibo: okMisto().recibo,
      }))
      .mockImplementationOnce(async () => ({
        os: { aPrazoV3: aPrazoV3(30, "quitado") },
        pagamento: { total: 400, recebido: 400, saldo: 0, status: "quitado" },
        valorRecebido: 30,
        op: "liquidar",
        recibo: okMisto().recibo,
      }));
    montar();
    expect(txt((await screen.findByTestId("a-prazo-persistido")).textContent)).toMatch(/Saldo a prazo: R\$ 50,00/);
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
    await waitFor(() => expect(txt(screen.getByTestId("a-prazo-persistido").textContent)).toMatch(/Saldo a prazo: R\$ 30,00/));

    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Quitar OS/ }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("a-prazo-persistido")).toBeNull());
  });
});
