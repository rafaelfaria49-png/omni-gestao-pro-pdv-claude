// OPS-V4-FLUXO-CURTO-006 — Retirada montada (jsdom).
//
// EntregaStage / ReceberPagamentoV4 / ReciboModal REAIS sobre o `buildVals` REAL,
// com estado V4 vivo (os patches são aplicados) e handlers espiões. As actions
// "use server" da V3 são cortadas por mock só para os módulos carregarem; nenhuma
// escrita real acontece aqui (o PostgreSQL fica no .pg.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { ReciboModal } from "@/components/operacoes-v4-preview/parts/ReciboModal";
import { projectFinancialOSV4, type FinancialProjectionOSV4 } from "@/lib/operacoes-v4/financial-projection";
import { montarComprovanteReciboV3, type ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";

const LOJA = "loja-qa-006";
const chave = (loja: string, osId: string | null) => JSON.stringify([loja, osId]);

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
  };
}

function os(id: string, status = "pronta", extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: status === "recebida" ? "pronta" : status,
    operacaoStatusV3: status, cliente: { nome: "Cliente QA 006" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", acessorios: ["Capa"] },
    criadoEm: "2026-10-01T12:00:00.000Z",
    orcamento: { id: "orc", status: "aprovado", total: 300, desconto: 0, criadoEm: "2026-10-01T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
    timeline: [], ...extra,
  } as unknown as OrdemServico;
}

type Titulo = { status: string; valor?: number; historico?: unknown[] } | null;
function projecao(o: OrdemServico, titulo: Titulo, extra: Record<string, unknown> = {}): FinancialProjectionOSV4 {
  return projectFinancialOSV4({
    storeId: LOJA, osId: o.id, prismaValorTotal: 300, loadedAt: "2026-10-08T12:00:00Z",
    payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 300, ...extra } as unknown as OrdemServico & Record<string, unknown>,
    titulo: titulo
      ? { id: "cr", storeId: LOJA, localKey: `os-faturamento:${LOJA}:${o.id}`, valor: titulo.valor ?? 300, status: titulo.status, payload: { ordemServicoId: o.id, historico: titulo.historico ?? [] } }
      : null,
  });
}
const PAGO: Titulo = { status: "pago", historico: [{ tipo: "pagamento", valor: 100 }, { tipo: "pagamento", valor: 200 }] };
const PARCIAL: Titulo = { status: "parcial", historico: [{ tipo: "pagamento", valor: 100 }] };
const ABERTO: Titulo = { status: "pendente", historico: [] };

const recibo = (o: OrdemServico, valor: number, acumulado: number): ComprovanteReciboV3 =>
  montarComprovanteReciboV3({
    os: o, linhas: [{ forma: "pix", valor }], valorPago: valor,
    pagamento: { total: 300, recebido: acumulado, saldo: 300 - acumulado, status: acumulado >= 300 ? "quitado" : "parcial" } as never,
    intencaoLabel: acumulado >= 300 ? "Quitação" : "Parcial", operador: "QA", dataHora: "2026-10-08T12:00:00.000Z",
  });

type Pdv = V4DataCtx["pdvServico"];
function pdv(over: Partial<Pdv> = {}): Pdv {
  return {
    pagamento: null, sessao: { aberta: true, sessaoId: "sessao-qa" }, loading: false, recebendo: false, estornando: false, error: null,
    ultimoRecibo: null, reload: vi.fn(), receber: vi.fn(async () => true), estornar: vi.fn(async () => true), limparRecibo: vi.fn(),
    ...over,
  } as Pdv;
}

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
  loja?: string;
  os: OrdemServico | null;
  fin?: { projection: FinancialProjectionOSV4 | null; loading?: boolean; error?: string | null; reload?: () => void };
  pdv?: Pdv;
  confirmarEntrega?: V4DataCtx["confirmarEntrega"];
  inicial?: Partial<V4State>;
}

