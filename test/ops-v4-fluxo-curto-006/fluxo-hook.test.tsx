// OPS-V4-FLUXO-CURTO-006 — hook REAL da V4 (useV4Preview) com o hook REAL da V3
// (usePdvServicoV3) e as actions "use server" substituídas por espiões. Prova a
// LIGAÇÃO: pagar nunca chama a entrega, a leitura do servidor é refeita só no
// sucesso, "Retirado por" chega à action canônica, estorno invalida o recibo da
// sessão, superfícies abertas para uma OS não ressurgem nem contaminam outra, e
// a resposta de A (OS ou loja) não produz efeito em B.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ loja: "loja-qa-006" as string | null }));
const m = vi.hoisted(() => ({
  listOrdens: vi.fn(),
  getOrdem: vi.fn(),
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(async () => []),
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: vi.fn(),
  registrarEntregaV3: vi.fn(),
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
  estornarRecebimentoOSV3: m.estornarRecebimentoOSV3,
  registrarRecebimentoMistoOSV3: m.registrarRecebimentoMistoOSV3,
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: m.registrarEntregaV3,
  salvarAssinaturaRetiradaV3: vi.fn(),
  adicionarFotoSaidaV3: vi.fn(),
  removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), corrigirOrcamentoV3: vi.fn(), aprovarOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn(),
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
import { montarComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";

const LOJA = "loja-qa-006";

function os(id: string, loja = LOJA): OrdemServico {
  return {
    id, storeId: loja, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: "pronta", operacaoStatusV3: "pronta",
    cliente: { nome: `Cliente ${id}` }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA" },
    criadoEm: "2026-10-01T12:00:00.000Z", prioridade: "media",
    orcamento: { id: "orc", status: "aprovado", total: 300, desconto: 0, criadoEm: "2026-10-01T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
    timeline: [],
  } as unknown as OrdemServico;
}
// "Servidor" em memória: como os writers reais, o recebimento grava o comprovante na
// timeline da OS e o pagamento (com a identidade) no histórico do título; o estorno
// grava o evento na OS e o estorno referenciado no título.
type Hist = Array<Record<string, unknown>>;
let timelines: Record<string, unknown[]> = {};
let historicos: Record<string, Hist> = {};
let seqServidor = 0;
const osAtual = (id: string) => ({ ...(id === "a" ? A : B), timeline: [...(timelines[id] ?? [])] }) as unknown as OrdemServico;
const proj = (o: OrdemServico, recebido: number, loja = LOJA) =>
  projectFinancialOSV4({
    storeId: loja, osId: o.id, prismaValorTotal: 300, loadedAt: "2026-10-08T12:00:00Z",
    payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 300 } as never,
    titulo: { id: "cr", storeId: loja, localKey: `os-faturamento:${loja}:${o.id}`, valor: 300, status: recebido >= 300 ? "pago" : recebido > 0 ? "parcial" : "pendente", payload: { ordemServicoId: o.id, historico: [...(historicos[o.id] ?? [])] } },
  });
const leitura = (recebido: number) => ({ total: 300, recebido, saldo: 300 - recebido, status: recebido >= 300 ? "quitado" : recebido > 0 ? "parcial" : "aberto", sessao: { aberta: true, sessaoId: "sessao-qa" }, aPrazo: null });
const recibo = (o: OrdemServico) => montarComprovanteReciboV3({ os: o, linhas: [{ forma: "pix", valor: 300 }], valorPago: 300, pagamento: { total: 300, recebido: 300, saldo: 0, status: "quitado" } as never, intencaoLabel: "Quitação", operador: "QA", dataHora: `2026-10-08T12:00:${String(++seqServidor).padStart(2, "0")}.000Z` });
/** Efeitos persistidos de um recebimento de 300 na OS `id` (comprovante + pagamento identificado). */
function gravarRecebimento(id: string, operacaoId: string) {
  const rec = recibo(id === "a" ? A : B);
  (historicos[id] ??= []).push({ tipo: "liquidacao", valor: 300, loteId: operacaoId });
  (timelines[id] ??= []).push({ id: `ev-${++seqServidor}`, tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: rec.dataHora, metadata: { operacaoId, comprovante: rec } });
  recebidoPorOS[id] = 300;
  return rec;
}

let recebidoPorOS: Record<string, number> = {};
const A = os("a");
const B = os("b");

beforeEach(() => {
  h.loja = LOJA;
  recebidoPorOS = { a: 0, b: 0 };
  timelines = { a: [], b: [] };
  historicos = { a: [], b: [] };
  for (const fn of Object.values(m)) fn.mockReset();
  m.listOrdens.mockImplementation(async () => [osAtual("a"), osAtual("b")]);
  m.getOrdem.mockImplementation(async (_sid: string, id: string) => (id === "a" || id === "b" ? osAtual(id) : null));
  m.lerProjecaoFinanceiraOSV4.mockImplementation(async (sid: string, id: string) => proj(osAtual(id), recebidoPorOS[id] ?? 0, sid));
  m.lerProjecoesFinanceirasOSV4.mockImplementation(async () => []);
  m.lerPagamentoOSV3.mockImplementation(async (_sid: string, id: string) => leitura(recebidoPorOS[id] ?? 0));
  m.receberOSV3.mockImplementation(async (_sid: string, id: string, input: { operacaoId: string }) => {
    const rec = gravarRecebimento(id, input.operacaoId);
    return { pagamento: leitura(300), recibo: rec, os: osAtual(id), valorRecebido: 300, op: "liquidar" };
  });
  m.estornarRecebimentoOSV3.mockImplementation(async (_sid: string, id: string) => {
    const hist = (historicos[id] ??= []);
    hist.push({ tipo: "estorno_pagamento", valor: 300, refHistoricoIndex: hist.length - 1 });
    (timelines[id] ??= []).push({ id: `ev-${++seqServidor}`, tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T13:00:00Z", metadata: { estornado: 300, modo: "ultimo_pagamento" } });
    recebidoPorOS[id] = 0;
    return { pagamento: leitura(0), os: osAtual(id), estornado: 300 };
  });
  m.registrarEntregaV3.mockImplementation(async () => A);
});
afterEach(() => cleanup());

async function montarComOS(id: "a" | "b") {
  const r = renderHook(() => useV4Preview());
  await waitFor(() => expect(r.result.current.ordens.length).toBe(2));
  await act(async () => r.result.current.selectOS(id === "a" ? A : B, "entrega"));
  await waitFor(() => expect(r.result.current.realOS?.id).toBe(id));
  await waitFor(() => expect(r.result.current.financial.projection?.osId).toBe(id));
  await waitFor(() => expect(r.result.current.pdvServico.loading).toBe(false));
  return r;
}

describe("OPS-V4-FLUXO-CURTO-006 — ligação real (useV4Preview + usePdvServicoV3)", () => {
  it("receber na Entrega: só o contrato de recebimento; relê o servidor; NUNCA chama a entrega", async () => {
    const r = await montarComOS("a");
    act(() => r.result.current.openReceberPagamentoAqui());
    expect(r.result.current.receberPagamentoOpen).toBe(true);
    expect(r.result.current.stage).toBe("entrega");
    const leiturasAntes = m.lerProjecaoFinanceiraOSV4.mock.calls.length;
    let ok = false;
    await act(async () => { ok = await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    expect(ok).toBe(true);
    expect(m.receberOSV3).toHaveBeenCalledTimes(1);
    expect(m.receberOSV3.mock.calls[0]![0]).toBe(LOJA);
    expect(m.receberOSV3.mock.calls[0]![1]).toBe("a");
    await waitFor(() => expect(m.lerProjecaoFinanceiraOSV4.mock.calls.length).toBeGreaterThan(leiturasAntes));
    await waitFor(() => expect(r.result.current.retirada.financeiro.situacao).toBe("quitado"));
    expect(r.result.current.entregaAcoes.podeConfirmar).toBe(true);
    expect(m.registrarEntregaV3).not.toHaveBeenCalled();
    expect(r.result.current.pdvServico.ultimoRecibo?.numeroOS).toBe("OS-A");
  });

  it("confirmar entrega envia 'Retirado por' e a data à action canônica", async () => {
    gravarRecebimento("a", "op-anterior");
    const r = await montarComOS("a");
    await act(async () => { await r.result.current.confirmarEntrega(undefined, undefined, "Portador QA"); });
    expect(m.registrarEntregaV3).toHaveBeenCalledTimes(1);
    expect(m.registrarEntregaV3).toHaveBeenCalledWith(LOJA, "a", { recebidoPor: "Portador QA" });
  });

  it("estorno com sucesso invalida o comprovante da sessão (o estornado não é reoferecido)", async () => {
    const r = await montarComOS("a");
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    expect(r.result.current.pdvServico.ultimoRecibo).not.toBeNull();
    await act(async () => { await r.result.current.pdvServico.estornar({ sessaoId: "sessao-qa", motivo: "QA estorno" }); });
    expect(r.result.current.pdvServico.ultimoRecibo).toBeNull();
    await waitFor(() => expect(r.result.current.retirada.financeiro.situacao).toBe("saldo_aberto"));
    expect(r.result.current.entregaAcoes.podeConfirmar).toBe(false);
  });

  it("S05 superfícies abertas para A não aparecem em B nem ressurgem ao voltar para A", async () => {
    const r = await montarComOS("a");
    act(() => r.result.current.openRecibo());
    act(() => r.result.current.openEstornoRecebimento());
    expect(r.result.current.reciboOpen && r.result.current.estornoRecebimentoOpen).toBe(true);
    await act(async () => r.result.current.selectOS(B, "entrega"));
    expect(r.result.current.reciboOpen || r.result.current.estornoRecebimentoOpen || r.result.current.receberPagamentoOpen).toBe(false);
    await act(async () => r.result.current.selectOS(A, "entrega"));
    expect(r.result.current.reciboOpen || r.result.current.estornoRecebimentoOpen).toBe(false);
  });

  it("S05 resposta do recebimento de A com o operador já em B: B não recebe recibo, saldo nem leitura de A", async () => {
    let soltar!: () => void;
    m.receberOSV3.mockImplementationOnce(
      (_sid: string, id: string) =>
        new Promise((resolve) => {
          soltar = () => {
            const rec = gravarRecebimento(id, "op-a-em-voo");
            resolve({ pagamento: leitura(300), recibo: rec, os: osAtual(id), valorRecebido: 300, op: "liquidar" });
          };
        }),
    );
    const r = await montarComOS("a");
    let promessa!: Promise<boolean>;
    act(() => { promessa = r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    await act(async () => r.result.current.selectOS(B, "entrega"));
    await waitFor(() => expect(r.result.current.financial.projection?.osId).toBe("b"));
    await act(async () => { soltar(); await promessa; });
    expect(r.result.current.realOS?.id).toBe("b");
    expect(r.result.current.pdvServico.ultimoRecibo).toBeNull();
    expect(r.result.current.reciboOpen).toBe(false);
    expect(r.result.current.retirada.financeiro.situacao).toBe("saldo_aberto");
    expect(r.result.current.toast).not.toMatch(/pagamento/i);
    expect(m.registrarEntregaV3).not.toHaveBeenCalled();
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — regressões da R1 (hook real)", () => {
  it("R1-P1b estorno de A responde com o operador em B: devolve false, B mantém recibo e modal, sem releitura de B", async () => {
    gravarRecebimento("a", "op-anterior");
    let soltar!: () => void;
    m.estornarRecebimentoOSV3.mockImplementationOnce(
      (_sid: string, id: string) =>
        new Promise((resolve) => {
          soltar = () => {
            historicos[id]!.push({ tipo: "estorno_pagamento", valor: 300, refHistoricoIndex: 0 });
            timelines[id]!.push({ id: "ev-estorno-a", tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T13:00:00Z", metadata: { estornado: 300, modo: "ultimo_pagamento" } });
            recebidoPorOS[id] = 0;
            resolve({ pagamento: leitura(0), os: osAtual(id), estornado: 300 });
          };
        }),
    );
    const r = await montarComOS("a");
    let estornoA!: Promise<boolean>;
    act(() => { estornoA = r.result.current.pdvServico.estornar({ sessaoId: "sessao-qa", motivo: "QA estorno A" }); });
    await act(async () => r.result.current.selectOS(B, "entrega"));
    await waitFor(() => expect(r.result.current.financial.projection?.osId).toBe("b"));
    await waitFor(() => expect(r.result.current.pdvServico.loading).toBe(false));
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    expect(r.result.current.pdvServico.ultimoRecibo?.numeroOS).toBe("OS-B");
    act(() => r.result.current.openEstornoRecebimento());
    expect(r.result.current.estornoRecebimentoOpen).toBe(true);
    const leiturasB = m.lerProjecaoFinanceiraOSV4.mock.calls.filter((c) => c[1] === "b").length;
    let resultadoA: boolean | undefined;
    await act(async () => { soltar(); resultadoA = await estornoA; });
    expect(resultadoA).toBe(false);
    expect(r.result.current.pdvServico.ultimoRecibo?.numeroOS).toBe("OS-B");
    expect(r.result.current.estornoRecebimentoOpen).toBe(true);
    expect(m.lerProjecaoFinanceiraOSV4.mock.calls.filter((c) => c[1] === "b").length).toBe(leiturasB);
  });

  it("R1-P1a estorno feito por OUTRA sessão: depois da releitura o comprovante da sessão deixa de ser oferecido", async () => {
    const r = await montarComOS("a");
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    await waitFor(() => expect(r.result.current.reciboAtual).toMatchObject({ estado: "disponivel", origem: "sessao" }));
    // Outro operador estorna fora desta sessão (só o título registra); a V4 relê o servidor.
    historicos.a!.push({ tipo: "estorno_pagamento", valor: 300, refHistoricoIndex: 0 });
    recebidoPorOS.a = 0;
    act(() => r.result.current.financial.reload());
    await waitFor(() => expect(r.result.current.financial.projection?.receivedTotal).toBe(0));
    expect(r.result.current.pdvServico.ultimoRecibo?.numeroOS).toBe("OS-A");
    expect(r.result.current.reciboAtual).toEqual({ estado: "sem_recebimento" });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — regressão da R2 (hook real)", () => {
  it("R2-P1 outro operador estorna e repõe o MESMO valor em dinheiro: a OS oferece o comprovante novo, nunca o PIX estornado da sessão", async () => {
    const r = await montarComOS("a");
    await act(async () => { await r.result.current.pdvServico.receber({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }); });
    await waitFor(() => expect(r.result.current.reciboAtual).toMatchObject({ estado: "disponivel", origem: "sessao" }));
    const pixDaSessao = r.result.current.pdvServico.ultimoRecibo;
    // Outro operador (outra sessão): estorno pela OS + reposição em dinheiro, mesmo acumulado.
    await m.estornarRecebimentoOSV3("loja-qa-006", "a", { sessaoId: "outra" });
    const dinheiro = montarComprovanteReciboV3({ os: A, linhas: [{ forma: "dinheiro", valor: 300 }], valorPago: 300, pagamento: { total: 300, recebido: 300, saldo: 0, status: "quitado" } as never, intencaoLabel: "Quitação", operador: "Outro", dataHora: "2026-10-08T14:00:00.000Z" });
    historicos.a!.push({ tipo: "liquidacao", valor: 300, loteId: "op-outro" });
    timelines.a!.push({ id: "ev-outro", tipo: "operacao_cobranca_gerada", autor: "Outro", conteudo: "", criadoEm: dinheiro.dataHora, metadata: { operacaoId: "op-outro", comprovante: dinheiro } });
    recebidoPorOS.a = 300;
    // Qualquer escrita desta OS relê detalhe e projeção (runWrite) — aqui uma gravação de garantia espiã.
    await act(async () => { await r.result.current.salvarGarantia({ modeloId: "tela" }); });
    await waitFor(() => expect(r.result.current.reciboAtual).toMatchObject({ estado: "disponivel", origem: "persistido" }));
    expect(r.result.current.pdvServico.ultimoRecibo).toEqual(pixDaSessao);
    const atual = r.result.current.reciboAtual;
    expect(atual.estado === "disponivel" && atual.recibo.formas.map((f) => f.forma)).toEqual(["dinheiro"]);
  });
});
