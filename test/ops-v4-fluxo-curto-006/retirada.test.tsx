// OPS-V4-FLUXO-CURTO-006 — Retirada montada (jsdom).
//
// EntregaStage / ReceberPagamentoV4 / ReciboModal REAIS sobre o `buildVals` REAL,
// com estado V4 vivo (os patches são aplicados) e handlers espiões. As actions
// "use server" da V3 são cortadas por mock só para os módulos carregarem; nenhuma
// escrita real acontece aqui (o PostgreSQL fica no .pg.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
// Como os writers canônicos gravam: cada baixa com a identidade da operação (loteId = operacaoId).
const PAGO: Titulo = { status: "pago", historico: [{ tipo: "pagamento", valor: 100, loteId: "op-e1" }, { tipo: "pagamento", valor: 200, loteId: "op-e2" }] };
const PARCIAL: Titulo = { status: "parcial", historico: [{ tipo: "pagamento", valor: 100, loteId: "op-e1" }] };
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
  /** Teclado (rev 13): controle de fundo espião + o botão que abre o recibo (como o do Financeiro). */
  fundo?: () => void;
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
      {c.fundo ? (
        <>
          <button type="button" onClick={c.fundo}>Ação do fundo</button>
          <button type="button" onClick={v.openRecibo}>Abrir recibo</button>
        </>
      ) : null}
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
    expect(patches.at(-1)).toEqual({ receberPagamento: true, alvoSuperficies: chave(LOJA, "a"), menu: null });
    expect(patches.some((x) => "stage" in x)).toBe(false);
    const dialogo = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect(within(dialogo).getAllByText(/R\$\s300,00/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Confirmar R\$/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(1));
    expect(p.receber).toHaveBeenCalledWith(expect.objectContaining({ linhas: [{ forma: "pix", valor: 300 }], sessaoId: "sessao-qa" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull());
    // Sucesso: fecha o sheet e abre o recibo da MESMA OS — nunca entrega.
    expect(patches).toEqual(expect.arrayContaining([{ receberPagamento: false }, { recibo: true, alvoSuperficies: chave(LOJA, "a") }]));
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("S01 duplo clique em Receber: uma única chamada ao contrato", async () => {
    const a = os("a");
    const pendente = adiado<boolean>();
    const p = pdv({ receber: vi.fn(() => pendente.promessa) });
    montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
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
    montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, confirmarEntrega, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
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
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
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

  it("logo após receber (comprovante da sessão = o persistido pelo servidor): 'Pagamento registrado. Falta confirmar a entrega.'", () => {
    const base = os("a");
    const a = os("a", "pronta", {
      timeline: [
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: recibo(base, 100, 100) } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: recibo(base, 200, 300) } },
      ],
    });
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, pdv: pdv({ ultimoRecibo: recibo(base, 200, 300) }) });
    expect(screen.getByText("Pagamento registrado. Falta confirmar a entrega.")).toBeTruthy();
  });

  it("R2 comprovante da sessão sem evidência persistida coerente nunca vale (nem para o aviso)", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, pdv: pdv({ ultimoRecibo: recibo(a, 200, 300) }) });
    expect(screen.queryByText("Pagamento registrado. Falta confirmar a entrega.")).toBeNull();
    expect(within(guia()).getByText("Pagamento quitado — confirmar entrega.")).toBeTruthy();
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

  it("R1 §F retirado por é obrigatório: em branco não confirma, avisa e devolve o foco ao campo", async () => {
    const a = os("a");
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    const campo = screen.getByLabelText("Retirado por") as HTMLInputElement;
    expect(campo.required).toBe(true);
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.click(confirmar()!);
    expect(await screen.findByText("Informe quem está retirando o aparelho.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("R1 §F sem nome de cliente na OS: o campo começa vazio e exige o retirante antes de entregar", async () => {
    const a = os("a", "pronta", { cliente: { nome: "" } });
    const confirmarEntrega = vi.fn(async () => true);
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega });
    expect((screen.getByLabelText("Retirado por") as HTMLInputElement).value).toBe("");
    fireEvent.click(confirmar()!);
    expect(await screen.findByText("Informe quem está retirando o aparelho.")).toBeTruthy();
    expect(confirmarEntrega).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Retirado por"), { target: { value: "Maria Portadora" } });
    fireEvent.click(confirmar()!);
    await waitFor(() => expect(confirmarEntrega).toHaveBeenCalledWith(undefined, undefined, "Maria Portadora"));
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
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: recibo(os("a"), 100, 100) } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: recibo(os("a"), 200, 300) } },
      ],
    });
    montar({ os: a, fin: { projection: projecao(a, PAGO) }, inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
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
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: recibo(os("a"), 100, 100) } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: recibo(os("a"), 200, 300) } },
        { id: "e3", tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:10:00Z", metadata: { estornado: 200, modo: "ultimo_pagamento" } },
      ],
    });
    montar({ os: a, fin: { projection: projecao(a, { status: "parcial", historico: [{ tipo: "pagamento", valor: 100, loteId: "op-e1" }, { tipo: "pagamento", valor: 200, loteId: "op-e2" }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 1 }] }) }, inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
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
    const aberto = { receberPagamento: true, recibo: true, estornoRecebimento: true, alvoSuperficies: chave(LOJA, "a") };
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

describe("OPS-V4-FLUXO-CURTO-006 — regressões da R1", () => {
  const timelineEstornada = () => [
    { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: recibo(os("a"), 100, 100) } },
    { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: recibo(os("a"), 200, 300) } },
    { id: "e3", tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:10:00Z", metadata: { estornado: 200, modo: "ultimo_pagamento" } },
  ];
  const PARCIAL_POS_ESTORNO: Titulo = { status: "parcial", historico: [{ tipo: "pagamento", valor: 100, loteId: "op-e1" }, { tipo: "pagamento", valor: 200, loteId: "op-e2" }, { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 1 }] };

  it("R1-P1a comprovante da SESSÃO estornado por outra sessão nunca é impresso: vale o persistido coerente", () => {
    const a = os("a", "pronta", { timeline: timelineEstornada() });
    montar({ os: a, fin: { projection: projecao(a, PARCIAL_POS_ESTORNO) }, pdv: pdv({ ultimoRecibo: recibo(os("a"), 200, 300) }), inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).queryByText("Quitação")).toBeNull();
    expect(within(d).getByText("Parcial")).toBeTruthy();
    expect(within(d).getByText("Reimpressão do último comprovante registrado nesta OS.")).toBeTruthy();
  });

  it("R1-P1a sem evidência coerente: o modal diz que o comprovante não está disponível (nada estornado é oferecido)", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: projecao(a, PARCIAL_POS_ESTORNO) }, pdv: pdv({ ultimoRecibo: recibo(os("a"), 200, 300) }), inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).getByText("O comprovante do recebimento atual não está disponível para reimpressão.")).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Imprimir comprovante" })).toBeNull();
  });

  it("R1-P1a leitura financeira em curso: nenhum comprovante é oferecido até confirmar", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: null, loading: true }, pdv: pdv({ ultimoRecibo: recibo(os("a"), 300, 300) }), inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).getByText("Confirmando os recebimentos desta OS…")).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Imprimir comprovante" })).toBeNull();
  });

  it("R1-P1c documento aberto para A entregue nunca aparece em B; Termo de Entrega exige OS entregue a cada render", () => {
    const entregue = os("a", "entregue", { entregueEm: "2026-10-08T12:00:00Z", entregaV3: { entregueEm: "2026-10-08T12:00:00Z", recebidoPor: "Ana" }, retirada: { confirmado: true, retiradoPor: "Ana", retiradoEm: "2026-10-08T12:00:00Z" } });
    const b = os("b");
    const view = montar({ os: entregue, fin: { projection: projecao(entregue, PAGO) } });
    act(() => sonda.v!.printItems.find((i) => i.label === "Termo de Entrega")!.onClick());
    expect(sonda.v!.docPrintTipo).toBe("termo_entrega");
    view.trocar({ os: b, fin: { projection: projecao(b, PAGO) } });
    expect(sonda.v!.docPrintTipo).toBeNull();
    cleanup();
    // Estado forçado (alvo = B, B não entregue): a guarda de render ainda recusa o termo.
    montar({ os: b, fin: { projection: projecao(b, PAGO) }, inicial: { docPrint: "termo_entrega", alvoSuperficies: chave(LOJA, "b") } });
    expect(sonda.v!.docPrintTipo).toBeNull();
  });

  it("R1-P2b/c leitura bloqueada após recusa só esconde o sheet: rascunho preservado e foco volta ao reaparecer", async () => {
    const a = os("a");
    const p = pdv({ receber: vi.fn(async () => false) });
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
    const s1 = await screen.findByRole("dialog", { name: "Receber pagamento" });
    fireEvent.click(within(s1).getByRole("button", { name: "Pagamento parcial" }));
    fireEvent.change(within(s1).getByLabelText("Valor da linha 1"), { target: { value: "120" } });
    fireEvent.click(within(s1).getByRole("button", { name: /^Confirmar R\$/ }));
    await waitFor(() => expect(p.receber).toHaveBeenCalledTimes(1));
    // Releitura devolve INCONSISTENT: o sheet some, mas o pedido de abertura NÃO é encerrado.
    const inconsistente = projecao(a, { status: "pendente", valor: 250 });
    expect(inconsistente.financialStatus).toBe("INCONSISTENT");
    view.trocar({ os: a, fin: { projection: inconsistente }, pdv: p });
    expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull();
    expect(patches.some((x) => x.receberPagamento === false)).toBe(false);
    // A leitura volta: mesmo rascunho, foco dentro do sheet, Escape fecha.
    view.trocar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: p });
    const s2 = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect((within(s2).getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("120");
    await waitFor(() => expect(s2.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull());
  });

  it("R1-P2b só estado terminal encerra o sheet hospedado na Entrega (quitada por outra sessão)", async () => {
    const a = os("a");
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
    await screen.findByRole("dialog", { name: "Receber pagamento" });
    view.trocar({ os: a, fin: { projection: projecao(a, PAGO) } });
    await waitFor(() => expect(patches).toEqual(expect.arrayContaining([{ receberPagamento: false }])));
    expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull();
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — regressões da R2", () => {
  const comprovanteEm = (valor: number, acumulado: number, forma: "pix" | "dinheiro", dataHora: string) =>
    montarComprovanteReciboV3({
      os: os("a"), linhas: [{ forma, valor }], valorPago: valor,
      pagamento: { total: 300, recebido: acumulado, saldo: 300 - acumulado, status: acumulado >= 300 ? "quitado" : "parcial" } as never,
      intencaoLabel: acumulado >= 300 ? "Quitação" : "Parcial", operador: "QA", dataHora,
    });

  it("R2-P1 estorno do PIX 200 e reposição em dinheiro (mesmo acumulado): o PIX da sessão nunca é impresso", () => {
    const pix200 = comprovanteEm(200, 300, "pix", "2026-10-08T12:05:00.000Z");
    const dinheiro200 = comprovanteEm(200, 300, "dinheiro", "2026-10-08T12:20:00.000Z");
    const a = os("a", "pronta", {
      timeline: [
        { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: comprovanteEm(100, 100, "pix", "2026-10-08T12:00:00.000Z") } },
        { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: pix200 } },
        { id: "e3", tipo: "financeiro_conta_receber_atualizada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:10:00Z", metadata: { estornado: 200, modo: "ultimo_pagamento" } },
        { id: "e4", tipo: "operacao_cobranca_gerada", autor: "Outro", conteudo: "", criadoEm: "2026-10-08T12:20:00Z", metadata: { operacaoId: "op-e4", comprovante: dinheiro200 } },
      ],
    });
    const titulo: Titulo = {
      status: "pago",
      historico: [
        { tipo: "pagamento", valor: 100, loteId: "op-e1" },
        { tipo: "pagamento", valor: 200, loteId: "op-e2" },
        { tipo: "estorno_pagamento", valor: 200, refHistoricoIndex: 1 },
        { tipo: "pagamento", valor: 200, loteId: "op-e4" },
      ],
    };
    montar({ os: a, fin: { projection: projecao(a, titulo) }, pdv: pdv({ ultimoRecibo: pix200 }), inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).getByText("Dinheiro")).toBeTruthy();
    expect(within(d).queryByText("PIX")).toBeNull();
    expect(within(d).getByText("Reimpressão do último comprovante registrado nesta OS.")).toBeTruthy();
    // E o aviso de "acabou de receber" não usa o PIX estornado.
    expect(screen.queryByText("Pagamento registrado. Falta confirmar a entrega.")).toBeNull();
  });

  it("R2-P1 leitura com erro: o modal diz que não foi possível confirmar (nunca 'confirmando' eterno)", () => {
    const a = os("a");
    montar({ os: a, fin: { projection: null, error: "Falha de rede." }, pdv: pdv({ ultimoRecibo: recibo(a, 300, 300) }), inicial: { recibo: true, alvoSuperficies: chave(LOJA, "a") } });
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(d).getByText("Não foi possível confirmar os recebimentos desta OS.")).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Imprimir comprovante" })).toBeNull();
  });

  it("R2-P2 sheet aberto com operação anterior em voo: foco entra no sheet e Escape fecha quando libera", async () => {
    const a = os("a");
    const ocupado = pdv({ recebendo: true });
    const view = montar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: ocupado, inicial: { receberPagamento: true, alvoSuperficies: chave(LOJA, "a") } });
    const s = await screen.findByRole("dialog", { name: "Receber pagamento" });
    expect((within(s).getByRole("button", { name: "Fechar recebimento" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(s.contains(document.activeElement)).toBe(true));
    // Ocupado: Tab não escapa do sheet e Escape não fecha. Liberado: Escape fecha.
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(s.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Receber pagamento" })).toBeTruthy();
    view.trocar({ os: a, fin: { projection: projecao(a, ABERTO) }, pdv: { ...ocupado, recebendo: false } });
    expect(s.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Receber pagamento" })).toBeNull());
  });
});

describe("OPS-V4-FLUXO-CURTO-006 rev 13 — teclado do recibo (R3-P2, teclado real via user-event)", () => {
  const timelineQuitada = () => [
    { id: "e1", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:00:00Z", metadata: { operacaoId: "op-e1", comprovante: recibo(os("a"), 100, 100) } },
    { id: "e2", tipo: "operacao_cobranca_gerada", autor: "QA", conteudo: "", criadoEm: "2026-10-08T12:05:00Z", metadata: { operacaoId: "op-e2", comprovante: recibo(os("a"), 200, 300) } },
  ];
  async function abrir() {
    const fundo = vi.fn();
    const confirmarEntrega = vi.fn(async () => true);
    const a = os("a", "pronta", { timeline: timelineQuitada() });
    const cenario: Cenario = { os: a, fin: { projection: projecao(a, PAGO) }, confirmarEntrega, fundo };
    const view = montar(cenario);
    const user = userEvent.setup();
    const abridor = screen.getByRole("button", { name: "Abrir recibo" });
    await user.click(abridor);
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    const controles = [
      within(d).getByRole("button", { name: "Fechar comprovante" }),
      within(d).getByRole("button", { name: "Imprimir comprovante" }),
      within(d).getByRole("button", { name: "Fechar" }),
    ];
    return { user, d, abridor, fundo, confirmarEntrega, controles, primeiro: controles[0]!, ultimo: controles[2]!, view, cenario, a };
  }

  it("K01 foco inicial fica dentro do recibo", async () => {
    const { d, primeiro } = await abrir();
    expect(d.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(primeiro);
  });

  it("K02 Tab percorre somente os controles do recibo, na ordem", async () => {
    const { user, d, controles } = await abrir();
    const visitados: Element[] = [document.activeElement!];
    for (let i = 0; i < 5; i++) {
      await user.tab();
      visitados.push(document.activeElement!);
    }
    expect(visitados.every((el) => d.contains(el))).toBe(true);
    expect(visitados).toEqual([...controles, ...controles]);
  });

  it("K03 Tab no último controle volta ao primeiro", async () => {
    const { user, primeiro, ultimo } = await abrir();
    act(() => ultimo.focus());
    await user.tab();
    expect(document.activeElement).toBe(primeiro);
  });

  it("K04 Shift+Tab no primeiro controle vai ao último", async () => {
    const { user, primeiro, ultimo } = await abrir();
    expect(document.activeElement).toBe(primeiro);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("K05 o foco nunca chega a um controle do fundo (Tab, Shift+Tab ou foco programático)", async () => {
    const { user, d } = await abrir();
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: i % 2 === 1 });
      expect(d.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: true });
      expect(d.contains(document.activeElement)).toBe(true);
    }
    // Foco movido para o fundo por outro caminho (clique/script): volta para o recibo.
    act(() => screen.getByRole("button", { name: "Ação do fundo" }).focus());
    expect(d.contains(document.activeElement)).toBe(true);
    act(() => screen.getByLabelText("Retirado por").focus());
    expect(d.contains(document.activeElement)).toBe(true);
  });

  it("K06 Enter com o recibo aberto nunca dispara controle do fundo", async () => {
    const { user, fundo, confirmarEntrega, primeiro, ultimo } = await abrir();
    // Tentativa de fuga pelo início (Shift+Tab) seguida de Enter: cai no último controle DO recibo.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(ultimo);
    // Tentativa por foco programático no fundo + Enter.
    act(() => screen.getByRole("button", { name: "Ação do fundo" }).focus());
    expect(document.activeElement).toBe(primeiro);
    await user.keyboard("{Enter}");
    expect(fundo).not.toHaveBeenCalled();
    expect(confirmarEntrega).not.toHaveBeenCalled();
    // O Enter acionou o controle do recibo em foco (fechar), não o fundo.
    expect(patches.at(-1)).toEqual({ recibo: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("K07 Escape fecha o recibo", async () => {
    const { user } = await abrir();
    await user.tab();
    await user.keyboard("{Escape}");
    expect(patches.at(-1)).toEqual({ recibo: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("K08 ao fechar, o foco volta ao botão que abriu o recibo", async () => {
    const { user, abridor } = await abrir();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(abridor);
    // Também pelo botão Fechar, via teclado.
    await user.click(abridor);
    const d = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "Fechar" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(abridor);
  });

  it("outro diálogo modal por cima do recibo fica com o foco; o fundo continua bloqueado", async () => {
    const { d } = await abrir();
    const outro = document.createElement("div");
    outro.setAttribute("role", "dialog");
    outro.setAttribute("aria-modal", "true");
    const botao = document.createElement("button");
    botao.textContent = "Controle do outro diálogo";
    outro.append(botao);
    document.body.append(outro);
    try {
      act(() => botao.focus());
      expect(document.activeElement).toBe(botao);
      act(() => screen.getByRole("button", { name: "Ação do fundo" }).focus());
      expect(d.contains(document.activeElement)).toBe(true);
    } finally {
      outro.remove();
    }
  });

  it("comprovante deixa de valer com a impressão aberta: a impressão fecha e o teclado volta a ficar preso no recibo", async () => {
    const { user, d, fundo, view, cenario, a } = await abrir();
    await user.click(within(d).getByRole("button", { name: "Imprimir comprovante" }));
    expect(await screen.findByRole("button", { name: /Voltar/ })).toBeTruthy();
    // Releitura: o título agora tem uma reposição sem identidade (Financeiro) → comprovante indisponível.
    const reposto: Titulo = { status: "pago", historico: [{ tipo: "pagamento", valor: 100, loteId: "op-e1" }, { tipo: "pagamento", valor: 200 }] };
    view.trocar({ ...cenario, fin: { projection: projecao(a, reposto) } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Voltar/ })).toBeNull());
    const dialogo = screen.getByRole("dialog", { name: /Recibo de pagamento/ });
    expect(within(dialogo).getByText("O comprovante do recebimento atual não está disponível para reimpressão.")).toBeTruthy();
    expect(dialogo.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: i % 2 === 0 });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    expect(fundo).not.toHaveBeenCalled();
  });

  it("R4 impressão aberta: o foco entra nela, Tab/Shift+Tab não saem dela, fundo e recibo de trás ficam inacessíveis e Enter nunca aciona o fundo", async () => {
    const { user, d, fundo, confirmarEntrega, abridor } = await abrir();
    await user.click(within(d).getByRole("button", { name: "Imprimir comprovante" }));
    const voltar = await screen.findByRole("button", { name: /Voltar/ });
    const camada = document.querySelector("[data-og-recibo-overlay]")!;
    expect(camada.contains(voltar)).toBe(true);
    // Foco entra na impressão ao abrir.
    await waitFor(() => expect(document.activeElement).toBe(voltar));
    // Tab/Shift+Tab (o cenário da R4: dois Shift+Tab levavam ao fundo) circulam só na impressão.
    for (const shift of [true, true, true, false, false, false]) {
      await user.tab({ shift });
      expect(camada.contains(document.activeElement)).toBe(true);
    }
    // Foco movido para o fundo ou para o recibo atrás da impressão: volta para a impressão.
    for (const alvo of [screen.getByRole("button", { name: "Ação do fundo" }), abridor, within(d).getByRole("button", { name: "Fechar comprovante" })]) {
      act(() => alvo.focus());
      expect(camada.contains(document.activeElement)).toBe(true);
    }
    // Enter no controle da impressão em foco (Voltar): fecha só a impressão — nunca o fundo.
    act(() => voltar.focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Voltar/ })).toBeNull());
    expect(fundo).not.toHaveBeenCalled();
    expect(confirmarEntrega).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Recibo de pagamento/ })).toBeTruthy();
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "Imprimir comprovante" }));
  });

  it("impressão por cima: Escape fecha só a impressão e o foco volta ao Imprimir, ainda preso no recibo", async () => {
    const { user, d, fundo } = await abrir();
    await user.click(within(d).getByRole("button", { name: "Imprimir comprovante" }));
    expect(await screen.findByRole("button", { name: /Voltar/ })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Voltar/ })).toBeNull());
    expect(screen.getByRole("dialog", { name: /Recibo de pagamento/ })).toBeTruthy();
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "Imprimir comprovante" }));
    await user.tab();
    expect(d.contains(document.activeElement)).toBe(true);
    expect(fundo).not.toHaveBeenCalled();
  });
});
