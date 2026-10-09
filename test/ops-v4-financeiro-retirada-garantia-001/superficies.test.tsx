// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — superfícies MONTADAS (jsdom).
//
// Próxima ação, Financeiro e Entrega REAIS sobre o `buildVals` REAL (estado V4 vivo,
// patches aplicados), com a projeção pura REAL e handlers espiões. As actions "use
// server" da V3 são cortadas por mock só para os módulos carregarem; nenhuma escrita
// acontece aqui (a persistência fica no .pg.test.ts). Massa sintética.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/app/actions/ordens", () => ({ listOrdens: vi.fn(async () => []), getOrdem: vi.fn(async () => null) }));
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
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  salvarAssinaturaRetiradaV3: vi.fn(), registrarEntregaV3: vi.fn(), adicionarFotoSaidaV3: vi.fn(), removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({ abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })), lerPagamentoOSV3: vi.fn(), receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(), lancarOSAPrazoV3: vi.fn(), registrarRecebimentoMistoOSV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({ lerProjecaoFinanceiraOSV4: vi.fn(), lerProjecoesFinanceirasOSV4: vi.fn() }));

import type { OrdemServico } from "@/types/os";
import type { V4State } from "@/components/operacoes-v4-preview/types";
import { buildVals, type V4DataCtx } from "@/components/operacoes-v4-preview/use-v4-preview";
import { EntregaStage } from "@/components/operacoes-v4-preview/parts/stages/EntregaStage";
import { FinanceiroStage } from "@/components/operacoes-v4-preview/parts/stages/FinanceiroStage";
import { ProximaAcaoV4 } from "@/components/operacoes-v4-preview/parts/ProximaAcaoV4";
import { EstornoRecebimentoModal } from "@/components/operacoes-v4-preview/parts/EstornoRecebimentoModal";
import { ModuleView } from "@/components/operacoes-v4-preview/parts/ModuleView";
import { projectFinancialOSV4, type FinancialProjectionOSV4 } from "@/lib/operacoes-v4/financial-projection";

const LOJA = "loja-qa-frg";
const EXPLICACAO = "O orçamento desta OS não está aprovado. A entrega continua bloqueada até a aprovação ser registrada.";

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function estado(over: Partial<V4State> = {}): V4State {
  return {
    view: "cockpit", module: "workspace", stage: "entrega", status: "pronta", left: false, right: false,
    menu: null, toast: "", prioridade: "normal", histFilter: "todos", novaOS: false, novoAtendimento: false,
    recibo: false, atendimentoRapido: false, orcamentoRapido: false, estornoRecebimento: false,
    receberPagamento: false, cancelamentoOS: false, selectedOsId: null, focus: true, authState: "autorizado",
    pin4: 0, pin6: 0, pattern: [], senha: "", motivo: "", docPrint: null, ...over,
  } as V4State;
}

function os(id: string, orcStatus: string, extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: "pronta",
    operacaoStatusV3: "pronta", cliente: { nome: "Cliente QA FRG" },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE", acessorios: ["Capa"] },
    criadoEm: "2026-09-18T12:00:00.000Z",
    orcamento: { id: "orc", status: orcStatus, sintetizado: false, total: 420, desconto: 0, criadoEm: "2026-09-18T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 420 }], pecas: [] },
    aberturaV3: { garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
    timeline: [{
      id: "ev-quitacao", tipo: "operacao_cobranca_gerada", autor: "Operador QA", autorTipo: "usuario",
      conteudo: "Quitação: Dinheiro R$ 420,00 (total R$ 420.00) · saldo R$ 0.00 (quitado).", criadoEm: "2026-10-05T21:37:38.000Z",
      metadata: { operacaoId: "op-1", total: 420, linhas: [{ forma: "dinheiro", valor: 420 }], op: "liquidar" },
    }],
    ...extra,
  } as unknown as OrdemServico;
}

type Titulo = { storeId?: string; status: string; historico: unknown[] } | null;
const LIQUIDADO: Titulo = { status: "pago", historico: [{ tipo: "liquidacao", valor: 420, loteId: "op-1", at: "2026-10-05T21:37:39.000Z", userLabel: "Operador QA" }] };

function projecao(o: OrdemServico, titulo: Titulo, over: Record<string, unknown> = {}): FinancialProjectionOSV4 {
  const loja = titulo?.storeId ?? LOJA;
  return projectFinancialOSV4({
    storeId: LOJA, osId: o.id, prismaValorTotal: 420, loadedAt: "2026-10-09T12:00:00Z",
    payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 420 } as unknown as OrdemServico & Record<string, unknown>,
    titulo: titulo ? { id: "cr", storeId: loja, localKey: `os-faturamento:${loja}:${o.id}`, valor: 420, status: titulo.status, payload: { ordemServicoId: o.id, historico: titulo.historico } } : null,
    ...over,
  });
}

type Pdv = V4DataCtx["pdvServico"];
const pdv = (): Pdv => ({
  pagamento: null, sessao: { aberta: true, sessaoId: "sessao-qa" }, loading: false, recebendo: false, estornando: false, error: null,
  ultimoRecibo: null, reload: vi.fn(), receber: vi.fn(async () => true), estornar: vi.fn(async () => true), limparRecibo: vi.fn(),
}) as Pdv;