const patches: Array<Record<string, unknown>> = [];
const avisos: string[] = [];
const sonda: { v: ReturnType<typeof buildVals> | null } = { v: null };
/** Sonda do buildVals renderizado (fora do render: só uma chamada de função). */
function expor(v: ReturnType<typeof buildVals>) {
  sonda.v = v;
}

function Harness({ c }: { c: Cenario }) {
  const [st, setSt] = useState<V4State>(() => estado({ selectedOsId: c.os?.id ?? null, ...(c.inicial ?? {}) }));
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
    (m) => avisos.push(m),
    {
      ...ctxBase,
      lojaAtivaId: c.loja ?? LOJA,
      realOS: c.os,
      detailCarregada: !!c.os,
      financialProjection: { projection: c.fin?.projection ?? null, loading: !!c.fin?.loading, error: c.fin?.error ?? null, reload: c.fin?.reload ?? (() => {}) },
      pdvServico: c.pdv ?? pdv(),
      confirmarEntrega: c.confirmarEntrega ?? (async () => false),
    },
  );
  expor(v);
  return (
    <>
      <EntregaStage v={v} />
      <ReciboModal v={v} />
    </>
  );
}

function montar(c: Cenario) {
  patches.length = 0;
  avisos.length = 0;
  const r = render(<Harness c={c} />);
  return { ...r, trocar: (n: Cenario) => r.rerender(<Harness c={n} />) };
}
const guia = () => screen.getByRole("region", { name: "Guia de retirada" });
const confirmar = () => screen.queryByRole("button", { name: "Confirmar entrega real" });
function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

