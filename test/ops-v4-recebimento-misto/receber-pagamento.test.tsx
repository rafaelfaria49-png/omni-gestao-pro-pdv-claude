import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { ReceberPagamentoV4 } from "@/components/operacoes-v4-preview/parts/ReceberPagamentoV4";
import { FinanceiroStage } from "@/components/operacoes-v4-preview/parts/stages/FinanceiroStage";
import { ReciboModal } from "@/components/operacoes-v4-preview/parts/ReciboModal";
import { usePdvServicoV3 } from "@/components/operacoes-v3/hooks/use-pdv-servico-v3";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import type { ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";
import { montarComprovanteMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";
import type { OrdemServico } from "@/types/os";

const mocks = vi.hoisted(() => ({ lerPagamentoOSV3: vi.fn(), receberOSV3: vi.fn(), estornarRecebimentoOSV3: vi.fn(), registrarRecebimentoMistoOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => mocks);
const VENC = "2099-12-31";
let aberto = true;
const leitura = () => ({ total: 400, recebido: 0, saldo: 400, status: "aberto", sessao: { aberta: aberto, sessaoId: aberto ? "sessao-qa" : null }, aPrazo: null });
const os = { id: "os-a", codigo: "OS-QA-A", cliente: { nome: "Cliente QA" }, equipamento: { marca: "Samsung", modelo: "A54" } } as OrdemServico;
const recibo = () => montarComprovanteMistoV3({ os, pagamentosAgora: [{ forma: "debito", valor: 350 }], valorRecebidoAgora: 350, recebidoAnteriormente: 0, pagamento: { total: 400, recebido: 350, saldo: 50, status: "parcial" }, aPrazo: { valor: 50, vencimento: VENC }, operador: "QA", dataHora: "2026-10-04T15:00:00Z" });
const resultado = () => ({ ok: true, jaRegistrado: false, operacaoId: "retorno-qa", tituloId: "titulo-qa", pagamento: { total: 400, recebido: 350, saldo: 50, status: "parcial" }, aPrazo: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true }, valorRecebidoAgora: 350, valorAPrazo: 50, recibo: recibo() });
const abrirRecibo = vi.fn();

function Harness({ osId = "os-a", loja = "loja-qa", credito = false, financialLoading = false, saldoProjetado, stage = false }: { osId?: string; loja?: string; credito?: boolean; financialLoading?: boolean; saldoProjetado?: number; stage?: boolean }) {
  const pdv = usePdvServicoV3(loja, osId);
  const [modal, setModal] = useState(false);
  const v = {
    osSelected: true, selectedOsId: osId, recebimentoContextKey: JSON.stringify([loja, osId]), pdvServico: pdv,
    receberPagamentoOpen: modal, closeReceberPagamento: () => setModal(false), openRecibo: abrirRecibo,
    financial: { loading: financialLoading, error: null, projection: financialLoading ? null : { expectedTotal: 400, receivedTotal: 400 - (saldoProjetado ?? (credito ? 50 : 400)), balance: saldoProjetado ?? (credito ? 50 : 400), canReceive: true, financialStatus: credito ? "AUTHORIZED_CREDIT" : "OPEN", consistencyIssues: [], financialEvents: [], installments: credito ? [{ amount: 50, dueAt: VENC }] : [] } },
    os: { codigo: "OS-QA-A", cliente: "Cliente QA" }, financeiroResumo: { situacaoLabel: "Parcial" }, estorno: { podeEstornar: false },
    recebimento: { semTotal: false, previaNaoMaterializada: false, quitado: false, caixaAberto: !!pdv.sessao?.aberta },
    entrega: { entregue: false }, goEntrega: vi.fn(),
  } as unknown as V4Vals;
  return <><button onClick={() => setModal(true)}>Abrir pelo header</button>{stage ? <FinanceiroStage v={v} /> : <ReceberPagamentoV4 v={v} />}</>;
}
async function abrir(props: Parameters<typeof Harness>[0] = {}) {
  const view = render(<Harness {...props} />);
  await waitFor(() => expect(screen.queryByText("Carregando sessão de caixa…")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /^Receber R/ }));
  await screen.findByRole("dialog");
  return view;
}
function linha(i: number, forma: string, valor?: string) {
  fireEvent.change(screen.getByLabelText(`Forma da linha ${i}`), { target: { value: forma } });
  if (valor !== undefined) fireEvent.change(screen.getByLabelText(`Valor da linha ${i}`), { target: { value: valor } });
}
function dividir() { fireEvent.click(screen.getByRole("button", { name: /Dividir pagamento/ })); }
function prazo() { fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: VENC } }); }
async function preparar() { const view = await abrir(); linha(1, "debito", "350"); dividir(); linha(2, "a_prazo"); prazo(); return view; }
const confirmar = () => screen.getByRole("button", { name: /^(Registrar|Formalizar|Confirmar|Verificar)/ });
const disabled = () => (confirmar() as HTMLButtonElement).disabled;
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  localStorage.clear();
  aberto = true; abrirRecibo.mockReset();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.lerPagamentoOSV3.mockImplementation(async () => leitura());
  mocks.registrarRecebimentoMistoOSV3.mockImplementation(async () => resultado());
  mocks.receberOSV3.mockResolvedValue({ pagamento: { total: 400, recebido: 400, saldo: 0, status: "quitado" }, recibo: { ...recibo(), aPrazo: undefined, intencaoLabel: "Quitação", valorPago: 400 } });
});
afterEach(cleanup);