const ctxBase = {
  ordens: [], ordensLoading: false, ordensPrimeiraCarga: false, ordensError: null,
  reloadOrdens: () => {}, reloadDetail: () => {}, realOS: null, detailLoading: false,
  financialProjectionsByOsId: new Map(), financialRailLoading: false, financialRailError: null,
  salvarDiagnostico: async () => false, gerarOrcamento: async () => false, salvarOrcamento: async () => false,
  corrigirOrcamento: async () => false, aprovarOrcamento: async () => false, recusarOrcamento: async () => false,
  iniciarDiagnostico: async () => false, iniciarServico: async () => false, marcarAguardandoPeca: async () => false,
  marcarPronta: async () => false, baixarEstoqueOS: async () => false, tecnicosCadastro: [], irParaConfiguracoes: () => {},
  salvarAssinaturaRetirada: async () => false, adicionarFotoSaida: async () => false,
  removerFotoSaida: async () => false, registrarImpressaoDoc: () => {}, salvarGarantia: async () => false,
  abrirRetorno: async () => false, finalizarRetorno: async () => false, abrirOsVinculada: () => {},
  lancarAPrazo: async () => false, cancelarOS: async () => false,
  salvarIdentificacao: async () => false, salvarProvaEntrada: async () => false, salvarAcessorios: async () => false,
  salvarChecklist: async () => false, adicionarFotoEntrada: async () => false, removerFotoEntrada: async () => false,
  salvarAssinaturaCliente: async () => false, salvarDadosBasicos: async () => false, atribuirTecnico: async () => false,
  removerTecnico: async () => false, definirPrioridade: async () => false, avancarStatusBancada: async () => false,
  entrarBancada: async () => false, sairBancada: async () => false, adicionarObservacaoInterna: async () => false,
  salvarChecklistTecnico: async () => false, moverStatusFila: async () => false, modoFila: "kanban",
  setModoFila: () => {}, enviarOrcamentoPorCanal: async () => ({ ok: false }), orcamentoRapidoPrefill: null,
  definirOrcamentoRapidoPrefill: () => {}, selecionarVarianteOrcamento: async () => false,
  cancelamentoMotivoPrefill: null, definirCancelamentoMotivoPrefill: () => {},
} as unknown as V4DataCtx;

interface Cenario {
  os: OrdemServico | null;
  fin: { projection: FinancialProjectionOSV4 | null; loading?: boolean; error?: string | null; reload?: () => void };
  stage?: V4State["stage"];
  pdv?: Pdv;
  /** Rev 3: abre o modal de estorno sobre a etapa. */
  estorno?: boolean;
  /** Rev 3: monta o rail "Recebimento da OS" (lista + projeções em lote da loja ativa). */
  rail?: { ordens: OrdemServico[]; projections: Map<string, FinancialProjectionOSV4>; loja?: string };
}

const patches: Array<Record<string, unknown>> = [];
const sonda: { v: ReturnType<typeof buildVals> | null } = { v: null };

function Harness({ c }: { c: Cenario }) {
  const [st, setSt] = useState<V4State>(() => estado({ selectedOsId: c.os?.id ?? null, stage: c.stage ?? "entrega", estornoRecebimento: !!c.estorno, alvoSuperficies: c.estorno ? JSON.stringify([c.rail?.loja ?? LOJA, c.os?.id ?? null]) : undefined, module: c.rail ? "pdv" : "workspace" }));
  const selecionado = c.os?.id ?? null;
  const atual = st.selectedOsId === selecionado ? st : { ...st, selectedOsId: selecionado };
  const v = buildVals(
    atual,
    (p) => {
      setSt((prev) => {
        const patch = (typeof p === "function" ? p(prev) : p) as Partial<V4State>;
        patches.push(patch as Record<string, unknown>);
        return { ...prev, ...patch };
      });
    },
    () => {},
    {
      ...ctxBase,
      lojaAtivaId: c.rail?.loja ?? LOJA,
      ordens: c.rail?.ordens ?? [],
      financialProjectionsByOsId: c.rail?.projections ?? new Map(),
      realOS: c.os,
      detailCarregada: !!c.os,
      financialProjection: { projection: c.fin.projection, loading: !!c.fin.loading, error: c.fin.error ?? null, reload: c.fin.reload ?? (() => {}) },
      pdvServico: c.pdv ?? pdv(),
      confirmarEntrega: async () => false,
    },
  );
  sonda.v = v;
  if (c.rail) return <ModuleView v={v} />;
  return (
    <>
      <ProximaAcaoV4 v={v} />
      {atual.stage === "financeiro" ? <FinanceiroStage v={v} /> : <EntregaStage v={v} />}
      <EstornoRecebimentoModal v={v} />
    </>
  );
}

function montar(c: Cenario) {
  patches.length = 0;
  const r = render(<Harness c={c} />);
  return { ...r, trocar: (n: Cenario) => r.rerender(<Harness c={n} />) };
}