describe("OPS-V4-FLUXO-CURTO-006 — guia de retirada e estados financeiros", () => {
  it("S09 financeiro carregando: confirma a situação, sem CTA de entrega nem de recebimento", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: null, loading: true } });
    expect(within(guia()).getByText("Confirmando situação financeira…")).toBeTruthy();
    expect(confirmar()).toBeNull();
    expect(screen.queryByRole("button", { name: "Receber pagamento" })).toBeNull();
    expect(screen.getByText("Confirmando a situação financeira desta OS…")).toBeTruthy();
  });

  it("S10 erro de leitura: indisponível, entrega bloqueada, retry da leitura", () => {
    const a = os("a");
    const reload = vi.fn();
    montar({ os: a, fin: { projection: null, error: "Falha ao consultar o financeiro.", reload } });
    expect(within(guia()).getByText("Situação financeira indisponível")).toBeTruthy();
    expect(confirmar()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("S08 projeção de OUTRA OS nunca decide a OS atual (stale) — carregando", () => {
    const a = os("a");
    const b = os("b");
    montar({ os: a, fin: { projection: projecao(b, PAGO) } });
    expect(within(guia()).getByText("Confirmando situação financeira…")).toBeTruthy();
    expect(confirmar()).toBeNull();
  });

  it("T44 parcial 100/300: guia mostra total/recebido/saldo e bloqueia a entrega", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, PARCIAL) } });
    const g = within(guia());
    expect(g.getByText("Pagamento parcial")).toBeTruthy();
    expect(g.getAllByText(/R\$\s300,00/).length).toBeGreaterThan(0);
    expect(g.getAllByText(/R\$\s100,00/).length).toBeGreaterThan(0);
    expect(g.getAllByText(/R\$\s200,00/).length).toBeGreaterThan(0);
    expect(g.getByText("Serviço aprovado: Troca de tela")).toBeTruthy();
    expect(g.getByText("Capa")).toBeTruthy();
    expect(confirmar()).toBeNull();
    expect(screen.getByText(/Pagamento pendente/)).toBeTruthy();
  });

  it("C-entrega receber em contexto: abre o MESMO sheet sem sair da Entrega e sem entregar", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    const p = pdv();
    montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, confirmarEntrega });
    fireEvent.click(screen.getByRole("button", { name: "Receber pagamento" }));
    expect(patches.at(-1)).toEqual({ receberPagamento: true, financeiroAlvo: chave(LOJA, "a"), menu: null });
    expect(patches.some((x) => "stage" in x)).toBe(false);
    const dialogo = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect(within(dialogo).getAllByText(/R\$\s300,00/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Confirmar R\$/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(1));
    expect(p.receber).toHaveBeenCalledWith(expect.objectContaining({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull());
    // Sucesso: fecha o sheet e abre o recibo da MESMA OS — nunca entrega.
    expect(patches).toEqual(expect.arrayContaining([{ receberPagamento: false }, { recibo: true, financeiroAlvo: chave(LOJA, "a") }]));
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("S01 duplo clique em Receber: uma única chamada ao contrato", async () => {
    const a = os("a");
    const pendente = adiado<boolean>();
    const p = pdv({ receber: vi.fn(() => pendente.promessa) });
    montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, inicial: { receberPagamento: true, financeiroAlvo: chave(LOJA, "a") } });
    const dialogo = await screen.findByRole("dialog", { name: "Receber pagamento" });
    const botao = within(dialogo).getByRole("button", { name: /^Confirmar R\$/ });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await act(async () => pendente.resolver(true));
    expect(p.receber).toHaveBeenCalledTimes(1);
  });

  it("§24 falha do recebimento: sheet não fecha como sucesso, sem recibo, sem entrega", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    const p = pdv({ receber: vi.fn(async () => false) });
    montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, confirmarEntrega, inicial: { receberPagamento: true, financeiroAlvo: chave(LOJA, "a") } });
    const dialogo = await screen.findByRole("dialog", { name: "Receber pagamento" });
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Confirmar R\$/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Receber pagamento" })).toBeTruthy();
    expect(patches.some((x) => x.recibo === true)).toBe(false);
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("S05 A→B com recebimento de A em voo: resposta de A não abre recibo/sheet nem mexe em B", async () => {
    const a = os("a");
    const b = os("b");
    const pendente = adiado<boolean>();
    const p = pdv({ receber: vi.fn(() => pendente.promessa) });
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, inicial: { receberPagamento: true, financeiroAlvo: chave(LOJA, "a") } });
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Receber pagamento" })).getByRole("button", { name: /^Confirmar R\$/ }));
    view.trocar({ os: b, fin: { projection: projecao(b, ABERTO) }, pdv: p });
    // O sheet aberto para A não aparece em B.
    expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull();
    await act(async () => pendente.resolver(true));
    expect(patches.some((x) => x.recibo === true)).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Recibo de pagamento" })).toBeNull();
    expect(within(guia()).getByText("OS-B")).toBeTruthy();
  });

  it("CHARGE_NOT_CREATED: explica a formalização no recebimento e oferece receber — nunca entrega", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, null) } });
    expect(within(guia()).getByText("Cobrança ainda não formalizada")).toBeTruthy();
    expect(within(guia()).getByText(/criada uma única vez no primeiro recebimento/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Receber pagamento" })).toBeTruthy();
    expect(confirmar()).toBeNull();
  });

  it("a prazo autorizado: entrega liberada com linguagem de NÃO quitada", () => {
    const a = os("a");
    const titulo: Titulo = { status: "parcial", historico: [{ tipo: "pagamento", valor: 250 }, { tipo: "a_prazo_autorizado", valor: 50 }] };
    const aPrazoV3 = { modo: "a_prazo", status: "pendente", valor: 50, vencimento: "2099-12-31", autorizadoEntrega: true, autorizadoEm: "2026-10-08T12:00:00Z", autorizadoPor: "QA", tituloLocalKey: `os-faturamento:${LOJA}:a` };
    montar({ os: { ...a, aPrazoV3 } as unknown as OrdemServico, fin: { projection: projecao(a, titulo, { aPrazoV3 }) } });
    expect(within(guia()).getByText("Entrega autorizada a prazo")).toBeTruthy();
    expect(within(guia()).getByText(/^Não quitada/)).toBeTruthy();
    expect(screen.queryByText(/Pagamento quitado/)).toBeNull();
    expect(confirmar()).toBeTruthy();
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — confirmação de entrega separada", () => {
  it("§22 quitado após reload: 'Pagamento quitado — confirmar entrega' e nada é entregue sozinho", () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    // Dito uma única vez (na guia), sem repetir no card de ação.
    expect(screen.getAllByText("Pagamento quitado — confirmar entrega.")).toHaveLength(1);
    expect(within(guia()).getByText("Pagamento quitado — confirmar entrega.")).toBeTruthy();
    expect(confirmar()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Receber pagamento" })).toBeNull();
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("logo após receber (comprovante da sessão): 'Pagamento registrado. Falta confirmar a entrega.'", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, pdv: pdv({ ultimoRecibo: recibo(a, 200, 300) }) });
    expect(screen.getByText("Pagamento registrado. Falta confirmar a entrega.")).toBeTruthy();
  });

  it("T52/§18 retirado por: pré-preenchido com o cliente, editável, enviado à action canônica", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    const campo = screen.getByLabelText("Retirado por") as HTMLInputElement;
    expect(campo.value).toBe("Cliente QA 006");
    fireEvent.change(campo, { target: { value: "  Portador   QA " } });
    fireEvent.click(confirmar()!);
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalledTimes(1));
    expect(confirmarEntrega).toHaveBeenCalledWith(undefined, undefined, "Portador QA");
    expect(vi.mocked(window.confirm).mock.calls[0]![0]).toContain("retirada por Portador QA");
  });

  it("retirado por em branco: o servidor registra o cliente (nenhum nome inventado na tela)", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    fireEvent.change(screen.getByLabelText("Retirado por"), { target: { value: "   " } });
    fireEvent.click(confirmar()!);
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalledTimes(1));
    expect(confirmarEntrega).toHaveBeenCalledWith(undefined, undefined);
  });

  it("S02 duplo clique em Confirmar entrega: uma única chamada", async () => {
    const a = os("a");
    const pendente = adiado<boolean>();
    const confirmarEntrega = vi.fn(() => pendente.promessa);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    const botao = confirmar()!;
    fireEvent.click(botao);
    fireEvent.click(botao);
    await act(async () => pendente.resolver(true));
    expect(confirmarEntrega).toHaveBeenCalledTimes(1);
  });

  it("S14 data de entrega futura: erro no campo, nenhuma confirmação", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2099-01-01" } });
    fireEvent.click(confirmar()!);
    expect(await screen.findByText(/futuro/i)).toBeTruthy();
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("S15/S16 sem cobrança: categoria e motivo obrigatórios antes de habilitar", async () => {
    const a = os("a", "pronta", { orcamento: { id: "orc", status: "aprovado", total: 0, desconto: 0, criadoEm: "2026-10-01T12:00:00Z", servicos: [{ id: "s1", descricao: "Cortesia", valor: 0 }], pecas: [] } });
    const confirmarEntrega = vi.fn(async () => true);
    const proj = projectFinancialOSV4({ storeId: LOJA, osId: "a", prismaValorTotal: 0, loadedAt: "2026-10-08T12:00:00Z", payload: { ...(a as unknown as Record<string, unknown>), valorTotal: 0 } as never, titulo: null });
    montar({ os: a, fin: { projection: proj }, confirmarEntrega });
    fireEvent.click(screen.getByRole("button", { name: "Entregar sem cobrança" }));
    const enviar = screen.getByRole("button", { name: "Confirmar entrega sem cobrança" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.change(screen.getByDisplayValue("Selecione"), { target: { value: "cortesia" } });
    expect(enviar.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Explique por que/), { target: { value: "Cortesia de fidelidade" } });
    expect(enviar.disabled).toBe(false);
    fireEvent.click(enviar);
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalledTimes(1));
    expect((confirmarEntrega.mock.calls[0] as unknown[])[0]).toEqual({ categoria: "cortesia", motivo: "Cortesia de fidelidade" });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — documentos e recibo", () => {
  it("§29 Termo de Entrega só após a entrega real (botão e menu Docs)", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, PAGO) } });
    const botao = screen.getByRole("button", { name: "Imprimir Termo de Entrega" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText("O Termo de Entrega fica disponível depois da entrega confirmada.")).toBeTruthy();
    act(() => sonda.v!.printItems.find((i) => i.label === "Termo de Entrega")!.onClick());
    expect(avisos.at(-1)).toBe("O Termo de Entrega fica disponível depois da entrega confirmada.");
    expect(patches.some((p) => p.docPrint === "termo_entrega")).toBe(false);
    cleanup();
    const entregue = os("e", "entregue", { entregueEm: "2026-10-08T12:00:00Z", entregaV3: { entregueEm: "2026-10-08T12:00:00Z", recebidoPor: "Ana" }, retirada: { confirmado: true, retiradoPor: "Ana", retiradoEm: "2026-10-08T12:00:00Z" } });
    montar({ os: entregue, fin: { projection: projecao(entregue, PAGO) } });
    expect((screen.getByRole("button", { name: "Imprimir Termo de Entrega" }) as HTMLButtonElement).disabled).toBe(false);
    act(() => sonda.v!.printItems.find((i) => i.label === "Termo de Entrega")!.onClick());
    expect(patches.at(-1)).toMatchObject({ docPrint: "termo_entrega" });
  });

  it("S12 recibo após reload: reimpressão do comprovante persistido da MESMA OS", () => {
    const a = os("a", "pronta", {
      timeline: [
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { comprovante: recibo(os("a"), 100, 100) } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { comprovante: recibo(os("a"), 200, 300) } },
      ],
    });
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, inicial: { recibo: true, financeiroAlvo: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).getByText("Reimpressão do último comprovante registrado nesta OS.")).toBeTruthy();
    expect(within(d).getByText("OS OS-A")).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Imprimir comprovante" })).toBeTruthy();
    fireEvent.keyDown(within(d).getByRole("button", { name: "Fechar comprovante" }), { key: "Escape" });
    expect(patches.at(-1)).toEqual({ recibo: false });
  });

  it("T51 recibo depois do estorno: o comprovante estornado nunca é reimpresso como válido", () => {
    const a = os("a", "pronta", {
      timeline: [
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { comprovante: recibo(os("a"), 100, 100) } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { comprovante: recibo(os("a"), 200, 300) } },
        { id: "e3", tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:10:00Z", metadata: { estornado: 200, modo: "ultimo_pagamento" } },
      ],
    });
    montar({ os: a, fin: { projection: projecao(a, { status: "parcial", historico: [{ tipo: "pagamento", valor: 100 }, { tipo: "pagamento", valor: 200 }, { tipo: "estorno_pagamento", valor: 200 }] }) }, inicial: { recibo: true, financeiroAlvo: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    // Comprovante válido = o de R$ 100 (parcial); o de R$ 200 (quitação) foi estornado.
    expect(within(d).getByText("Parcial")).toBeTruthy();
    expect(within(d).queryByText("Quitação")).toBeNull();
    expect(within(d).getAllByText(/R\$\s100,00/).length).toBeGreaterThan(0);
    // E a entrega voltou a bloquear (saldo 200).
    expect(confirmar()).toBeNull();
  });

  it("S05/S07 superfícies financeiras só valem para a loja+OS em que foram abertas", () => {
    const a = os("a");
    const b = os("b");
    const aberto = { receberPagamento: true, recibo: true, estornoRecebimento: true, financeiroAlvo: chave(LOJA, "a") };
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, inicial: aberto });
    expect(sonda.v!.reciboOpen && sonda.v!.receberPagamentoOpen && sonda.v!.estornoRecebimentoOpen).toBe(true);
    view.trocar({ os: b, fin: { projection: projecao(b, ABERTO) } });
    expect(sonda.v!.reciboOpen || sonda.v!.receberPagamentoOpen || sonda.v!.estornoRecebimentoOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    // Mesma OS em OUTRA loja: também fechado.
    view.trocar({ os: a, loja: "loja-qa-006-b", fin: { projection: null } });
    expect(sonda.v!.reciboOpen || sonda.v!.receberPagamentoOpen || sonda.v!.estornoRecebimentoOpen).toBe(false);
  });
});
