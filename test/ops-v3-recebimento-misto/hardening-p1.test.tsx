/**
 * OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — tela REAL montada (jsdom) com o hook REAL.
 *
 * P1-A (T08): resposta perdida no PIX 100 → saldo relido 300 → o operador representa a MESMA
 * confirmação como PIX 50 + PIX 50. A chave econômica tem de ser a mesma (replay), nunca uma
 * segunda baixa. Um recebimento NOVO legítimo depois (PIX 20) continua permitido.
 *
 * P2 (T18/T19): a resposta da OS A chega quando o operador já está na OS B — nada do rascunho
 * de B pode ser apagado nem recarregado por causa de A.
 *
 * O "servidor" aqui é um fake com ledger mínimo (replay por operacaoId + saldo esperado), só
 * para tornar a baixa em dobro OBSERVÁVEL; o servidor real é provado no PostgreSQL.
 */
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
const txt = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ");
const valorDe = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

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
      servicos: [{ id: "s1", descricao: "Troca de tela", valor: 400 }],
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

function recibo(valorPago: number, saldoRestante: number) {
  return {
    numeroOS: "OS-A",
    cliente: "Cliente OS-A",
    equipamento: "Samsung A54",
    formas: [{ forma: "pix", label: "PIX", valor: valorPago }],
    intencaoLabel: "Parcial",
    valorPago,
    totalOS: 400,
    recebidoAcumulado: 400 - saldoRestante,
    saldoRestante,
    statusPagamento: "parcial",
    statusLabel: "Parcial",
    dataHora: "2026-10-05T12:00:00.000Z",
    operador: "Operador QA",
  };
}

function okMisto() {
  return {
    ok: true,
    jaRegistrado: false,
    operacaoId: "op-a",
    tituloId: "tit-a",
    pagamento: { total: 400, recebido: 350, saldo: 50, status: "parcial" },
    aPrazo: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true },
    valorRecebidoAgora: 350,
    valorAPrazo: 50,
    recibo: { ...recibo(350, 50), tipoComprovante: "recebimento_misto", aPrazo: { valor: 50, vencimento: VENC } },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

async function saldoNaTela(valor: string) {
  await screen.findByText(/Saldo a receber/);
  await waitFor(() => expect(txt(document.body.textContent)).toContain(valor));
}

/**
 * Servidor fake com ledger: mesma `operacaoId` já gravada → replay (sem nova baixa); chave nova
 * só grava contra o saldo que o operador viu. `perderResposta` grava e "perde" a resposta.
 */
function servidorComLedger(saldoInicial = 400) {
  const estado = { saldo: saldoInicial, baixas: [] as Array<{ operacaoId: string; centavos: number }>, perderResposta: false };
  const gravadas = new Map<string, number>();
  mocks.lerPagamentoOSV3.mockImplementation(async () => leitura({ recebido: saldoInicial - estado.saldo, saldo: estado.saldo }));
  mocks.receberOSV3.mockImplementation(async (_sid: string, _osId: string, input: { operacaoId: string; saldoEsperado?: number; valor?: number; linhas?: Array<{ valor: number }> }) => {
    const centavos = Math.round((input.linhas ? input.linhas.reduce((a, l) => a + l.valor, 0) : input.valor ?? 0) * 100);
    const resposta = (jaRegistrado: boolean) => ({
      os: {},
      pagamento: { total: 400, recebido: saldoInicial - estado.saldo, saldo: estado.saldo, status: "parcial" },
      valorRecebido: centavos / 100,
      op: "parcial",
      recibo: recibo(centavos / 100, estado.saldo),
      operacaoId: input.operacaoId,
      jaRegistrado,
    });
    if (gravadas.has(input.operacaoId)) return resposta(true);
    if (Math.round((input.saldoEsperado ?? -1) * 100) !== Math.round(estado.saldo * 100)) {
      throw new Error(`O saldo desta OS mudou (agora R$ ${estado.saldo.toFixed(2)}). Atualize e confirme de novo.`);
    }
    estado.saldo = Math.round(estado.saldo * 100 - centavos) / 100;
    estado.baixas.push({ operacaoId: input.operacaoId, centavos });
    gravadas.set(input.operacaoId, centavos);
    if (estado.perderResposta) {
      estado.perderResposta = false;
      throw new Error("Failed to fetch");
    }
    return resposta(false);
  });
  return estado;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.lerPagamentoOSV3.mockImplementation(async () => leitura());
});
afterEach(() => cleanup());