const guia = () => screen.getByRole("region", { name: "Guia de retirada" });
const barra = () => screen.getByRole("region", { name: "Próxima ação da OS" });
const confirmar = () => screen.queryByRole("button", { name: "Confirmar entrega real" });
const contar = (texto: string) => (document.body.textContent ?? "").split(texto).length - 1;

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — superfícies coerentes", () => {
  it("A1 Entrega: pagamento registrado e pendência comercial separados, explicação única, ação para o orçamento, entrega bloqueada", () => {
    const a = os("a", "rascunho");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) } });
    const v = sonda.v!;
    expect(v.financeiroHeader).toMatchObject({ label: "Pagamento registrado R$ 420,00", tone: "success" });
    expect(v.comercialHeader).toMatchObject({ label: "Aprovação pendente", tone: "warn", destino: "orcamento" });

    const g = within(guia());
    expect(g.getByText("Conferir retirada")).toBeTruthy();
    expect(g.getByText("Aprovação comercial pendente — revisar autorização")).toBeTruthy();
    expect(g.getByText("Pagamento registrado — R$ 420,00 · Saldo do título — R$ 0,00 · Forma registrada: Dinheiro.")).toBeTruthy();
    expect(g.getByText("Valor do título")).toBeTruthy();
    expect(g.getByText("Saldo do título")).toBeTruthy();
    expect(g.getByText("Capa")).toBeTruthy();

    expect(within(barra()).getByText("Revisar aprovação comercial")).toBeTruthy();
    expect(contar(EXPLICACAO)).toBe(1);
    for (const proibido of ["Situação financeira desconhecida", "Financeiro indisponível", "Recebimento bloqueado", "Esta Ordem de Serviço ainda não foi entregue."]) {
      expect(contar(proibido), proibido).toBe(0);
    }
    expect(confirmar()).toBeNull();
    expect(screen.getByText(/Para liberar a confirmação da entrega/)).toBeTruthy();
    expect(screen.getByText("🛡 Garantia da OS")).toBeTruthy();
    expect(screen.queryByText("Checklist final de entrega")).toBeNull();
    expect(screen.queryByText("📦 Registro de entrega")).toBeNull();

    // Uma única ação, para o lugar que resolve: o orçamento (nunca o Financeiro).
    const acoes = screen.getAllByRole("button", { name: "Abrir orçamento" });
    expect(acoes.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(acoes[acoes.length - 1]!);
    expect(patches.some((p) => p.stage === "orcamento")).toBe(true);
    expect(patches.some((p) => p.stage === "financeiro")).toBe(false);
  });

  it("A1 Financeiro: fatos do título com rótulos próprios, nada a receber, forma registrada, histórico sem soma dupla", () => {
    const a = os("a", "rascunho");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro" });
    const strip = screen.getByLabelText("Fatos da Conta a Receber");
    expect(within(strip).getByText("Valor do título")).toBeTruthy();
    expect(within(strip).getByText("Saldo do título")).toBeTruthy();
    expect(within(strip).getAllByText("R$ 420,00").length).toBe(2);
    expect(screen.getByText("Aprovação pendente")).toBeTruthy();
    expect(screen.getByText("Nada a receber — título liquidado (R$ 420,00).")).toBeTruthy();
    expect(screen.queryByText(/Recebimento bloqueado/)).toBeNull();
    expect(screen.getByText("Dinheiro")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imprimir comprovante" })).toBeTruthy();
    // Baixa do título + recibo da OS da MESMA operação: um item só, com as duas fontes.
    expect(screen.getAllByText(/Quitação: Dinheiro R\$ 420,00/)).toHaveLength(1);
    expect(screen.queryByText(/Liquidação registrada/)).toBeNull();
    expect(screen.getByText(/Conta a Receber \+ registro da OS/)).toBeTruthy();
  });

  it("A2: aprovado + pago — quatro superfícies dizem quitado; retirante, data e custódia aparecem ANTES de confirmar", () => {
    const a = os("a", "aprovado");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) } });
    const v = sonda.v!;
    expect(v.financeiroHeader.label).toBe("Quitado");
    expect(v.comercialHeader.tone).toBe("success");
    expect(within(guia()).getByText("Pagamento quitado — confirmar entrega.")).toBeTruthy();
    expect(within(barra()).getByText("Confirmar entrega")).toBeTruthy();
    expect(screen.getByLabelText("Retirado por")).toBeTruthy();
    expect(screen.getAllByText(/Data da entrega/).length).toBeGreaterThan(0);
    expect(within(guia()).getByText("Capa")).toBeTruthy();
    expect(confirmar()).toBeTruthy();
    expect(contar("Aprovação comercial pendente")).toBe(0);
  });

  it("A3: título de outra loja — nada de quitação, de valores do título nem de entrega", () => {
    const a = os("a", "rascunho");
    montar({ os: a, fin: { projection: projecao(a, { ...LIQUIDADO!, storeId: "outra-loja" }) } });
    const v = sonda.v!;
    expect(v.financeiroHeader.tone).not.toBe("success");
    expect(within(guia()).getByText("Financeiro inconsistente")).toBeTruthy();
    expect(screen.queryByText("Valor do título")).toBeNull();
    expect(contar("Pagamento registrado")).toBe(0);
    expect(confirmar()).toBeNull();
  });

  it("falha real de leitura: único caso de indisponível, com nova tentativa", () => {
    const a = os("a", "rascunho");
    const reload = vi.fn();
    montar({ os: a, fin: { projection: null, error: "Falha de rede.", reload } });
    expect(sonda.v!.financeiroHeader.label).toBe("Financeiro indisponível");
    expect(within(guia()).getByText("Situação financeira indisponível")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Tentar novamente" })[0]!);
    expect(reload).toHaveBeenCalled();
    expect(confirmar()).toBeNull();
  });

  it("A8: troca rápida de OS com resposta tardia da anterior — nada da outra OS aparece", () => {
    const a = os("a", "rascunho");
    const b = os("b", "aprovado");
    const { trocar } = montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) } });
    expect(within(guia()).getByText("Aprovação comercial pendente — revisar autorização")).toBeTruthy();
    trocar({ os: b, fin: { projection: projecao(a, LIQUIDADO) } });
    expect(within(guia()).getByText("Confirmando situação financeira…")).toBeTruthy();
    expect(contar("Pagamento registrado")).toBe(0);
    expect(contar("Aprovação comercial pendente")).toBe(0);
    expect(confirmar()).toBeNull();
  });

  it("A9: retirada sem fotos não exige foto — o formulário só abre quando o operador pede", () => {
    const a = os("a", "aprovado");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) } });
    expect(screen.queryByText("Adicionar foto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fotos de saída" }));
    expect(screen.getByText("Adicionar foto")).toBeTruthy();
    expect(confirmar()).toBeTruthy();
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R1: superfícies com fatos rejeitados", () => {
  const REJEITADO: Titulo = { status: "pago", historico: [
    { tipo: "liquidacao", valor: 420, loteId: "op-1" },
    { tipo: "estorno_pagamento", valor: 420, refHistoricoIndex: 9 },
    { tipo: "pagamento", valor: 420 },
  ] };

  it("R1-3: aprovado + estorno de referência inexistente + reposição — nenhuma superfície mostra quitação; gating legado intacto", () => {
    const a = os("a", "aprovado");
    const p = projecao(a, REJEITADO);
    expect(p).toMatchObject({ financialStatus: "PAID", canDeliver: true });
    montar({ os: a, fin: { projection: p } });
    const v = sonda.v!;
    expect(v.financeiroHeader).toMatchObject({ label: "Pagamento em conferência", tone: "warn" });
    expect(within(guia()).getByText("Pagamento em conferência")).toBeTruthy();
    expect(within(guia()).queryByText("Valor do título")).toBeNull();
    expect(within(guia()).queryByText("Quitado")).toBeNull();
    expect(within(barra()).getByText(/conferência pendente/)).toBeTruthy();
    expect(contar("Pagamento quitado")).toBe(0);
    // decisão legada intacta: o servidor ainda libera, a confirmação continua disponível
    expect(confirmar()).toBeTruthy();
  });

  it("R1-3: no Financeiro o mesmo caso aparece em conferência, sem valores nem forma presumida", () => {
    const a = os("a", "aprovado");
    montar({ os: a, fin: { projection: projecao(a, REJEITADO) }, stage: "financeiro" });
    // selo + três valores do título + forma de pagamento
    expect(screen.getAllByText("Em conferência")).toHaveLength(5);
    expect(within(screen.getByLabelText("Fatos da Conta a Receber")).getAllByText("Em conferência")).toHaveLength(3);
    expect(screen.getByText("Há registro de pagamento; conferência pendente.")).toBeTruthy();
    expect(screen.getByText("Sem ação de recebimento enquanto o histórico do título está em conferência.")).toBeTruthy();
    // a explicação do motivo aparece uma vez no painel (o aviso); a barra só orienta a ação
    expect(contar("Há estorno sem referência segura ao pagamento estornado.")).toBe(1);
    expect(screen.queryByText("Quitado")).toBeNull();
  });

  it("R1-4: forma do Financeiro vem só dos fatos — Pix de OUTRA operação não aparece", () => {
    const a = os("a", "aprovado", { timeline: [{
      id: "ev-x", tipo: "operacao_cobranca_gerada", autor: "Op", autorTipo: "usuario", conteudo: "Recebimento Pix", criadoEm: "2026-10-05T21:37:38.000Z",
      metadata: { operacaoId: "op-outra", total: 420, linhas: [{ forma: "pix", valor: 420 }] },
    }] });
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro" });
    expect(screen.getByText("Forma não identificada no título")).toBeTruthy();
    expect(screen.queryByText("Pix", { selector: "span" })).toBeNull();
  });

  it("rascunho sem Conta a Receber: cabeçalho não diz indisponível sem falha de leitura", () => {
    const a = os("a", "rascunho", { timeline: [] });
    montar({ os: a, fin: { projection: projecao(a, null) } });
    expect(sonda.v!.financeiroHeader).toMatchObject({ label: "Sem Conta a Receber", tone: "neutro" });
    expect(contar("Financeiro indisponível")).toBe(0);
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R2: recebimento parcial com fatos rejeitados", () => {
  // Título de R$ 420: pagamento de R$ 300 e estorno de R$ 200 apontando para índice inexistente.
  const PARCIAL_AMBIGUO: Titulo = { status: "parcial", historico: [
    { tipo: "pagamento", valor: 300, loteId: "op-p" },
    { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 5 },
  ] };
  const semEventos = () => os("a", "aprovado", { timeline: [] });

  it("R2-2: Financeiro — decisão legada intacta, mas 'já recebido' e saldos não aparecem como fato; o valor é o informado", () => {
    const a = semEventos();
    const p = projecao(a, PARCIAL_AMBIGUO);
    expect(p).toMatchObject({ financialStatus: "PARTIAL", canReceive: true, canDeliver: false, receivedTotal: 100, balance: 320 });
    expect(p.fatos).toMatchObject({ verificavel: false, motivo: "ESTORNO_AMBIGUO" });
    const caixa = pdv();
    montar({ os: a, fin: { projection: p }, stage: "financeiro", pdv: caixa });
    expect(sonda.v!.entregaAcoes.saldoPendente).toBeNull();
    expect(contar("R$ 320,00")).toBe(0);
    expect(contar("R$ 100,00")).toBe(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Receber pagamento" }).at(-1)!);
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.getByText("Histórico do título em conferência: o saldo não é exibido. Informe o valor recebido agora.")).toBeTruthy();
    const valor = sheet.getByLabelText("Valor da linha 1") as HTMLInputElement;
    expect(valor.value).toBe("");
    expect(sheet.queryByRole("button", { name: "Usar restante" })).toBeNull();
    const resumo = within(sheet.getByTestId("resumo-misto"));
    expect(resumo.getAllByText("Em conferência")).toHaveLength(2);
    expect(resumo.getByText("Receber agora (informado)")).toBeTruthy();
    expect(contar("R$ 320,00")).toBe(0);
    expect(contar("R$ 100,00")).toBe(0);

    // acima do saldo legado: o limite segue valendo, sem revelar o saldo não comprovado
    fireEvent.change(valor, { target: { value: "500" } });
    expect(sheet.getByText("Valor acima do saldo a receber.")).toBeTruthy();
    expect(contar("320")).toBe(0);

    // receber continua possível (canReceive inalterado): o valor enviado é o informado
    fireEvent.click(sheet.getByRole("button", { name: "Pagamento parcial" }));
    fireEvent.change(valor, { target: { value: "100" } });
    fireEvent.click(sheet.getByRole("button", { name: "Confirmar R$ 100,00" }));
    expect(caixa.receber).toHaveBeenCalledWith(expect.objectContaining({ sessaoId: "sessao-qa", linhas: [expect.objectContaining({ forma: "pix", valor: 100 })] }));
  });

  it("R2-2: Entrega — 'Pagamento em conferência' sem R$ 320, entrega bloqueada igual, sheet hospedado sem saldo pré-preenchido", () => {
    const a = semEventos();
    montar({ os: a, fin: { projection: projecao(a, PARCIAL_AMBIGUO) } });
    expect(contar("Pagamento pendente")).toBe(0);
    expect(contar("R$ 320,00")).toBe(0);
    expect(contar("R$ 100,00")).toBe(0);
    expect(screen.getAllByText("Pagamento em conferência").length).toBeGreaterThan(0);
    expect(confirmar()).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Receber pagamento" }).at(-1)!);
    const sheet = within(screen.getByRole("dialog"));
    expect((sheet.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("");
    expect(contar("R$ 320,00")).toBe(0);
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R3: nenhum valor não conciliado vira verdade financeira", () => {
  // Espelho a prazo antigo de R$ 320 (autorização + plano de parcelas persistido).
  const aPrazoAntigo = (id: string) => ({
    aPrazoV3: {
      modo: "a_prazo", status: "pendente", valor: 320, vencimento: "2026-11-10",
      tituloLocalKey: `os-faturamento:${LOJA}:${id}`, autorizadoEntrega: true, autorizadoEm: "2026-10-03T10:00:00.000Z", autorizadoPor: "Operador QA",
    },
    faturamentoParcelas: [{ numero: "1", valor: 320, vencimento: "2026-11-10" }],
  });
  // Título de R$ 420 com DUAS baixas de R$ 300 (R$ 600).
  const DUAS_BAIXAS: Titulo = { status: "pago", historico: [
    { tipo: "pagamento", valor: 300, loteId: "op-a" },
    { tipo: "pagamento", valor: 300, loteId: "op-b" },
  ] };
  // R$ 300 recebidos, estorno de R$ 200 com referência inexistente e a prazo de R$ 320 autorizado.
  const A_PRAZO_AMBIGUO: Titulo = { status: "parcial", historico: [
    { tipo: "pagamento", valor: 300, loteId: "op-p" },
    { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 7 },
    { tipo: "a_prazo_autorizado", valor: 320, operacaoId: "op-m", recebidoAgora: 0 },
  ] };
  const caso = (titulo: Titulo, id = "a") => {
    const a = os(id, "aprovado", { timeline: [], ...aPrazoAntigo(id) });
    return { a, p: projecao(a, titulo) };
  };
  const SEM_VALOR_LEGADO = ["R$ 600,00", "R$ 320,00", "R$ 100,00"];
  // O histórico bruto (auditoria) pode citar valores, mas rotulados como não conciliados;
  // FORA dele nenhum valor legado aparece.
  const historico = () => screen.queryByText("Histórico de recebimentos")?.closest("section") ?? null;
  const contarFora = (texto: string) => contar(texto) - ((historico()?.textContent ?? "").split(texto).length - 1);
  const semValoresLegados = () => { for (const t of SEM_VALOR_LEGADO) expect(contarFora(t), t).toBe(0); };
  const brutosRotulados = () => {
    const h = historico()!;
    const comValor = [...h.children].filter((el) => /R\$/.test(el.textContent ?? "") && !/Registros brutos/.test(el.textContent ?? ""));
    expect(comValor.length).toBeGreaterThan(0);
    expect(h.textContent).toMatch(/Registros brutos — não conciliados/);
    for (const item of comValor) expect(item.textContent).toMatch(/· não conciliado/);
  };

  it("reprodução: o legado diz INCONSISTENT com recebido 600 e AUTHORIZED_CREDIT com parcela 320; os fatos rejeitam os dois", () => {
    const d = caso(DUAS_BAIXAS).p;
    expect(d).toMatchObject({ financialStatus: "INCONSISTENT", consistencyStatus: "INCONSISTENT", receivedTotal: 600, balance: 0, canDeliver: false });
    expect(d.fatos).toMatchObject({ tituloEncontrado: true, verificavel: false, motivo: "RECEBIDO_ACIMA_DO_TITULO", recebidoLiquido: null });
    const m = caso(A_PRAZO_AMBIGUO).p;
    expect(m).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", receivedTotal: 100, balance: 320, canDeliver: true });
    expect(m.installments[0]).toMatchObject({ dueAt: "2026-11-10", amount: 320 });
    expect(m.fatos).toMatchObject({ verificavel: false, motivo: "ESTORNO_AMBIGUO" });
  });

  it("R3-P1 Financeiro (INCONSISTENT): sem 'Recebido R$ 600', fatos em conferência com motivo; brutos só como não conciliados", () => {
    const { a, p } = caso(DUAS_BAIXAS);
    montar({ os: a, fin: { projection: p }, stage: "financeiro" });
    semValoresLegados();
    const strip = within(screen.getByLabelText("Fatos da Conta a Receber"));
    expect(strip.getAllByText("Em conferência")).toHaveLength(3);
    expect(screen.getByText(/O total recebido supera o valor da Conta a Receber\./)).toBeTruthy();
    expect(screen.queryByText("Vencimento")).toBeNull();
    expect(screen.queryByText("Quitado")).toBeNull();
    // registros brutos ficam na auditoria, rotulados como não conciliados
    expect(screen.getByText(/Registros brutos — não conciliados/)).toBeTruthy();
    brutosRotulados();
    expect(sonda.v!.financeiroHeader.label).not.toMatch(/R\$/);
  });

  it("R3-P1 Financeiro (AUTHORIZED_CREDIT): parcela antiga 'Vencimento … R$ 320' não aparece como cobrança vigente", () => {
    const { a, p } = caso(A_PRAZO_AMBIGUO);
    montar({ os: a, fin: { projection: p }, stage: "financeiro" });
    expect(screen.queryByText("Vencimento")).toBeNull();
    expect(screen.queryByText(/2026-11-10/)).toBeNull();
    expect(contarFora("10/11/2026")).toBe(0);
    expect(within(screen.getByTestId("a-prazo-persistido")).getByText("Vencimento: em conferência")).toBeTruthy();
    semValoresLegados();
    brutosRotulados();
    expect(sonda.v!.financeiroHeader).toMatchObject({ label: "Pagamento em conferência" });
  });

  it("R3-P1 Retirada: as duas OS mostram conferência, nenhum valor legado; decisões legadas intactas", () => {
    const d = caso(DUAS_BAIXAS);
    const { trocar } = montar({ os: d.a, fin: { projection: d.p } });
    semValoresLegados();
    expect(within(guia()).getByText("Financeiro inconsistente")).toBeTruthy();
    expect(within(guia()).getByText(/O total recebido supera o valor da Conta a Receber\./)).toBeTruthy();
    expect(sonda.v!.retirada?.financeiro).toMatchObject({ total: null, recebido: null, saldo: null, aPrazo: null, liberaEntrega: false });
    expect(confirmar()).toBeNull();
    const m = caso(A_PRAZO_AMBIGUO, "m");
    trocar({ os: m.a, fin: { projection: m.p } });
    semValoresLegados();
    expect(within(guia()).getByText("Pagamento em conferência")).toBeTruthy();
    expect(sonda.v!.retirada?.financeiro).toMatchObject({ recebido: null, saldo: null, aPrazo: null, liberaEntrega: true });
    // a autorização a prazo legada segue liberando a confirmação (decisão do servidor, inalterada)
    expect(confirmar()).toBeTruthy();
  });

  it("R3-P1 Estorno: o modal não afirma recebido/saldo em conferência; autorização, caixa, motivo e chamada inalterados", () => {
    const { a, p } = caso(DUAS_BAIXAS);
    const caixa = pdv();
    montar({ os: a, fin: { projection: p }, stage: "financeiro", pdv: caixa, estorno: true });
    const modal = within(screen.getByText("↩ Estornar recebimento").parentElement!.parentElement!);
    expect(modal.queryByText("Recebido atual")).toBeNull();
    expect(modal.queryByText("Saldo atual")).toBeNull();
    expect(modal.getByText(/Valores do título em conferência/)).toBeTruthy();
    semValoresLegados();
    expect(sonda.v!.estorno).toEqual({ temRecebido: true, caixaAberto: true, podeEstornar: true });
    fireEvent.change(modal.getByPlaceholderText(/valor lançado errado/), { target: { value: "Recebimento lançado em duplicidade" } });
    fireEvent.click(modal.getByRole("button", { name: "Confirmar estorno" }));
    expect(caixa.estornar).toHaveBeenCalledWith(expect.objectContaining({ sessaoId: "sessao-qa", motivo: "Recebimento lançado em duplicidade" }));
  });

  it("R3-P1 Estorno: título íntegro mostra recebido e saldo como antes", () => {
    const a = os("a", "aprovado");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro", estorno: true });
    const modal = within(screen.getByText("↩ Estornar recebimento").parentElement!.parentElement!);
    expect(modal.getByText("Recebido atual")).toBeTruthy();
    expect(modal.getByText("R$ 420,00")).toBeTruthy();
    expect(modal.getByText("Saldo atual")).toBeTruthy();
  });

  it("R3-P1 rail: conferência sem saldo nem 'A receber'; pendência comercial com fatos; outra loja/OS nunca aparece", () => {
    const d = caso(DUAS_BAIXAS);
    const m = caso(A_PRAZO_AMBIGUO, "m");
    const r = os("r", "rascunho");
    const pr = projecao(r, LIQUIDADO);
    const x = os("x", "aprovado");
    const px = { ...projecao(x, LIQUIDADO), storeId: "outra-loja" };
    const y = os("y", "aprovado");
    const py = { ...projecao(y, LIQUIDADO), osId: "z" };
    montar({ os: null, fin: { projection: null }, rail: {
      ordens: [d.a, m.a, r, x, y],
      projections: new Map([["a", d.p], ["m", m.p], ["r", pr], ["x", px], ["y", py]]),
    } });
    const pdvView = sonda.v!.pdvView;
    expect(pdvView.itens.map((i) => i.id).sort()).toEqual(["a", "m", "r"]);
    const linha = (id: string) => pdvView.itens.find((i) => i.id === id)!;
    expect(linha("a")).toMatchObject({ statusFaturamento: "Em conferência", saldoLinha: "", podeReceber: false, ctaLabel: "Abrir financeiro" });
    expect(linha("m")).toMatchObject({ statusFaturamento: "Em conferência", saldoLinha: "", podeReceber: false });
    expect(linha("r")).toMatchObject({ statusFaturamento: "Aprovação pendente", saldoLinha: "Saldo do título: R$ 0,00" });
    expect(pdvView.aReceberCount).toBe(0);
    semValoresLegados();
    expect(contar("Financeiro indisponível")).toBe(0);
    expect(contar("Quitado")).toBe(0);
  });

  it("R3: título íntegro liquidado + rascunho continua mostrando os fatos verificáveis e bloqueando a entrega", () => {
    const a = os("a", "rascunho");
    montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro" });
    const strip = within(screen.getByLabelText("Fatos da Conta a Receber"));
    expect(strip.getAllByText("R$ 420,00")).toHaveLength(2);
    expect(strip.getByText("R$ 0,00")).toBeTruthy();
    expect(screen.queryByText(/Registros brutos — não conciliados/)).toBeNull();
    expect(sonda.v!.entregaAcoes.podeConfirmar).toBe(false);
  });

  it("R3: troca rápida de loja/OS com resposta atrasada não vaza valores no estorno nem no rail", () => {
    const a = os("a", "aprovado");
    const b = os("b", "aprovado");
    const { trocar } = montar({ os: a, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro", estorno: true });
    expect(contar("R$ 420,00")).toBeGreaterThan(0);
    // resposta atrasada da OS anterior chegando com a OS b selecionada
    trocar({ os: b, fin: { projection: projecao(a, LIQUIDADO) }, stage: "financeiro", estorno: true });
    expect(contar("Recebido atual")).toBe(0);
    expect(contar("R$ 420,00")).toBe(0);
    cleanup();
    // rail: lote de OUTRA loja (troca de loja com resposta atrasada) não aparece
    montar({ os: null, fin: { projection: null }, rail: { ordens: [a], projections: new Map([["a", projecao(a, LIQUIDADO)]]), loja: "loja-nova" } });
    expect(sonda.v!.pdvView.itens).toHaveLength(0);
    expect(contar("R$ 420,00")).toBe(0);
  });

  it("R3 Estorno: parcial válido mostra os valores; parcial ambíguo, histórico inválido e título de outra loja ficam em conferência", () => {
    const valido = os("a", "aprovado", { timeline: [] });
    montar({ os: valido, fin: { projection: projecao(valido, { status: "parcial", historico: [{ tipo: "pagamento", valor: 300, loteId: "op-p" }] }) }, stage: "financeiro", estorno: true });
    const modalValido = within(screen.getByText("↩ Estornar recebimento").parentElement!.parentElement!);
    expect(modalValido.getByText("R$ 300,00")).toBeTruthy();
    expect(modalValido.getByText("R$ 120,00")).toBeTruthy();
    cleanup();
    const rejeitados: Array<[string, Titulo]> = [
      ["parcial ambíguo", { status: "parcial", historico: [{ tipo: "pagamento", valor: 300, loteId: "op-p" }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 5 }] }],
      ["histórico inválido", { status: "parcial", historico: [{ tipo: "pagamento", valor: 300, loteId: "op-p" }, { valor: 10 }] }],
      ["outra loja", { storeId: "outra-loja", status: "parcial", historico: [{ tipo: "pagamento", valor: 300, loteId: "op-p" }] }],
    ];
    for (const [nome, titulo] of rejeitados) {
      const a = os("a", "aprovado", { timeline: [] });
      montar({ os: a, fin: { projection: projecao(a, titulo) }, stage: "financeiro", estorno: true });
      const modal = screen.getByText("↩ Estornar recebimento").parentElement!.parentElement!;
      expect(modal.textContent, nome).not.toMatch(/Recebido atual|Saldo atual|R\$ (300|120|100),00/);
      cleanup();
    }
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R6: forma ou evento com nome herdado do protótipo não quebra superfície", () => {
  const HERDADOS = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty", "__PROTO__", "Constructor"];
  const codigo = (forma: string) => forma.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, "_");
  const baixa = (extra: Record<string, unknown> = {}, depois: unknown[] = []): Titulo => ({
    status: "pago",
    historico: [{ tipo: "liquidacao", valor: 420, loteId: "op-1", at: "2026-10-05T21:37:39.000Z", userLabel: "Operador QA", ...extra }, ...depois],
  });
  /** Recibo da operação op-1 na OS com as linhas dadas (o vínculo do 006). */
  const comEvento = (linhas: unknown) => ({
    timeline: [{
      id: "ev-quitacao", tipo: "operacao_cobranca_gerada", autor: "Operador QA", autorTipo: "usuario", conteudo: "Quitação",
      criadoEm: "2026-10-05T21:37:38.000Z", metadata: { operacaoId: "op-1", total: 420, linhas, op: "liquidar" },
    }],
  });

  /** Monta sem exceção e devolve os erros de filho inválido que o React registraria. */
  function montarSemErroReact(c: Cenario): string[] {
    const erros: string[] = [];
    const espiao = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { erros.push(args.map((a) => String(a)).join(" ")); });
    try {
      expect(() => montar(c)).not.toThrow();
    } finally {
      espiao.mockRestore();
    }
    return erros.filter((e) => /not valid as a React child/i.test(e));
  }
  const semLixo = (rotulo: string) => {
    const texto = document.body.textContent ?? "";
    expect(texto, rotulo).not.toMatch(/\[object |function [A-Za-z]*\(/);
  };
  const formaExibida = () => {
    const linha = screen.getByText("Forma de pagamento").parentElement!;
    return linha.lastElementChild?.textContent ?? "";
  };

  it("R6-P2 reprodução exata: Financeiro com baixa \"__proto__\"/\"constructor\" e fatos verificáveis renderiza a forma registrada em texto", () => {
    for (const forma of ["__proto__", "constructor"]) {
      const a = os("a", "aprovado", { timeline: [] });
      expect(montarSemErroReact({ os: a, fin: { projection: projecao(a, baixa({ formaPagamento: forma })) }, stage: "financeiro" }), forma).toEqual([]);
      expect(formaExibida(), forma).toBe(forma);
      semLixo(forma);
      cleanup();
    }
  });

  it("R6: Financeiro, Entrega, Próxima ação e Estorno com nome herdado na baixa, no split e no recibo da operação — sem erro React, forma em texto, valores próprios", () => {
    for (const forma of HERDADOS) {
      const c = codigo(forma);
      const casos: Array<[string, Titulo, Record<string, unknown>, string]> = [
        ["baixa", baixa({ formaPagamento: forma }), { timeline: [] }, c],
        ["split parcial", baixa({ split: [{ forma: "pix", valor: 100 }, { forma, valor: 320 }] }), { timeline: [] }, `Pix R$ 100,00 + ${c} R$ 320,00`],
        ["recibo da operação", baixa(), comEvento([{ forma, valor: 420 }]), c],
        ["recibo parcial", baixa(), comEvento([{ forma: "pix", valor: 100 }, { forma, valor: 320 }]), `Pix R$ 100,00 + ${c} R$ 320,00`],
      ];
      for (const [onde, titulo, extra, esperado] of casos) {
        const rotulo = `${JSON.stringify(forma)} @ ${onde}`;
        // Financeiro (aprovado + pago) com o modal de estorno aberto por cima
        const a = os("a", "aprovado", extra);
        expect(montarSemErroReact({ os: a, fin: { projection: projecao(a, titulo) }, stage: "financeiro", estorno: true }), rotulo).toEqual([]);
        expect(formaExibida(), rotulo).toBe(esperado);
        expect(sonda.v!.estorno, rotulo).toEqual({ temRecebido: true, caixaAberto: true, podeEstornar: true });
        semLixo(rotulo);
        cleanup();
        // Entrega com pendência comercial: fatos e forma no guia de retirada, entrega bloqueada
        const r = os("r", "rascunho", extra);
        expect(montarSemErroReact({ os: r, fin: { projection: projecao(r, titulo) } }), rotulo).toEqual([]);
        expect(within(guia()).getByText(`Pagamento registrado — R$ 420,00 · Saldo do título — R$ 0,00 · Forma registrada: ${esperado}.`), rotulo).toBeTruthy();
        expect(within(barra()).getByText("Revisar aprovação comercial"), rotulo).toBeTruthy();
        expect(confirmar(), rotulo).toBeNull();
        semLixo(rotulo);
        cleanup();
      }
    }
  });

  it("R6: forma não textual na baixa → \"Forma não identificada no título\", sem erro React", () => {
    for (const forma of [7, true, ["pix"], { codigo: "pix" }, "   ", JSON.parse('{"toString":null}')]) {
      const rotulo = String(JSON.stringify(forma));
      const a = os("a", "aprovado", { timeline: [] });
      expect(montarSemErroReact({ os: a, fin: { projection: projecao(a, baixa({ formaPagamento: forma })) }, stage: "financeiro" }), rotulo).toEqual([]);
      expect(formaExibida(), rotulo).toBe("Forma não identificada no título");
      semLixo(rotulo);
      cleanup();
    }
  });

  it("R6: tipo de evento com nome herdado no título → histórico com descrição em texto, sem erro React; nenhum evento some", () => {
    for (const tipo of HERDADOS) {
      const a = os("a", "aprovado");
      const p = projecao(a, baixa({}, [{ tipo, at: "2026-10-06T10:00:00.000Z" }]));
      expect(montarSemErroReact({ os: a, fin: { projection: p }, stage: "financeiro" }), tipo).toEqual([]);
      expect(screen.getByText("Evento financeiro do título"), tipo).toBeTruthy();
      expect(p.historico?.flatMap((h) => h.eventIds).sort(), tipo).toEqual(p.financialEvents.map((e) => e.eventId).sort());
      semLixo(tipo);
      cleanup();
    }
  });

  it("R6: rail \"Recebimento da OS\" com OS de forma/evento herdados ao lado de uma íntegra — sem erro React, linhas coerentes", () => {
    const boa = os("boa", "aprovado");
    const proto = os("p", "aprovado", { timeline: [] });
    const cons = os("c", "rascunho", comEvento([{ forma: "constructor", valor: 420 }]));
    expect(montarSemErroReact({ os: null, fin: { projection: null }, rail: {
      ordens: [boa, proto, cons],
      projections: new Map([
        ["boa", projecao(boa, LIQUIDADO)],
        ["p", projecao(proto, baixa({ formaPagamento: "__proto__" }, [{ tipo: "__proto__" }]))],
        ["c", projecao(cons, baixa({}, [{ tipo: "constructor" }]))],
      ]),
    } })).toEqual([]);
    const itens = sonda.v!.pdvView.itens;
    expect(itens.map((i) => i.id).sort()).toEqual(["boa", "c", "p"]);
    expect(itens.find((i) => i.id === "p")).toMatchObject({ statusFaturamento: itens.find((i) => i.id === "boa")!.statusFaturamento });
    expect(itens.find((i) => i.id === "c")).toMatchObject({ statusFaturamento: "Aprovação pendente" });
    semLixo("rail");
  });
});
