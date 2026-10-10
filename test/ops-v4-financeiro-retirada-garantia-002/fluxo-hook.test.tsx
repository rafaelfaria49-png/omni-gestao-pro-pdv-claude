// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 — B6 · hook REAL da V4 (useV4Preview) com o hook
// REAL da V3 e as actions "use server" substituídas por espiões controláveis. Prova a LIGAÇÃO
// do "Aprovar e receber" e da formalização: resposta tardia de outra OS/loja nunca recebe,
// nunca mexe na seleção nova; aprovação e recebimento são chamadas separadas (sem rollback
// fictício); o modo encadeado não sobrevive à troca de OS.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ loja: "loja-qa-frg2" as string | null }));
const m = vi.hoisted(() => ({
  listOrdens: vi.fn(),
  getOrdem: vi.fn(),
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(async () => []),
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  aprovarOrcamentoParaReceberV3: vi.fn(),
  conferirEscopoAprovacaoV3: vi.fn(),
  conferirFormalizacaoAprovacaoV3: vi.fn(),
  formalizarAprovacaoPendenteV3: vi.fn(),
}));

vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.loja }), registrarGuardaTrocaLojaV4: vi.fn() }));
vi.mock("@/app/actions/ordens", () => ({ listOrdens: m.listOrdens, getOrdem: m.getOrdem }));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: m.lerProjecaoFinanceiraOSV4,
  lerProjecoesFinanceirasOSV4: m.lerProjecoesFinanceirasOSV4,
}));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: true, sessaoId: "sessao-qa" })),
  lerPagamentoOSV3: m.lerPagamentoOSV3,
  receberOSV3: m.receberOSV3,
  estornarRecebimentoOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: vi.fn(),
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: vi.fn(), salvarAssinaturaRetiradaV3: vi.fn(), adicionarFotoSaidaV3: vi.fn(), removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), corrigirOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn(), aprovarOrcamentoV3: vi.fn(),
  aprovarOrcamentoParaReceberV3: m.aprovarOrcamentoParaReceberV3,
  conferirEscopoAprovacaoV3: m.conferirEscopoAprovacaoV3,
  conferirFormalizacaoAprovacaoV3: m.conferirFormalizacaoAprovacaoV3,
  formalizarAprovacaoPendenteV3: m.formalizarAprovacaoPendenteV3,
}));
vi.mock("@/lib/operacoes-v3/status-actions", () => ({ aplicarTransicaoStatusV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/prova-entrada-actions", () => ({
  salvarIdentificacaoV3: vi.fn(), salvarProvaEntradaV3: vi.fn(), salvarAcessoriosEntradaV3: vi.fn(),
  adicionarFotoEntradaV3: vi.fn(), removerFotoEntradaV3: vi.fn(), salvarAssinaturaClienteV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/dados-basicos-actions", () => ({ salvarDadosBasicosOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/producao-actions", () => ({
  atribuirTecnicoV3: vi.fn(), definirPrioridadeV3: vi.fn(), definirLocalFisicoV3: vi.fn(), adicionarObservacaoInternaV3: vi.fn(), salvarChecklistTecnicoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/estoque-actions", () => ({ consumirEstoqueOSActionV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({ abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ enviarOrcamentoPorCanalV3: vi.fn() }));
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { OrdemServico } from "@/types/os";
import { useV4Preview } from "@/components/operacoes-v4-preview/use-v4-preview";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";
import type { EntradaFormalizacaoV3, EscopoFormalizacaoV3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";

const LOJA = "loja-qa-frg2";

function os(id: string): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: "pronta", operacaoStatusV3: "pronta",
    cliente: { nome: `Cliente ${id}` }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA" },
    criadoEm: "2026-10-01T12:00:00.000Z", prioridade: "media",
    orcamento: { id: "orc", status: "rascunho", sintetizado: false, total: 300, desconto: 0, criadoEm: "2026-10-01T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
    timeline: [],
  } as unknown as OrdemServico;
}
const A = os("a");
const B = os("b");
const proj = (o: OrdemServico, loja = LOJA) =>
  projectFinancialOSV4({ storeId: loja, osId: o.id, prismaValorTotal: 300, loadedAt: "2026-10-09T12:00:00Z", payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 300 } as never, titulo: null });

function adiado<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

beforeEach(() => {
  localStorage.clear();
  h.loja = LOJA;
  for (const fn of Object.values(m)) fn.mockReset();
  m.listOrdens.mockImplementation(async () => [A, B]);
  m.getOrdem.mockImplementation(async (_sid: string, id: string) => (id === "a" ? A : id === "b" ? B : null));
  m.lerProjecaoFinanceiraOSV4.mockImplementation(async (sid: string, id: string) => proj(id === "a" ? A : B, sid));
  m.lerProjecoesFinanceirasOSV4.mockImplementation(async () => []);
  m.lerPagamentoOSV3.mockImplementation(async () => ({ total: 300, recebido: 0, saldo: 300, status: "aberto", sessao: { aberta: true, sessaoId: "sessao-qa" }, aPrazo: null }));
});
afterEach(() => cleanup());

async function montarComOS(id: "a" | "b") {
  const r = renderHook(() => useV4Preview());
  await waitFor(() => expect(r.result.current.ordens.length).toBe(2));
  await act(async () => r.result.current.selectOS(id === "a" ? A : B, "orcamento"));
  await waitFor(() => expect(r.result.current.realOS?.id).toBe(id));
  await waitFor(() => expect(r.result.current.financial.projection?.osId).toBe(id));
  await waitFor(() => expect(r.result.current.pdvServico.loading).toBe(false));
  return r;
}

const ESCOPO = { conteudo: "conteudo-conferido-a" };

describe("B6 · 'Aprovar e receber' — alvo, ordem e falha parcial (hook real)", () => {
  it("R1-P1: A→B→A antes da resposta da aprovação: a continuação da visita anterior NUNCA recebe", async () => {
    const r = await montarComOS("a");
    const pendente = adiado<{ ok: true }>();
    m.aprovarOrcamentoParaReceberV3.mockReturnValue(pendente.promessa);
    const receber = vi.fn(async () => ({ ok: true as const }));
    let promessa!: Promise<unknown>;
    act(() => { promessa = r.result.current.aprovacaoReceber.executar!(receber, ESCOPO); });
    await act(async () => r.result.current.selectOS(B, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("b"));
    await act(async () => r.result.current.selectOS(A, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("a"));
    await act(async () => pendente.resolver({ ok: true }));
    expect(await promessa).toEqual({ status: "fora_do_alvo" });
    expect(receber).not.toHaveBeenCalled();
    expect(m.receberOSV3).not.toHaveBeenCalled();
  });

  it("conferência do escopo: devolve o servidor; resposta de outra OS fica fora do alvo", async () => {
    const r = await montarComOS("a");
    m.conferirEscopoAprovacaoV3.mockResolvedValueOnce({ ok: true, escopo: { orcamentoId: "orc", revisao: 0, linhas: [], totalCentavos: 30000, conteudo: "c-a" } });
    await expect(r.result.current.aprovacaoReceber.conferir!()).resolves.toMatchObject({ ok: true, escopo: { conteudo: "c-a" } });
    expect(m.conferirEscopoAprovacaoV3).toHaveBeenCalledWith(LOJA, "a");
    const pendente = adiado<unknown>();
    m.conferirEscopoAprovacaoV3.mockReturnValueOnce(pendente.promessa);
    let promessa!: Promise<unknown>;
    act(() => { promessa = r.result.current.aprovacaoReceber.conferir!(); });
    await act(async () => r.result.current.selectOS(B, "orcamento"));
    await act(async () => pendente.resolver({ ok: true, escopo: { conteudo: "c-a" } }));
    expect(await promessa).toMatchObject({ ok: false, foraDoAlvo: true });
  });

  it("oferta e modo pertencem à loja+OS: trocar de OS encerra o modo e ele não ressurge ao voltar", async () => {
    const r = await montarComOS("a");
    expect(r.result.current.aprovacaoReceber.disponivel).toBe(true);
    act(() => r.result.current.aprovacaoReceber.abrir());
    expect(r.result.current.aprovacaoReceber).toMatchObject({ ativo: true, estado: "conferir" });
    expect(r.result.current.receberPagamentoOpen).toBe(true);
    await act(async () => r.result.current.selectOS(B, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("b"));
    expect(r.result.current.aprovacaoReceber.ativo).toBe(false);
    await act(async () => r.result.current.selectOS(A, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("a"));
    act(() => r.result.current.openReceberPagamentoAqui());
    expect(r.result.current.aprovacaoReceber.ativo).toBe(false);
  });

  it("aprovação ok e pagamento falho: as duas chamadas são separadas; resultado 'aprovado, pagamento não confirmado'", async () => {
    const r = await montarComOS("a");
    m.aprovarOrcamentoParaReceberV3.mockResolvedValue({ ok: true });
    const receber = vi.fn(async () => ({ ok: false as const, mensagem: null }));
    let resultado: unknown;
    await act(async () => { resultado = await r.result.current.aprovacaoReceber.executar!(receber, ESCOPO); });
    expect(m.aprovarOrcamentoParaReceberV3).toHaveBeenCalledWith(LOJA, "a", ESCOPO);
    expect(receber).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ status: "aprovado_pagamento_nao_confirmado", mensagem: null });
  });

  it("aprovação recusada no servidor: o motivo DEVOLVIDO por ele (legível em produção), recebimento NUNCA chamado", async () => {
    const r = await montarComOS("a");
    m.aprovarOrcamentoParaReceberV3.mockResolvedValue({ ok: false, mensagem: "Este orçamento venceu em 20/09/2026." });
    const receber = vi.fn();
    let resultado: unknown;
    await act(async () => { resultado = await r.result.current.aprovacaoReceber.executar!(receber, ESCOPO); });
    expect(resultado).toEqual({ status: "aprovacao_recusada", mensagem: "Este orçamento venceu em 20/09/2026." });
    expect(receber).not.toHaveBeenCalled();
  });

  it("aprovação sem resposta (transporte): nada é recebido; orientação para conferir antes de repetir", async () => {
    const r = await montarComOS("a");
    m.aprovarOrcamentoParaReceberV3.mockRejectedValue(new TypeError("Failed to fetch"));
    const receber = vi.fn();
    let resultado: unknown;
    await act(async () => { resultado = await r.result.current.aprovacaoReceber.executar!(receber, ESCOPO); });
    expect(resultado).toMatchObject({ status: "aprovacao_recusada", mensagem: expect.stringMatching(/^Sem resposta do servidor: não foi possível confirmar a aprovação./) });
    expect(receber).not.toHaveBeenCalled();
    expect(m.receberOSV3).not.toHaveBeenCalled();
  });

  it.each(["os", "loja"])("aprovação de A responde com o operador já em outra %s: nada é recebido", async (alvo) => {
    const r = await montarComOS("a");
    const pendente = adiado<{ ok: true }>();
    m.aprovarOrcamentoParaReceberV3.mockReturnValue(pendente.promessa);
    const receber = vi.fn(async () => ({ ok: true as const }));
    let promessa!: Promise<unknown>;
    act(() => { promessa = r.result.current.aprovacaoReceber.executar!(receber, ESCOPO); });
    if (alvo === "os") {
      await act(async () => r.result.current.selectOS(B, "orcamento"));
    } else {
      h.loja = "loja-b";
      r.rerender();
    }
    await act(async () => pendente.resolver({ ok: true }));
    expect(await promessa).toEqual({ status: "fora_do_alvo" });
    expect(receber).not.toHaveBeenCalled();
    expect(m.receberOSV3).not.toHaveBeenCalled();
  });
});

describe("B6 · formalização — resposta tardia e resultado incerto (hook real)", () => {
  const escopo = { versao: 1 } as unknown as EscopoFormalizacaoV3;
  const entrada: EntradaFormalizacaoV3 = { operacaoId: "op-formaliza-b6", motivo: "Cliente aprovou no balcão.", declaracaoAceita: true, escopo };

  it("conferência que volta depois da troca de OS: fora do alvo (nunca descreve a OS nova)", async () => {
    const r = await montarComOS("a");
    const pendente = adiado<unknown>();
    m.conferirFormalizacaoAprovacaoV3.mockReturnValue(pendente.promessa);
    let promessa!: Promise<unknown>;
    act(() => { promessa = r.result.current.formalizacao.conferir!(); });
    await act(async () => r.result.current.selectOS(B, "orcamento"));
    await act(async () => pendente.resolver({ ok: true, escopo, vencido: false, declaracao: "x" }));
    expect(await promessa).toMatchObject({ ok: false, code: "fora_do_alvo" });
    expect(m.conferirFormalizacaoAprovacaoV3).toHaveBeenCalledWith(LOJA, "a");
  });

  it("formalização que volta depois da troca de loja: fora do alvo; a chamada foi para A", async () => {
    const r = await montarComOS("a");
    const pendente = adiado<unknown>();
    m.formalizarAprovacaoPendenteV3.mockReturnValue(pendente.promessa);
    let promessa!: Promise<unknown>;
    act(() => { promessa = r.result.current.formalizacao.formalizar!(entrada); });
    h.loja = "loja-b";
    r.rerender();
    await act(async () => pendente.resolver({ ok: true, jaRegistrado: false, operacaoId: entrada.operacaoId, formalizadoEm: "x", formalizadoPor: "y" }));
    expect(await promessa).toMatchObject({ ok: false, code: "fora_do_alvo" });
    expect(m.formalizarAprovacaoPendenteV3).toHaveBeenCalledWith(LOJA, "a", entrada);
  });

  it("falha de transporte: resultado INCERTO (reenviar a mesma chave), nunca sucesso nem recusa inventados", async () => {
    const r = await montarComOS("a");
    m.formalizarAprovacaoPendenteV3.mockRejectedValue(new Error("fetch failed"));
    let resultado: unknown;
    await act(async () => { resultado = await r.result.current.formalizacao.formalizar!(entrada); });
    expect(resultado).toMatchObject({ ok: false, code: "incerto", mensagem: expect.stringMatching(/MESMA confirmação/) });
  });
});

describe("R2-P1 · recebimento imediato sem resposta (hook real da V3 dentro da V4)", () => {
  const resultadoOk = (recebido: number) => ({
    os: A, pagamento: { total: 300, recebido, saldo: 300 - recebido, status: "parcial" }, valorRecebido: recebido, op: "parcial", recibo: { itens: [] }, jaRegistrado: true,
  });

  it("sem resposta: alteração é bloqueada; a ação explícita verifica a confirmação ORIGINAL", async () => {
    const r = await montarComOS("a");
    m.receberOSV3.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let ok: unknown;
    await act(async () => { ok = await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 100 }], sessaoId: "sessao-1", intencao: "parcial" }); });
    expect(ok).toBe(false);
    await waitFor(() => expect(r.result.current.pdvServico.pendenciaReceber).toMatchObject({ input: { sessaoId: "sessao-1", linhas: [{ forma: "pix", valor: 100 }] } }));
    const original = m.receberOSV3.mock.calls[0]![2] as { operacaoId: string };
    expect(original.operacaoId).toMatch(/\S/);
    m.receberOSV3.mockResolvedValueOnce(resultadoOk(100));
    await act(async () => { ok = await r.result.current.pdvServico.receber({ linhas: [{ forma: "dinheiro", valor: 50 }], sessaoId: "sessao-2", intencao: "parcial" }); });
    expect(ok).toBe(false);
    expect(m.receberOSV3).toHaveBeenCalledTimes(1);
    await act(async () => { ok = await r.result.current.pdvServico.verificarConfirmacao!(); });
    expect(ok).toBe(true);
    expect(m.receberOSV3.mock.calls[1]![2]).toEqual(original);
    expect(r.result.current.pdvServico.pendenciaReceber).toBeNull();
  });

  it("recusa terminal estruturada e cercada libera a próxima confirmação com conteúdo novo", async () => {
    const r = await montarComOS("a");
    m.receberOSV3.mockImplementationOnce(async (_s: string, _o: string, input: { operacaoId: string }) => ({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: input.operacaoId, requestFingerprint: "prova-da-recusa-cercada", mensagem: "Saldo alterado. Confira." }));
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 100 }], sessaoId: "sessao-1", intencao: "parcial" }); });
    expect(r.result.current.pdvServico.pendenciaReceber).toBeNull();
    m.receberOSV3.mockResolvedValueOnce(resultadoOk(50));
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "dinheiro", valor: 50 }], sessaoId: "sessao-2", intencao: "parcial" }); });
    expect(m.receberOSV3.mock.calls[1]![2]).toMatchObject({ linhas: [{ forma: "dinheiro", valor: 50 }], sessaoId: "sessao-2" });
  });

  it("pendência pertence à OS: trocar de OS e voltar não a perde nem a aplica em outra OS", async () => {
    const r = await montarComOS("a");
    m.receberOSV3.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 100 }], sessaoId: "sessao-1", intencao: "parcial" }); });
    await act(async () => r.result.current.selectOS(B, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("b"));
    expect(r.result.current.pdvServico.pendenciaReceber).toBeNull();
    await act(async () => r.result.current.selectOS(A, "orcamento"));
    await waitFor(() => expect(r.result.current.realOS?.id).toBe("a"));
    expect(r.result.current.pdvServico.pendenciaReceber).toMatchObject({ input: { sessaoId: "sessao-1" } });
  });
});
