// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 — superfícies MONTADAS (jsdom).
//
// Cluster comercial e sheet de recebimento REAIS sobre o `buildVals` REAL (estado V4 vivo,
// patches aplicados) e a projeção pura REAL. "Aprovar e receber" (C), formalização (D) e forma
// explícita (E). As actions "use server" são cortadas por mock só para os módulos carregarem;
// a persistência é provada no .pg.test.ts e a ligação do hook real em fluxo-hook.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/app/actions/ordens", () => ({ listOrdens: vi.fn(async () => []), getOrdem: vi.fn(async () => null) }));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), corrigirOrcamentoV3: vi.fn(), aprovarOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn(),
  conferirFormalizacaoAprovacaoV3: vi.fn(), formalizarAprovacaoPendenteV3: vi.fn(),
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
import {
  buildVals,
  type AprovacaoNoRecebimentoV4,
  type ConferenciaFormalizacaoUiV4,
  type FormalizacaoAprovacaoUiV4,
  type RecebimentoAposAprovacaoV4,
  type ResultadoAprovarEReceberV4,
  type V4DataCtx,
} from "@/components/operacoes-v4-preview/use-v4-preview";
import { OrcamentoDecisaoCluster } from "@/components/operacoes-v4-preview/parts/stages/OrcamentoDecisaoCluster";
import { ReceberPagamentoV4 } from "@/components/operacoes-v4-preview/parts/ReceberPagamentoV4";
import { projectFinancialOSV4, type FinancialProjectionOSV4 } from "@/lib/operacoes-v4/financial-projection";
import { montarEscopoFormalizacaoV3, type EntradaFormalizacaoV3, type EscopoFormalizacaoV3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";
import { DECLARACAO_FORMALIZACAO_APROVACAO_V3, escopoAprovacaoOrcamentoV3, MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";
import { MENSAGEM_GERAR_ORCAMENTO_COM_PAGAMENTO_V3 } from "@/lib/operacoes-v3/elegibilidade-comercial";

const LOJA = "loja-qa-frg2";

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function estado(over: Partial<V4State> = {}): V4State {
  return {
    view: "cockpit", module: "workspace", stage: "orcamento", status: "pronta", left: false, right: false,
    menu: null, toast: "", prioridade: "normal", histFilter: "todos", novaOS: false, novoAtendimento: false,
    recibo: false, atendimentoRapido: false, orcamentoRapido: false, estornoRecebimento: false,
    receberPagamento: false, cancelamentoOS: false, selectedOsId: null, focus: true, authState: "autorizado",
    pin4: 0, pin6: 0, pattern: [], senha: "", motivo: "", docPrint: null, ...over,
  } as V4State;
}

function os(id: string, orcStatus: string, orcExtra: Record<string, unknown> = {}): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: "pronta", operacaoStatusV3: "pronta",
    cliente: { nome: "Cliente QA FRG2" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE" },
    criadoEm: "2026-09-18T12:00:00.000Z",
    orcamento: { id: "orc", status: orcStatus, sintetizado: false, total: 420, desconto: 0, criadoEm: "2026-09-18T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 420 }], pecas: [], ...orcExtra },
    aberturaV3: { garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
    timeline: [],
  } as unknown as OrdemServico;
}

type Titulo = { status: string; historico: unknown[] } | null;
const LIQUIDADO: Titulo = { status: "pago", historico: [{ tipo: "liquidacao", valor: 420, loteId: "op-1" }] };

function projecao(o: OrdemServico, titulo: Titulo): FinancialProjectionOSV4 {
  return projectFinancialOSV4({
    storeId: LOJA, osId: o.id, prismaValorTotal: 420, loadedAt: "2026-10-09T12:00:00Z",
    payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 420 } as unknown as OrdemServico & Record<string, unknown>,
    titulo: titulo ? { id: "cr", storeId: LOJA, localKey: `os-faturamento:${LOJA}:${o.id}`, valor: 420, status: titulo.status, payload: { ordemServicoId: o.id, historico: titulo.historico } } : null,
  });
}

type Pdv = V4DataCtx["pdvServico"];
const pdv = (over: Partial<Pdv> = {}): Pdv => ({
  pagamento: null, sessao: { aberta: true, sessaoId: "sessao-qa" }, loading: false, recebendo: false, estornando: false, error: null,
  ultimoRecibo: null, reload: vi.fn(), receber: vi.fn(async () => true), estornar: vi.fn(async () => true), limparRecibo: vi.fn(),
  ...over,
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
  cancelamentoMotivoPrefill: null, definirCancelamentoMotivoPrefill: () => {}, confirmarEntrega: async () => false,
} as unknown as V4DataCtx;

interface Cenario {
  os: OrdemServico;
  titulo: Titulo;
  pdv?: Pdv;
  aprovarEReceber?: V4DataCtx["aprovarEReceber"];
  conferirEscopoAprovacao?: V4DataCtx["conferirEscopoAprovacao"];
  conferirFormalizacao?: V4DataCtx["conferirFormalizacao"];
  formalizarAprovacao?: V4DataCtx["formalizarAprovacao"];
}

const patches: Array<Record<string, unknown>> = [];
const sonda: { v: ReturnType<typeof buildVals> | null; modo: AprovacaoNoRecebimentoV4 | null } = { v: null, modo: null };

function Harness({ c }: { c: Cenario }) {
  const [st, setSt] = useState<V4State>(() => estado({ selectedOsId: c.os.id }));
  const [modo, setModo] = useState<AprovacaoNoRecebimentoV4 | null>(null);
  const v = buildVals(
    st,
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
      lojaAtivaId: LOJA,
      realOS: c.os,
      detailCarregada: true,
      financialProjection: { projection: projecao(c.os, c.titulo), loading: false, error: null, reload: () => {} },
      pdvServico: c.pdv ?? pdv(),
      aprovacaoNoRecebimento: modo,
      definirAprovacaoNoRecebimento: setModo,
      aprovarEReceber: c.aprovarEReceber,
      // Padrão: o "servidor" confere o escopo do próprio orçamento da OS (mesma função pura).
      conferirEscopoAprovacao: c.conferirEscopoAprovacao ?? (async () => escopoAprovacaoOrcamentoV3(c.os)),
      conferirFormalizacao: c.conferirFormalizacao,
      formalizarAprovacao: c.formalizarAprovacao,
    },
  );
  sonda.v = v;
  sonda.modo = modo;
  return (
    <>
      <OrcamentoDecisaoCluster v={v} />
      <ReceberPagamentoV4 v={v} />
    </>
  );
}

function montar(c: Cenario) {
  patches.length = 0;
  const view = render(<Harness c={c} />);
  return { ...view, trocar: (n: Cenario) => view.rerender(<Harness c={n} />) };
}

const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
/** Consentimento só depois do escopo conferido no servidor (checkbox habilitado). */
async function consentir(dialogo: HTMLElement) {
  const caixa = within(dialogo).getByLabelText("O cliente aprovou este orçamento") as HTMLInputElement;
  await waitFor(() => expect(caixa.disabled).toBe(false));
  fireEvent.click(caixa);
}
const desabilitado = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

// ─── C · "Aprovar e receber" ───────────────────────────────────────────────────────────────
describe("C · conferir → aprovar expressamente → receber", () => {
  const RASCUNHO = os("a", "rascunho");

  it("oferecido com aprovação pendente e sem pagamento; abre o MESMO sheet em modo encadeado, no Financeiro", async () => {
    montar({ os: RASCUNHO, titulo: null, aprovarEReceber: vi.fn() });
    expect(screen.queryByTestId("formalizar-aprovacao")).toBeNull();
    fireEvent.click(botao("Aprovar e receber"));
    await waitFor(() => expect(sonda.modo).toEqual({ chave: JSON.stringify([LOJA, "a"]), estado: "conferir" }));
    expect(patches).toContainEqual(expect.objectContaining({ stage: "financeiro", receberPagamento: true, alvoSuperficies: JSON.stringify([LOJA, "a"]) }));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    const escopo = within(dialogo).getByTestId("aprovar-e-receber-escopo");
    await waitFor(() => expect(escopo.textContent).toMatch(/Troca de Tela — R\$\s420,00/));
    expect(escopo.textContent).toMatch(/Total do orçamento\s*R\$\s420,00/);
    expect(escopo.textContent).toContain("A aprovação não altera a garantia desta OS.");
    expect(escopo.textContent).toContain("A aprovação não inicia o serviço nem entrega o aparelho.");
  });

  it("sem forma e sem consentimento nada é confirmado; com os dois, aprova e só então recebe pelo MESMO caminho", async () => {
    const p = pdv();
    const aprovarEReceber = vi.fn(async (receber: () => Promise<RecebimentoAposAprovacaoV4>): Promise<ResultadoAprovarEReceberV4> => {
      const r = await receber();
      return r.ok ? { status: "recebido" } : { status: "aprovado_pagamento_nao_confirmado", mensagem: r.mensagem };
    });
    montar({ os: RASCUNHO, titulo: null, pdv: p, aprovarEReceber });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    const confirmar = () => within(dialogo).getByRole("button", { name: /^(Escolha a forma|Aprovar e receber R\$)/ });
    expect(confirmar().textContent).toBe("Escolha a forma de pagamento");
    expect(desabilitado(confirmar())).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    expect(confirmar().textContent).toMatch(/^Aprovar e receber R\$\s420,00$/);
    expect(desabilitado(confirmar())).toBe(true); // falta o consentimento expresso
    await consentir(dialogo);
    expect(desabilitado(confirmar())).toBe(false);
    fireEvent.click(confirmar());
    await waitFor(() => expect(aprovarEReceber).toHaveBeenCalledTimes(1));
    // A aprovação leva a assinatura do escopo CONFERIDO no servidor.
    const conferido = escopoAprovacaoOrcamentoV3(RASCUNHO);
    expect((aprovarEReceber.mock.calls[0] as unknown[])[1]).toEqual({ conteudo: conferido.ok ? conferido.escopo.conteudo : "" });
    expect(p.receber).toHaveBeenCalledWith(expect.objectContaining({ linhas: [{ forma: "pix", valor: 420 }], sessaoId: "sessao-qa" }));
    await waitFor(() => expect(patches).toEqual(expect.arrayContaining([{ receberPagamento: false }, { recibo: true, alvoSuperficies: JSON.stringify([LOJA, "a"]) }])));
    expect(sonda.modo).toBeNull();
  });

  it("aprovação recusada (ex.: vencido): mensagem do servidor; nada recebido, sem recibo", async () => {
    const p = pdv();
    const aprovarEReceber = vi.fn(async (): Promise<ResultadoAprovarEReceberV4> => ({ status: "aprovacao_recusada", mensagem: "Este orçamento venceu em 20/09/2026." }));
    montar({ os: RASCUNHO, titulo: null, pdv: p, aprovarEReceber });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    fireEvent.change(within(dialogo).getByLabelText("Forma da linha 1"), { target: { value: "dinheiro" } });
    await consentir(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Aprovar e receber R\$/ }));
    expect(await within(dialogo).findByText("Este orçamento venceu em 20/09/2026.")).toBeTruthy();
    expect(p.receber).not.toHaveBeenCalled();
    expect(patches.some((x) => x.recibo === true)).toBe(false);
  });

  it("R1-P1: escopo mudou depois da conferência → recusa; nova conferência e NOVO consentimento antes de repetir", async () => {
    const conferir = vi.fn(async () => escopoAprovacaoOrcamentoV3(RASCUNHO));
    const aprovarEReceber = vi.fn(async (): Promise<ResultadoAprovarEReceberV4> => ({ status: "aprovacao_recusada", mensagem: MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3 }));
    montar({ os: RASCUNHO, titulo: null, aprovarEReceber, conferirEscopoAprovacao: conferir });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    fireEvent.change(within(dialogo).getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    await consentir(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Aprovar e receber R\$/ }));
    expect(await within(dialogo).findByText(MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3)).toBeTruthy();
    await waitFor(() => expect(conferir).toHaveBeenCalledTimes(2));
    expect((within(dialogo).getByLabelText("O cliente aprovou este orçamento") as HTMLInputElement).checked).toBe(false);
    expect(desabilitado(within(dialogo).getByRole("button", { name: /^Aprovar e receber R\$/ }))).toBe(true);
  });

  it("R1-P2: o escopo mostra o efetivamente escolhido — alternativa não escolhida e cortesia identificadas, valor com desconto", async () => {
    const comGrupo = os("a", "rascunho", {
      total: 300,
      servicos: [
        { id: "s1", descricao: "Tela original", valor: 400, desconto: 100, grupoId: "g1", selecionadaV3: true },
        { id: "s2", descricao: "Tela premium", valor: 450, grupoId: "g1" },
        { id: "s3", descricao: "Película", valor: 20, kindV3: "brinde" },
      ],
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
    });
    montar({ os: comGrupo, titulo: null, aprovarEReceber: vi.fn() });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    const escopo = within(dialogo).getByTestId("aprovar-e-receber-escopo");
    await waitFor(() => expect(escopo.textContent).toMatch(/Tela: Tela original — R\$\s300,00/));
    expect(escopo.textContent).toMatch(/Tela: Tela premium — não escolhida \(R\$\s450,00\)/);
    expect(escopo.textContent).toContain("Película — cortesia");
    expect(escopo.textContent).toMatch(/Total do orçamento\s*R\$\s300,00/);
  });

  it("aprovada + pagamento falho: 'Orçamento aprovado — pagamento não confirmado', rascunho preservado, retry só do pagamento", async () => {
    const p = pdv({ receber: vi.fn(async () => false) });
    const aprovarEReceber = vi.fn(async (receber: () => Promise<RecebimentoAposAprovacaoV4>): Promise<ResultadoAprovarEReceberV4> => {
      const r = await receber();
      return r.ok ? { status: "recebido" } : { status: "aprovado_pagamento_nao_confirmado", mensagem: "Caixa fechado: abra o caixa no PDV antes de receber." };
    });
    const view = montar({ os: RASCUNHO, titulo: null, pdv: p, aprovarEReceber });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    fireEvent.change(within(dialogo).getByLabelText("Forma da linha 1"), { target: { value: "pix" } });
    await consentir(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Aprovar e receber R\$/ }));
    await waitFor(() => expect(sonda.modo).toEqual({ chave: JSON.stringify([LOJA, "a"]), estado: "aprovado_pagamento_pendente" }));
    // A leitura do servidor volta com o orçamento aprovado (sem rollback fictício).
    view.trocar({ os: os("a", "aprovado", { respondidoEm: "2026-10-09T12:00:00Z" }), titulo: null, pdv: p, aprovarEReceber });
    const sheet = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect(within(sheet).getByRole("status").textContent).toBe("Orçamento aprovado — pagamento não confirmado.");
    expect(within(sheet).getByText("Caixa fechado: abra o caixa no PDV antes de receber.")).toBeTruthy();
    expect((within(sheet).getByLabelText("Forma da linha 1") as HTMLSelectElement).value).toBe("pix");
    fireEvent.click(within(sheet).getByRole("button", { name: /^Confirmar R\$\s420,00/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(2));
    expect(aprovarEReceber).toHaveBeenCalledTimes(1); // o retry é só do pagamento
    expect((p.receber as ReturnType<typeof vi.fn>).mock.calls[1]![0]).toEqual((p.receber as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
  });

  it("efeito conhecido sobre a garantia é exposto antes do consentimento (variante escolhida com prazo)", async () => {
    const comVariante = os("a", "rascunho", {
      servicos: [
        { id: "s1", descricao: "Tela original", valor: 420, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Original", garantiaDias: 180 } },
        { id: "s2", descricao: "Tela genérica", valor: 300, grupoId: "g1", selecionadaV3: false, varianteV3: { rotulo: "Genérica", garantiaDias: 30 } },
      ],
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
    });
    montar({ os: comVariante, titulo: null, aprovarEReceber: vi.fn() });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    expect(within(dialogo).getByTestId("aprovar-e-receber-escopo").textContent).toContain("Ao aprovar, a garantia da OS passa a ser de 180 dias (opção escolhida: Original).");
  });

  it("R2-P2: o efeito sobre a garantia vem do MESMO snapshot conferido no servidor (não do estado local)", async () => {
    const comVariante = os("a", "rascunho", {
      servicos: [{ id: "s1", descricao: "Tela original", valor: 420, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Original", garantiaDias: 180 } }],
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
    });
    const servidor = os("a", "rascunho", {
      servicos: [{ id: "s1", descricao: "Tela genérica", valor: 420, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Genérica", garantiaDias: 30 } }],
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
    });
    montar({ os: comVariante, titulo: null, aprovarEReceber: vi.fn(), conferirEscopoAprovacao: async () => escopoAprovacaoOrcamentoV3(servidor) });
    fireEvent.click(botao("Aprovar e receber"));
    const dialogo = await screen.findByRole("dialog", { name: "Aprovar e receber" });
    const escopo = within(dialogo).getByTestId("aprovar-e-receber-escopo");
    await waitFor(() => expect(escopo.textContent).toContain("Ao aprovar, a garantia da OS passa a ser de 30 dias (opção escolhida: Genérica)."));
    expect(escopo.textContent).not.toContain("180 dias");
  });

  it("não é oferecido com pagamento já registrado, com orçamento aprovado, nem sem a ação ligada", () => {
    montar({ os: RASCUNHO, titulo: LIQUIDADO, aprovarEReceber: vi.fn(), conferirFormalizacao: vi.fn(), formalizarAprovacao: vi.fn() });
    expect(screen.queryByRole("button", { name: "Aprovar e receber" })).toBeNull();
    cleanup();
    montar({ os: os("a", "aprovado", { respondidoEm: "2026-09-19T12:00:00Z" }), titulo: null, aprovarEReceber: vi.fn() });
    expect(screen.queryByRole("button", { name: "Aprovar e receber" })).toBeNull();
    cleanup();
    montar({ os: RASCUNHO, titulo: null });
    expect(screen.queryByRole("button", { name: "Aprovar e receber" })).toBeNull();
  });
});

// ─── D · formalização administrativa ──────────────────────────────────────────────────────
describe("D · formalizar aprovação pendente", () => {
  const RASCUNHO = os("a", "rascunho");
  const escopoDe = (o: OrdemServico): EscopoFormalizacaoV3 => {
    const m = montarEscopoFormalizacaoV3({
      storeId: LOJA, osId: o.id, payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 420 } as never, prismaValorTotal: 420,
      titulo: { id: "cr", storeId: LOJA, localKey: `os-faturamento:${LOJA}:${o.id}`, valor: 420, status: "pago", payload: { ordemServicoId: o.id, historico: LIQUIDADO!.historico } },
      agora: Date.parse("2026-10-09T12:00:00Z"),
    });
    if (!m.ok) throw new Error(m.mensagem);
    return m.escopo;
  };
  const conferido = (vencido = false): ConferenciaFormalizacaoUiV4 => ({ ok: true, escopo: escopoDe(RASCUNHO), vencido, declaracao: DECLARACAO_FORMALIZACAO_APROVACAO_V3 });

  it("oferecida só com pagamento verificado + aprovação pendente; a aprovação comum fica bloqueada com orientação", () => {
    montar({ os: RASCUNHO, titulo: LIQUIDADO, conferirFormalizacao: vi.fn(), formalizarAprovacao: vi.fn() });
    const painel = screen.getByTestId("formalizar-aprovacao");
    expect(within(painel).getByText("Pagamento registrado com aprovação pendente")).toBeTruthy();
    expect(desabilitado(botao("Aprovar orçamento"))).toBe(true);
    expect(screen.getByText(/use “Formalizar aprovação pendente” acima \(administrador\)/)).toBeTruthy();
    cleanup();
    montar({ os: RASCUNHO, titulo: null, conferirFormalizacao: vi.fn(), formalizarAprovacao: vi.fn() });
    expect(screen.queryByTestId("formalizar-aprovacao")).toBeNull();
    expect(desabilitado(botao("Aprovar orçamento"))).toBe(false);
    cleanup();
    montar({ os: os("a", "aprovado", { respondidoEm: "2026-09-19T12:00:00Z" }), titulo: LIQUIDADO, conferirFormalizacao: vi.fn(), formalizarAprovacao: vi.fn() });
    expect(screen.queryByTestId("formalizar-aprovacao")).toBeNull();
  });

  it("conferência no servidor → motivo, declaração; envia a MESMA assinatura de escopo; sucesso registrado", async () => {
    const conferirFormalizacao = vi.fn(async () => conferido());
    const formalizarAprovacao = vi.fn(async (input: EntradaFormalizacaoV3): Promise<FormalizacaoAprovacaoUiV4> => ({ ok: true, jaRegistrado: false, operacaoId: input.operacaoId, formalizadoEm: "2026-10-09T12:00:00Z", formalizadoPor: "Admin QA" }));
    montar({ os: RASCUNHO, titulo: LIQUIDADO, conferirFormalizacao, formalizarAprovacao });
    fireEvent.click(botao("Formalizar aprovação pendente"));
    const grupo = await screen.findByRole("group", { name: "Formalizar aprovação pendente" });
    await within(grupo).findByText(/Escopo conferido no servidor/);
    expect(grupo.textContent).toMatch(/Troca de Tela — R\$\s420,00/);
    expect(grupo.textContent).toMatch(/Recebido vigente: R\$\s420,00/);
    const formalizar = () => within(grupo).getByRole("button", { name: "Formalizar aprovação" });
    expect(desabilitado(formalizar())).toBe(true);
    fireEvent.change(within(grupo).getByLabelText("Motivo da formalização"), { target: { value: "curto" } });
    fireEvent.click(within(grupo).getByLabelText("Declaração do responsável"));
    expect(desabilitado(formalizar())).toBe(true); // motivo curto
    fireEvent.change(within(grupo).getByLabelText("Motivo da formalização"), { target: { value: "Cliente aprovou no balcão em 02/10." } });
    expect(desabilitado(formalizar())).toBe(false);
    fireEvent.click(formalizar());
    await waitFor(() => expect(formalizarAprovacao).toHaveBeenCalledTimes(1));
    expect(formalizarAprovacao.mock.calls[0]![0]).toEqual({
      operacaoId: expect.stringMatching(/^[A-Za-z0-9._-]{8,120}$/),
      motivo: "Cliente aprovou no balcão em 02/10.",
      declaracaoAceita: true,
      evidencia: null,
      escopo: escopoDe(RASCUNHO),
      ratificarVencido: false,
    });
    expect(await screen.findByText("Aprovação formalizada. Registro auditável gravado.")).toBeTruthy();
  });

  it("resultado incerto: reenvia a MESMA formalização (mesma chave); recusa conferida exige nova conferência e nova chave", async () => {
    const conferirFormalizacao = vi.fn(async () => conferido());
    const formalizarAprovacao = vi.fn<(input: EntradaFormalizacaoV3) => Promise<FormalizacaoAprovacaoUiV4>>()
      .mockResolvedValueOnce({ ok: false, code: "incerto", mensagem: "Não foi possível confirmar se a formalização foi gravada." })
      .mockResolvedValueOnce({ ok: false, code: "escopo_divergente", mensagem: "O orçamento, a Conta a Receber ou os pagamentos mudaram desde a conferência.", naoRegistrada: true })
      .mockResolvedValueOnce({ ok: true, jaRegistrado: false, operacaoId: "x", formalizadoEm: "2026-10-09T12:00:00Z", formalizadoPor: "Admin QA" });
    montar({ os: RASCUNHO, titulo: LIQUIDADO, conferirFormalizacao, formalizarAprovacao });
    fireEvent.click(botao("Formalizar aprovação pendente"));
    const grupo = await screen.findByRole("group", { name: "Formalizar aprovação pendente" });
    await within(grupo).findByText(/Escopo conferido no servidor/);
    fireEvent.change(within(grupo).getByLabelText("Motivo da formalização"), { target: { value: "Cliente aprovou no balcão em 02/10." } });
    fireEvent.click(within(grupo).getByLabelText("Declaração do responsável"));
    fireEvent.click(within(grupo).getByRole("button", { name: "Formalizar aprovação" }));
    const reenviar = await within(grupo).findByRole("button", { name: "Reenviar a mesma formalização" });
    // R1-P2: enquanto incerto, a confirmação enviada fica congelada — nada pode ser editado.
    expect((within(grupo).getByLabelText("Motivo da formalização") as HTMLTextAreaElement).disabled).toBe(true);
    expect((within(grupo).getByLabelText("Declaração do responsável") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(reenviar);
    await within(grupo).findByText(/mudaram desde a conferência/);
    const [primeira, segunda] = formalizarAprovacao.mock.calls.map((c) => c[0]);
    expect(segunda).toEqual(primeira);
    fireEvent.click(within(grupo).getByRole("button", { name: "Conferir de novo" }));
    await waitFor(() => expect(conferirFormalizacao).toHaveBeenCalledTimes(2));
    // Nova conferência = novo ato: a declaração é pedida de novo.
    const declaracao = (await within(grupo).findByLabelText("Declaração do responsável")) as HTMLInputElement;
    expect(declaracao.checked).toBe(false);
    expect(desabilitado(within(grupo).getByRole("button", { name: "Formalizar aprovação" }))).toBe(true);
    fireEvent.click(declaracao);
    fireEvent.click(within(grupo).getByRole("button", { name: "Formalizar aprovação" }));
    await waitFor(() => expect(formalizarAprovacao).toHaveBeenCalledTimes(3));
    expect(formalizarAprovacao.mock.calls[2]![0].operacaoId).not.toBe(primeira!.operacaoId);
  });

  it("R1-P2: recusa conferida (ex.: vencido sem ratificação) leva a 'Conferir de novo' — nunca a um botão que não envia", async () => {
    const conferirFormalizacao = vi.fn(async () => conferido(true));
    const formalizarAprovacao = vi.fn<(input: EntradaFormalizacaoV3) => Promise<FormalizacaoAprovacaoUiV4>>()
      .mockResolvedValueOnce({ ok: false, code: "vencido_sem_ratificacao", mensagem: "O orçamento venceu: ratifique o escopo agora para formalizar.", naoRegistrada: true });
    montar({ os: RASCUNHO, titulo: LIQUIDADO, conferirFormalizacao, formalizarAprovacao });
    fireEvent.click(botao("Formalizar aprovação pendente"));
    const grupo = await screen.findByRole("group", { name: "Formalizar aprovação pendente" });
    await within(grupo).findByText(/Escopo conferido no servidor/);
    fireEvent.change(within(grupo).getByLabelText("Motivo da formalização"), { target: { value: "Cliente aprovou no balcão em 02/10." } });
    fireEvent.click(within(grupo).getByLabelText("Declaração do responsável"));
    fireEvent.click(within(grupo).getByText(/Ratifico neste momento/));
    fireEvent.click(within(grupo).getByRole("button", { name: "Formalizar aprovação" }));
    await within(grupo).findByText(/ratifique o escopo agora/);
    expect(within(grupo).queryByRole("button", { name: "Formalizar aprovação" })).toBeNull();
    fireEvent.click(within(grupo).getByRole("button", { name: "Conferir de novo" }));
    await waitFor(() => expect(conferirFormalizacao).toHaveBeenCalledTimes(2));
    expect(formalizarAprovacao).toHaveBeenCalledTimes(1);
  });

  it("vencido exige a ratificação específica no momento atual", async () => {
    const formalizarAprovacao = vi.fn(async (input: EntradaFormalizacaoV3): Promise<FormalizacaoAprovacaoUiV4> => ({ ok: true, jaRegistrado: false, operacaoId: input.operacaoId, formalizadoEm: "2026-10-09T12:00:00Z", formalizadoPor: "Admin QA" }));
    montar({ os: RASCUNHO, titulo: LIQUIDADO, conferirFormalizacao: vi.fn(async () => conferido(true)), formalizarAprovacao });
    fireEvent.click(botao("Formalizar aprovação pendente"));
    const grupo = await screen.findByRole("group", { name: "Formalizar aprovação pendente" });
    await within(grupo).findByText(/Ratifico neste momento/);
    fireEvent.change(within(grupo).getByLabelText("Motivo da formalização"), { target: { value: "Cliente aprovou no balcão em 02/10." } });
    fireEvent.click(within(grupo).getByLabelText("Declaração do responsável"));
    expect(desabilitado(within(grupo).getByRole("button", { name: "Formalizar aprovação" }))).toBe(true);
    fireEvent.click(within(grupo).getByText(/Ratifico neste momento/));
    fireEvent.click(within(grupo).getByRole("button", { name: "Formalizar aprovação" }));
    await waitFor(() => expect(formalizarAprovacao).toHaveBeenCalledWith(expect.objectContaining({ ratificarVencido: true })));
  });

  it("sem permissão: a negação do servidor aparece como orientação, nada mais é mostrado", async () => {
    montar({
      os: RASCUNHO, titulo: LIQUIDADO, formalizarAprovacao: vi.fn(),
      conferirFormalizacao: vi.fn(async () => ({ ok: false as const, code: "sem_permissao" as const, mensagem: "Somente um administrador com permissão de editar OS pode formalizar uma aprovação pendente." })),
    });
    fireEvent.click(botao("Formalizar aprovação pendente"));
    const grupo = await screen.findByRole("group", { name: "Formalizar aprovação pendente" });
    expect(await within(grupo).findByRole("alert")).toHaveProperty("textContent", "Somente um administrador com permissão de editar OS pode formalizar uma aprovação pendente.");
    expect(within(grupo).queryByLabelText("Motivo da formalização")).toBeNull();
  });
});

// ─── E · forma explícita no sheet da V4 ────────────────────────────────────────────────────
describe("R2-P1 · recebimento imediato sem resultado: só a confirmação ORIGINAL é reenviada", () => {
  it("rascunho travado e botão 'Reenviar mesma confirmação' (o hook repete a original — ver fluxo-hook)", async () => {
    const original = { linhas: [{ forma: "pix" as const, valor: 100 }], sessaoId: "sessao-anterior", intencao: "parcial" as const, operacaoId: "op-original-1", saldoEsperado: 420 };
    const p = pdv({ pendenciaReceber: { key: JSON.stringify([LOJA, "a"]), operacaoId: "op-original-1", input: original } } as never);
    montar({ os: os("a", "aprovado", { respondidoEm: "2026-09-19T12:00:00Z" }), titulo: null, pdv: p });
    act(() => sonda.v!.openReceberPagamentoAqui());
    const sheet = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect((within(sheet).getByLabelText("Forma da linha 1") as HTMLSelectElement).disabled).toBe(true);
    expect((within(sheet).getByLabelText("Forma da linha 1") as HTMLSelectElement).value).toBe("pix");
    fireEvent.click(within(sheet).getByRole("button", { name: "Reenviar mesma confirmação" }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(1));
    // O rascunho mostrado é o da confirmação original (travado); o reenvio idêntico é do hook.
    expect((within(sheet).getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("100");
  });
});

describe("E · nenhuma forma pré-selecionada no recebimento da V4", () => {
  it("abre sem forma; confirmar exige escolha; dividir adiciona linha também sem forma", async () => {
    const p = pdv();
    const aprovado = os("a", "aprovado", { respondidoEm: "2026-09-19T12:00:00Z" });
    montar({ os: aprovado, titulo: null, pdv: p });
    act(() => sonda.v!.openReceberPagamentoAqui());
    const sheet = await screen.findByRole("dialog", { name: "Receber pagamento" });
    const forma1 = within(sheet).getByLabelText("Forma da linha 1") as HTMLSelectElement;
    expect(forma1.value).toBe("");
    expect(within(sheet).getByRole("button", { name: "Escolha a forma de pagamento" })).toHaveProperty("disabled", true);
    expect(within(sheet).getByText("Linha 1: escolha a forma de pagamento.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "+ Dividir pagamento" }));
    expect((within(sheet).getByLabelText("Forma da linha 2") as HTMLSelectElement).value).toBe("");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remover forma 2" }));
    fireEvent.change(forma1, { target: { value: "debito" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Confirmar R\$\s420,00/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledWith(expect.objectContaining({ linhas: [{ forma: "debito", valor: 420 }] })));
  });
});

// ─── B · "Gerar orçamento" com pagamento registrado ────────────────────────────────────────
describe("B · 'Gerar orçamento' sobre OS com pagamento orienta antes do servidor", () => {
  // Em build de produção a mensagem de um erro lançado numa Server Action não chega ao navegador:
  // a orientação sai da MESMA situação que a tela mostra; o servidor segue recusando (pg.test).
  const valsPara = (o: OrdemServico, titulo: Titulo, gerar: () => Promise<boolean>, notify: (msg: string) => void) =>
    buildVals(estado({ selectedOsId: o.id }), () => {}, notify, {
      ...ctxBase, lojaAtivaId: LOJA, realOS: o, detailCarregada: true, gerarOrcamento: gerar,
      financialProjection: { projection: projecao(o, titulo), loading: false, error: null, reload: () => {} }, pdvServico: pdv(),
    });

  it("com pagamento vigente: orienta com o texto da recusa e NÃO chama o servidor", async () => {
    const gerar = vi.fn(async () => true);
    const notify = vi.fn();
    const semOrcamento = { ...os("b", "rascunho"), orcamento: undefined } as unknown as OrdemServico;
    await expect(valsPara(semOrcamento, LIQUIDADO, gerar, notify).gerarOrcamento()).resolves.toBe(false);
    expect(gerar).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(MENSAGEM_GERAR_ORCAMENTO_COM_PAGAMENTO_V3);
  });

  it("sem pagamento: segue ao servidor, sem orientação", async () => {
    const gerar = vi.fn(async () => true);
    const notify = vi.fn();
    const semOrcamento = { ...os("c", "rascunho"), orcamento: undefined } as unknown as OrdemServico;
    await expect(valsPara(semOrcamento, null, gerar, notify).gerarOrcamento()).resolves.toBe(true);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });
});