describe("V4 — paridade sobre o hook V3 real (montado)", () => {
  it("T01: 350 débito + 50 a prazo, saldo esperado 400 e comprovante", async () => {
    await preparar(); expect(disabled()).toBe(false);
    expect(screen.queryByRole("button", { name: "Quitar saldo" })).toBeNull();
    expect(screen.getByTestId("resumo-misto").textContent).toMatch(/Receber agoraR\$\s350,00Deixar a prazoR\$\s50,00Saldo em abertoR\$\s50,00/);
    fireEvent.click(confirmar());
    await waitFor(() => expect(abrirRecibo).toHaveBeenCalledTimes(1));
    expect(mocks.receberOSV3).not.toHaveBeenCalled();
    expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledWith("loja-qa", "os-a", expect.objectContaining({ pagamentosAgora: [{ forma: "debito", valor: 350 }], saldoAPrazo: { valor: 50, vencimento: VENC, observacao: undefined }, saldoEsperado: 400, sessaoId: "sessao-qa", intencao: "parcial" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("T02: dinheiro 100 + débito 250 + a prazo 50", async () => {
    await abrir(); linha(1, "dinheiro", "100"); dividir(); linha(2, "debito", "250"); dividir(); linha(3, "a_prazo"); prazo();
    fireEvent.click(confirmar());
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.registrarRecebimentoMistoOSV3.mock.calls[0][2].pagamentosAgora).toEqual([{ forma: "dinheiro", valor: 100 }, { forma: "debito", valor: 250 }]);
  });
  it.each([true, false])("T03/T11: 100%% a prazo permitido com caixa aberto=%s e sem sessaoId", async (caixa) => {
    aberto = caixa; await abrir(); linha(1, "a_prazo"); prazo(); expect(disabled()).toBe(false); fireEvent.click(confirmar());
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.registrarRecebimentoMistoOSV3.mock.calls[0][2]).toMatchObject({ pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: VENC }, saldoEsperado: 400 });
    expect(mocks.registrarRecebimentoMistoOSV3.mock.calls[0][2].sessaoId).toBeUndefined();
  });
  it("T04/T20: débito 400 segue receber normal", async () => {
    await abrir(); linha(1, "debito", "400"); fireEvent.click(confirmar());
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(1));
    expect(mocks.receberOSV3.mock.calls[0][2]).toMatchObject({ linhas: [{ forma: "debito", valor: 400 }], sessaoId: "sessao-qa" });
    expect(mocks.registrarRecebimentoMistoOSV3).not.toHaveBeenCalled();
  });
  it("T05: parcial imediato sem a prazo preserva intenção e não pede vencimento", async () => {
    await abrir(); fireEvent.click(screen.getByRole("button", { name: "Pagamento parcial" })); linha(1, "pix", "80");
    expect(screen.queryByLabelText("Vencimento da parte a prazo")).toBeNull(); expect(disabled()).toBe(false); fireEvent.click(confirmar());
    await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(1)); expect(mocks.receberOSV3.mock.calls[0][2].intencao).toBe("parcial");
  });
  it("T06: sem vencimento e data passada bloqueiam antes do submit", async () => {
    await abrir(); linha(1, "a_prazo"); expect(disabled()).toBe(true); expect(screen.getByText("Informe o vencimento da parte a prazo.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Vencimento da parte a prazo"), { target: { value: "2020-01-01" } });
    expect(disabled()).toBe(true); expect(screen.getByText(/não pode ser anterior a hoje/)).toBeTruthy();
  });
  it("T07: segunda linha a prazo desabilitada no seletor e rejeitada na validação", async () => {
    await preparar(); const option = within(screen.getByLabelText("Forma da linha 1")).getByRole("option", { name: "A prazo / crediário" }); expect((option as HTMLOptionElement).disabled).toBe(true);
    linha(1, "a_prazo", "350"); expect(disabled()).toBe(true); expect(screen.getByText(/Use no máximo uma linha a prazo/)).toBeTruthy();
  });
  it.each([ ["300", "50", /Ainda falta distribuir/], ["350", "100", /passa do saldo/] ])("T08/T09: %s imediato + %s a prazo bloqueado", async (imediato, aprazo, erro) => {
    await preparar(); linha(1, "debito", imediato); linha(2, "a_prazo", aprazo); expect(disabled()).toBe(true); expect(screen.getByText(erro)).toBeTruthy(); fireEvent.click(confirmar()); expect(mocks.registrarRecebimentoMistoOSV3).not.toHaveBeenCalled();
  });
  it("T10: caixa fechado + valor imediato bloqueia", async () => {
    aberto = false; await preparar(); expect(disabled()).toBe(true); expect(screen.getByText("Abra o caixa para registrar o valor recebido agora.")).toBeTruthy();
  });
  it("T12: crédito já vigente mostra valor/vencimento, recebe 50 sem segunda autorização", async () => {
    await abrir({ credito: true }); expect(screen.getByTestId("a-prazo-persistido").textContent).toMatch(/50,00.*31\/12\/2099/);
    const opcao = within(screen.getByLabelText("Forma da linha 1")).getByRole("option", { name: "A prazo / crediário" }); expect((opcao as HTMLOptionElement).disabled).toBe(true);
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): sem forma pré-selecionada, o operador escolhe.
    linha(1, "pix");
    fireEvent.click(confirmar()); await waitFor(() => expect(mocks.receberOSV3).toHaveBeenCalledTimes(1)); expect(mocks.receberOSV3.mock.calls[0][2].linhas).toEqual([{ forma: "pix", valor: 50 }]); expect(mocks.registrarRecebimentoMistoOSV3).not.toHaveBeenCalled();
  });
  it("T14: incerto mantém rascunho, bloqueia edição, retry reutiliza operação do hook", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockRejectedValueOnce(new Error("transporte interrompido"));
    await preparar(); fireEvent.click(confirmar()); await screen.findByRole("button", { name: "Verificar mesma confirmação" });
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("350"); expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Confirmação pendente de verificação/);
    fireEvent.click(confirmar()); await waitFor(() => expect(abrirRecibo).toHaveBeenCalledTimes(1));
    const [a, b] = mocks.registrarRecebimentoMistoOSV3.mock.calls; expect(b[2]).toEqual(a[2]); expect(mocks.receberOSV3).not.toHaveBeenCalled();
  });
  it("pendência volta ao reabrir e trocar A→B→A, mesmo após o caixa fechar", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockRejectedValueOnce(new Error("sem resposta"));
    const view = await preparar(); fireEvent.click(confirmar()); await screen.findByRole("button", { name: "Verificar mesma confirmação" });
    const enviado = mocks.registrarRecebimentoMistoOSV3.mock.calls[0][2];
    view.rerender(<Harness osId="os-b" />); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    aberto = false; view.rerender(<Harness osId="os-a" />); await screen.findByRole("button", { name: "Verificar mesma confirmação" });
    fireEvent.click(screen.getByRole("button", { name: "Verificar mesma confirmação" })); await screen.findByRole("button", { name: "Verificar mesma confirmação" }); fireEvent.click(confirmar());
    await waitFor(() => expect(abrirRecibo).toHaveBeenCalledTimes(1)); expect(mocks.registrarRecebimentoMistoOSV3.mock.calls[1][2]).toEqual(enviado);
  });
  it("T15: recusado mostra mensagem real e mantém rascunho editável", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockResolvedValue({ ok: false, code: "saldo_divergente", mensagem: "Saldo mudou para R$ 380,00.", naoRegistrada: true });
    await preparar(); fireEvent.click(confirmar()); await screen.findByText("Saldo mudou para R$ 380,00."); expect(screen.getByRole("dialog")).toBeTruthy(); expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).disabled).toBe(false); expect(abrirRecibo).not.toHaveBeenCalled();
  });
  it("T16: duplo clique em misto dispara uma confirmação", async () => {
    const pendente = deferred<ReturnType<typeof resultado>>(); mocks.registrarRecebimentoMistoOSV3.mockReturnValue(pendente.promise); await preparar(); const botao = confirmar();
    act(() => { fireEvent.click(botao); fireEvent.click(botao); }); expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1);
    await act(async () => pendente.resolve(resultado()));
  });
  it.each(["os", "loja"])("T17: troca de %s durante await não abre recibo anterior nem carrega rascunho", async (alvo) => {
    const pendente = deferred<ReturnType<typeof resultado>>(); mocks.registrarRecebimentoMistoOSV3.mockReturnValue(pendente.promise); const view = await preparar(); fireEvent.click(confirmar());
    view.rerender(<Harness osId={alvo === "os" ? "os-b" : "os-a"} loja={alvo === "loja" ? "loja-b" : "loja-qa"} />);
    await act(async () => pendente.resolve(resultado())); expect(abrirRecibo).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.queryByText("Carregando sessão de caixa…")).toBeNull()); fireEvent.click(screen.getByRole("button", { name: /^Receber R/ }));
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("400"); expect(screen.queryByLabelText("Vencimento da parte a prazo")).toBeNull();
  });
  it("T18: seletor contém exatamente cinco formas autorizadas", async () => {
    await abrir();
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): começa SEM forma escolhida (opção vazia
    // desabilitada); as formas oferecidas continuam exatamente as cinco autorizadas.
    const opcoes = within(screen.getByLabelText("Forma da linha 1")).getAllByRole("option") as HTMLOptionElement[];
    expect(opcoes.map((e) => e.textContent)).toEqual(["Escolha a forma", "Dinheiro", "PIX", "Débito", "Crédito", "A prazo / crediário"]);
    expect(opcoes[0]).toMatchObject({ value: "", disabled: true, selected: true });
    expect(opcoes.filter((o) => o.value).map((e) => e.textContent)).toEqual(["Dinheiro", "PIX", "Débito", "Crédito", "A prazo / crediário"]);
  });
  it("Usar restante atualiza 50 para 100 só quando solicitado", async () => {
    await preparar(); linha(1, "debito", "300"); expect((screen.getByLabelText("Valor da linha 2") as HTMLInputElement).value).toBe("50,00");
    fireEvent.click(screen.getAllByRole("button", { name: "Usar restante" })[1]); expect((screen.getByLabelText("Valor da linha 2") as HTMLInputElement).value).toBe("100,00"); expect(disabled()).toBe(false);
  });
  it("valor com letras ou precisão além de centavos não entra na confirmação", async () => {
    await preparar(); linha(1, "debito", "350abc"); expect(disabled()).toBe(true); linha(1, "debito", "350.001"); expect(disabled()).toBe(true);
  });
  it("observação única é mapeada para operação e a prazo", async () => {
    await preparar(); fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: "  combinado dia 10  " } }); fireEvent.click(confirmar());
    await waitFor(() => expect(mocks.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1)); const input = mocks.registrarRecebimentoMistoOSV3.mock.calls[0][2]; expect(input.observacao).toBe("combinado dia 10"); expect(input.saldoAPrazo.observacao).toBe(input.observacao);
  });
  it("header abre o mesmo modal e Escape devolve foco", async () => {
    render(<Harness />); await waitFor(() => expect(screen.queryByText("Carregando sessão de caixa…")).toBeNull()); const header = screen.getByRole("button", { name: "Abrir pelo header" }); header.focus(); fireEvent.click(header);
    await screen.findByRole("dialog"); fireEvent.keyDown(screen.getByLabelText("Forma da linha 1"), { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(header);
  });
  it("T19: comprovante V4 separa recebido 350 e a prazo 50, data civil e sem Quitação", () => {
    const v = { reciboOpen: true, closeRecibo: vi.fn(), pdvServico: { ultimoRecibo: recibo() as ComprovanteReciboV3 } } as unknown as V4Vals;
    render(<ReciboModal v={v} />); const text = document.body.textContent;
    expect(text).toMatch(/Recebido nesta operaçãoR\$\s350,00/); expect(text).toMatch(/Saldo a prazo: R\$\s50,00/); expect(text).toContain("31/12/2099"); expect(text).toContain("Pagamento parcial — saldo a prazo"); expect(text).not.toContain("Quitação");
  });
  it("T13: após receber os 50, projeção PAID não mantém parcela ou a prazo ativo", () => {
    const p = projectFinancialOSV4({ storeId: "loja-qa", osId: "os-a", prismaValorTotal: 400, loadedAt: "2026-10-04T15:00:00Z", payload: { ...os, valorTotal: 400, orcamento: { id: "orc-qa", status: "aprovado", total: 400, pecas: [], servicos: [{ id: "s1", descricao: "Serviço QA", valor: 400 }], desconto: 0, criadoEm: "2026-10-01T15:00:00Z" }, aPrazoV3: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true } }, titulo: { id: "titulo-qa", storeId: "loja-qa", localKey: "os-faturamento:loja-qa:os-a", valor: 400, status: "pago", payload: { historico: [{ tipo: "pagamento", valor: 350 }, { tipo: "pagamento", valor: 50 }] } } });
    expect(p).toMatchObject({ financialStatus: "PAID", balance: 0, installments: [] });
  });
  it("R1: recusa conserva o rascunho durante a recarga e aceita a nova distribuição de 380", async () => {
    mocks.registrarRecebimentoMistoOSV3.mockResolvedValueOnce({ ok: false, code: "saldo_divergente", mensagem: "Saldo mudou para R$ 380,00.", naoRegistrada: true });
    const view = await abrir({ stage: true }); linha(1, "debito", "350"); dividir(); linha(2, "a_prazo"); prazo();
    fireEvent.click(confirmar()); await screen.findByText("Saldo mudou para R$ 380,00.");
    view.rerender(<Harness stage financialLoading />); expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<Harness stage saldoProjetado={380} />); await screen.findByRole("dialog");
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("350");
    expect((screen.getByLabelText("Valor da linha 2") as HTMLInputElement).value).toBe("50,00");
    fireEvent.click(screen.getAllByRole("button", { name: "Usar restante" })[1]);
    expect((screen.getByLabelText("Valor da linha 2") as HTMLInputElement).value).toBe("30,00"); expect(disabled()).toBe(false);
    fireEvent.click(confirmar()); await waitFor(() => expect(abrirRecibo).toHaveBeenCalledTimes(1));
    const [recusado, corrigido] = mocks.registrarRecebimentoMistoOSV3.mock.calls;
    expect(corrigido[2]).toMatchObject({ saldoEsperado: 380, pagamentosAgora: [{ forma: "debito", valor: 350 }], saldoAPrazo: { valor: 30, vencimento: VENC } });
    expect(corrigido[2].operacaoId).not.toBe(recusado[2].operacaoId);
  });
  it("R1: abertura pelo header aguarda a projeção e semeia o saldo carregado", async () => {
    const view = render(<Harness financialLoading />); fireEvent.click(screen.getByRole("button", { name: "Abrir pelo header" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<Harness saldoProjetado={380} />); await screen.findByRole("dialog");
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("380");
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item E): sem forma, nada é confirmado; escolhida, libera.
    expect((screen.getByRole("button", { name: "Escolha a forma de pagamento" }) as HTMLButtonElement).disabled).toBe(true);
    linha(1, "pix"); expect(disabled()).toBe(false);
  });
  it("R1: 100% a prazo apresenta resumo de formalização, sem rotular recibo de pagamento", () => {
    const formalizacao = montarComprovanteMistoV3({ os, pagamentosAgora: [], valorRecebidoAgora: 0, recebidoAnteriormente: 0, pagamento: { total: 400, recebido: 0, saldo: 400, status: "aberto" }, aPrazo: { valor: 400, vencimento: VENC }, operador: "QA", dataHora: "2026-10-04T15:00:00Z" });
    expect(formalizacao.tipoComprovante).toBe("formalizacao_a_prazo");
    render(<ReciboModal v={{ reciboOpen: true, closeRecibo: vi.fn(), pdvServico: { ultimoRecibo: formalizacao } } as unknown as V4Vals} />);
    expect(screen.getByText("🧾 Resumo de formalização a prazo", { exact: true })).toBeTruthy();
    expect(screen.queryByText("🧾 Recibo de pagamento", { exact: true })).toBeNull();
    expect(document.body.textContent).toMatch(/Recebido nesta operaçãoR\$\s0,00/);
  });

  it("T20 (OPS-RECEBIMENTO-MISTO-P1-HARDENING-001): A termina com o operador já em B — B não recebe efeito de A e o rascunho de B fica", async () => {
    const pendente = deferred<ReturnType<typeof resultado>>(); mocks.registrarRecebimentoMistoOSV3.mockReturnValue(pendente.promise);
    const view = await preparar(); fireEvent.click(confirmar());
    view.rerender(<Harness osId="os-b" />);
    await waitFor(() => expect(screen.queryByText("Carregando sessão de caixa…")).toBeNull()); fireEvent.click(screen.getByRole("button", { name: /^Receber R/ })); await screen.findByRole("dialog");
    // Enquanto a confirmação de A está em voo, a folha de B fica travada (nenhuma edição a perder).
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).disabled).toBe(true);
    await act(async () => pendente.resolve(resultado()));
    expect(abrirRecibo).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeTruthy();
    // B continua com o próprio saldo (400), sem nada de A; o operador digita e o rascunho fica.
    await waitFor(() => expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).disabled).toBe(false));
    expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("400");
    linha(1, "dinheiro", "120"); dividir(); linha(2, "a_prazo"); prazo();
    await act(async () => { await Promise.resolve(); });
    expect((screen.getByLabelText("Forma da linha 1") as HTMLSelectElement).value).toBe("dinheiro"); expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("Forma da linha 2") as HTMLSelectElement).value).toBe("a_prazo"); expect((screen.getByLabelText("Vencimento da parte a prazo") as HTMLInputElement).value).toBe(VENC);
    expect(mocks.registrarRecebimentoMistoOSV3.mock.calls.map((c) => c[1])).toEqual(["os-a"]);
  });
});