describe("P1-A · hook real: resposta perdida + representação equivalente", () => {
  it("T08: PIX 100 perdido, saldo relido 300, PIX 50 + PIX 50 → MESMA operacaoId, replay, nenhuma segunda baixa; PIX 20 novo continua permitido", async () => {
    const servidor = servidorComLedger(400);
    montar();
    await saldoNaTela("R$ 400,00");

    // 1) PIX 100 (forma única): o servidor grava e a resposta se perde.
    servidor.perderResposta = true;
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "100" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Receber · / }));
    await screen.findByText(/Failed to fetch/);
    // 2) A tela relê o saldo real: 300.
    await waitFor(() => expect(mocks.lerPagamentoOSV3).toHaveBeenCalledTimes(2));
    await saldoNaTela("R$ 300,00");

    // 3) O operador representa a MESMA confirmação como PIX 50 + PIX 50.
    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar forma/ }));
    fireEvent.change(screen.getByLabelText("Forma da linha 2"), { target: { value: "pix" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 2"), { target: { value: "50" } });
    await waitFor(() => expect((screen.getByRole("button", { name: /^Receber · / }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(2));

    const [unica, split] = mocks.receberOSV3.mock.calls.map((c) => c[2] as { operacaoId: string; saldoEsperado: number });
    // Efeito econômico primeiro: UMA baixa de 100 e saldo 300 (nenhuma segunda baixa).
    expect(servidor.baixas).toEqual([{ operacaoId: unica!.operacaoId, centavos: 10_000 }]);
    expect(servidor.saldo).toBe(300);
    expect(split!.operacaoId).toBe(unica!.operacaoId);

    // 4) Recebimento NOVO legítimo sobre o novo saldo: outra chave, aceito.
    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "20" } });
    await waitFor(() => expect((screen.getByRole("button", { name: /^Receber · / }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /^Receber · / }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(3));
    const nova = mocks.receberOSV3.mock.calls[2]![2] as { operacaoId: string; saldoEsperado: number };
    expect(nova.operacaoId).not.toBe(unica!.operacaoId);
    expect(nova.saldoEsperado).toBe(300);
    await waitFor(() => expect(servidor.baixas.map((b) => b.centavos)).toEqual([10_000, 2_000]));
    expect(servidor.saldo).toBe(280);
  });
});

describe("P2 · a resposta da OS A nunca mexe no rascunho da OS B", () => {
  async function prepararAMisto() {
    await saldoNaTela("R$ 400,00");
    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "debito" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: /A prazo \/ crediário/ }));
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
  }

  async function irParaBEDigitar() {
    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    await saldoNaTela("R$ 400,00");
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /A prazo \/ crediário/ }));
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } });
    fireEvent.change(screen.getByLabelText("Observação da parte a prazo"), { target: { value: "obs de B" } });
  }

  function esperarRascunhoBIntacto() {
    expect(screen.getByRole("heading", { name: /OS-B · Cliente OS-B/ })).toBeTruthy();
    expect((screen.getByLabelText("Forma da linha 1") as HTMLSelectElement).value).toBe("pix");
    expect(valorDe("Valor da linha 1")).toBe("100");
    expect((screen.getByLabelText("Forma da linha 2") as HTMLSelectElement).value).toBe("a_prazo");
    expect(valorDe("Valor da linha 2")).toBe("300,00");
    expect(valorDe("Vencimento da parte a prazo")).toBe(VENC);
    expect(valorDe("Observação da parte a prazo")).toBe("obs de B");
  }

  const leiturasDeB = () => mocks.lerPagamentoOSV3.mock.calls.filter((c) => c[1] === "os-b").length;

  it("T18: registrarMisto de A termina depois da troca para B — split, vencimento e observação de B intactos", async () => {
    const pendente = deferred<unknown>();
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(() => pendente.promise);
    const { ctx } = montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await prepararAMisto();
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));

    await irParaBEDigitar();
    const leiturasAntes = leiturasDeB();
    await act(async () => {
      pendente.resolve(okMisto());
    });
    esperarRascunhoBIntacto();
    expect(leiturasDeB()).toBe(leiturasAntes);
    // A operação de A foi registrada: a lista é atualizada e o aviso nomeia a OS A.
    expect(ctx.reload).toHaveBeenCalled();
    expect(ctx.notificar).toHaveBeenCalledWith(expect.stringMatching(/^OS-A: /));
  });

  it("T19: reenviar a pendência de A termina depois da troca para B — B intacta", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockImplementationOnce(async () => {
      throw new Error("fetch failed");
    });
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await prepararAMisto();
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    const alerta = await screen.findByRole("alert");

    const pendente = deferred<unknown>();
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(() => pendente.promise);
    fireEvent.click(within(alerta).getByRole("button", { name: /Reenviar a mesma operação/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(2));

    await irParaBEDigitar();
    const leiturasAntes = leiturasDeB();
    await act(async () => {
      pendente.resolve({ ...okMisto(), jaRegistrado: true });
    });
    esperarRascunhoBIntacto();
    expect(leiturasDeB()).toBe(leiturasAntes);
    const [original, reenvio] = mocks.registrarRecebimentoMistoOSV3.mock.calls;
    expect(reenvio![1]).toBe("os-a");
    expect(reenvio![2]).toEqual(original![2]);
  });

  it("recusa saldo_divergente de A depois da troca: B não é recarregada e o valor digitado em B não muda", async () => {
    const pendente = deferred<unknown>();
    mocks.registrarRecebimentoMistoOSV3.mockImplementation(() => pendente.promise);
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await prepararAMisto();
    fireEvent.click(screen.getByRole("button", { name: /Registrar R\$\s350,00/ }));
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    await saldoNaTela("R$ 400,00");
    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "150" } });
    const leiturasAntes = leiturasDeB();

    await act(async () => {
      pendente.resolve({ ok: false, code: "saldo_divergente", mensagem: "O saldo da OS mudou (agora R$ 380,00).", saldoAtual: 380, naoRegistrada: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(leiturasDeB()).toBe(leiturasAntes);
    expect(valorDe(/Valor a receber/)).toBe("150");
    expect(txt(document.body.textContent)).not.toContain("R$ 380,00");
  });

  it("recebimento comum de A termina depois da troca: o split digitado em B permanece", async () => {
    const pendente = deferred<unknown>();
    mocks.receberOSV3.mockImplementation(() => pendente.promise);
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await saldoNaTela("R$ 400,00");
    fireEvent.click(screen.getByRole("button", { name: /^PIX$/ }));
    fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "100" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Receber · / }));
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    await saldoNaTela("R$ 400,00");
    fireEvent.click(screen.getByLabelText(/Pagamento dividido/));
    fireEvent.change(screen.getByLabelText("Forma da linha 1"), { target: { value: "debito" } });
    fireEvent.change(screen.getByLabelText("Valor da linha 1"), { target: { value: "120" } });

    await act(async () => {
      pendente.resolve({ os: {}, pagamento: { total: 400, recebido: 100, saldo: 300, status: "parcial" }, valorRecebido: 100, op: "parcial", recibo: recibo(100, 300) });
    });
    expect((screen.getByLabelText("Forma da linha 1") as HTMLSelectElement).value).toBe("debito");
    expect(valorDe("Valor da linha 1")).toBe("120");
  });

  it("estorno de A termina depois da troca: o motivo digitado em B permanece e B não é recarregada", async () => {
    mocks.lerPagamentoOSV3.mockImplementation(async () => leitura({ recebido: 100, saldo: 300, status: "parcial" }));
    const pendente = deferred<unknown>();
    mocks.estornarRecebimentoOSV3.mockImplementation(() => pendente.promise);
    montar([os("os-a", "OS-A"), os("os-b", "OS-B")], "os-a");
    await saldoNaTela("R$ 300,00");
    fireEvent.change(screen.getByPlaceholderText("Motivo (opcional)"), { target: { value: "motivo A" } });
    fireEvent.click(screen.getByRole("button", { name: /Estornar último recebimento/ }));
    await waitFor(() => expect(mocks.estornarRecebimentoOSV3).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByDisplayValue(/OS-A/), { target: { value: "os-b" } });
    await screen.findByRole("heading", { name: /OS-B · Cliente OS-B/ });
    await saldoNaTela("R$ 300,00");
    fireEvent.change(screen.getByPlaceholderText("Motivo (opcional)"), { target: { value: "motivo B" } });
    const leiturasAntes = leiturasDeB();

    await act(async () => {
      pendente.resolve({ os: {}, pagamento: { total: 400, recebido: 0, saldo: 400, status: "aberto" }, estornado: 100 });
    });
    expect((screen.getByPlaceholderText("Motivo (opcional)") as HTMLInputElement).value).toBe("motivo B");
    expect(leiturasDeB()).toBe(leiturasAntes);
  });
});
