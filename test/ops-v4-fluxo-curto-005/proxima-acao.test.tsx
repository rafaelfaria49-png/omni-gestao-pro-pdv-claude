// OPS-V4-FLUXO-CURTO-005 — "Próxima ação" montada (jsdom), C01–C14.
//
// Monta o bloco REAL (ProximaAcaoV4) sobre o `buildVals` REAL e a trava REAL
// (`useEscritaPrimariaV4`), com OS sintéticas "do servidor" e handlers espiões.
// As actions "use server" da V3 são cortadas por mock só para o módulo carregar
// (mesmo padrão de preview-honesty); nenhuma escrita real acontece aqui.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";

vi.mock("@/app/actions/ordens", () => ({ listOrdens: vi.fn(async () => []), getOrdem: vi.fn(async () => null) }));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(),
  salvarOrcamentoV3: vi.fn(),
  corrigirOrcamentoV3: vi.fn(),
  aprovarOrcamentoV3: vi.fn(),
  recusarOrcamentoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/status-actions", () => ({ aplicarTransicaoStatusV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/prova-entrada-actions", () => ({
  salvarIdentificacaoV3: vi.fn(),
  salvarProvaEntradaV3: vi.fn(),
  salvarAcessoriosEntradaV3: vi.fn(),
  adicionarFotoEntradaV3: vi.fn(),
  removerFotoEntradaV3: vi.fn(),
  salvarAssinaturaClienteV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/dados-basicos-actions", () => ({ salvarDadosBasicosOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/producao-actions", () => ({
  atribuirTecnicoV3: vi.fn(),
  definirPrioridadeV3: vi.fn(),
  definirLocalFisicoV3: vi.fn(),
  adicionarObservacaoInternaV3: vi.fn(),
  salvarChecklistTecnicoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/estoque-actions", () => ({ consumirEstoqueOSActionV3: vi.fn() }));
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  salvarAssinaturaRetiradaV3: vi.fn(),
  registrarEntregaV3: vi.fn(),
  adicionarFotoSaidaV3: vi.fn(),
  removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({ abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })),
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(),
}));

import type { OrdemServico } from "@/types/os";
import type { V4Stage, V4State } from "@/components/operacoes-v4-preview/types";
import type { FinancialProjectionOSV4, FinancialStatusV4 } from "@/lib/operacoes-v4/financial-projection";
import { buildVals, useEscritaPrimariaV4, type V4DataCtx } from "@/components/operacoes-v4-preview/use-v4-preview";
import { ProximaAcaoV4 } from "@/components/operacoes-v4-preview/parts/ProximaAcaoV4";

afterEach(() => cleanup());

const ROOT = resolve(__dirname, "..", "..");
const fonte = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function estado(over: Partial<V4State> = {}): V4State {
  return {
    view: "cockpit", module: "workspace", stage: "entrada", status: "em_execucao", left: false, right: false,
    menu: null, toast: "", prioridade: "normal", histFilter: "todos", novaOS: false, novoAtendimento: false,
    recibo: false, atendimentoRapido: false, orcamentoRapido: false, estornoRecebimento: false,
    receberPagamento: false, cancelamentoOS: false, selectedOsId: null, focus: true, authState: "autorizado",
    pin4: 0, pin6: 0, pattern: [], senha: "", motivo: "", docPrint: null, ...over,
  };
}

function os(id: string, status: string, extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id, storeId: "loja-1", numero: id.toUpperCase(), status: status === "recebida" ? "pronta" : status,
    operacaoStatusV3: status, cliente: { nome: "Cliente QA 005" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA" },
    timeline: [], ...extra,
  } as unknown as OrdemServico;
}

function projecao(osId: string, financialStatus: FinancialStatusV4): FinancialProjectionOSV4 {
  const canDeliver = financialStatus === "PAID" || financialStatus === "AUTHORIZED_CREDIT" || financialStatus === "AUTHORIZED_NO_CHARGE";
  return {
    version: 1, storeId: "loja-1", osId, osCode: osId, operationalStatus: "pronta", expectedTotal: 400, expectedTotalSource: ["qa"],
    approvedBudgetTotal: 400, osColumnTotal: 400, legacyTotal: null, billingSnapshotTotal: null, receivableFound: true,
    receivableId: "cr", receivableTotal: 400, receivableStatus: "pendente", receivedTotal: financialStatus === "PAID" ? 400 : 0,
    reversedTotal: 0, balance: financialStatus === "PAID" ? 0 : 400, financialStatus,
    consistencyStatus: financialStatus === "INCONSISTENT" ? "INCONSISTENT" : "CONSISTENT",
    consistencyIssues: financialStatus === "INCONSISTENT" ? ["Valor do título diverge do orçamento."] : [],
    paymentMethods: [], collectionMode: null, installments: [], authorizedCredit: false, authorizedNoCharge: false,
    noChargeCategory: null, noChargeReason: null, financialEvents: [], canReceive: financialStatus === "OPEN",
    canDeliver, deliveryDecision: canDeliver ? "ALLOW_PAID" : "BLOCK_PENDING_BALANCE", loadedAt: "2026-10-07T12:00:00.000Z", errorCode: null,
  };
}

type Financeiro = V4DataCtx["financialProjection"];
const finVazio: Financeiro = { projection: null, loading: false, error: null, reload: () => {} };

const ctxBase = {
  ordens: [], ordensLoading: false, ordensPrimeiraCarga: false, ordensError: null,
  reloadOrdens: () => {}, reloadDetail: () => {}, realOS: null, detailLoading: false,
  financialProjection: finVazio, financialProjectionsByOsId: new Map(), financialRailLoading: false, financialRailError: null,
  salvarDiagnostico: async () => false, gerarOrcamento: async () => false, salvarOrcamento: async () => false,
  corrigirOrcamento: async () => false, aprovarOrcamento: async () => false, recusarOrcamento: async () => false,
  iniciarDiagnostico: async () => false, iniciarServico: async () => false, marcarAguardandoPeca: async () => false,
  marcarPronta: async () => false, baixarEstoqueOS: async () => false, tecnicosCadastro: [], irParaConfiguracoes: () => {},
  confirmarEntrega: async () => false, salvarAssinaturaRetirada: async () => false, adicionarFotoSaida: async () => false,
  removerFotoSaida: async () => false, registrarImpressaoDoc: () => {}, salvarGarantia: async () => false,
  abrirRetorno: async () => false, finalizarRetorno: async () => false, abrirOsVinculada: () => {},
  lancarAPrazo: async () => false, cancelarOS: async () => false,
  pdvServico: { pagamento: null, sessao: null, loading: false, recebendo: false, estornando: false, error: null, ultimoRecibo: null, reload: () => {}, receber: async () => false, estornar: async () => false, limparRecibo: () => {} },
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
  lojaId: string;
  os: OrdemServico | null;
  stage?: V4Stage;
  financeiro?: Financeiro;
  detalheCarregando?: boolean;
  detalheErro?: string | null;
  orcamentoMaterializado?: boolean;
  iniciarDiagnostico?: () => Promise<boolean>;
  iniciarServico?: () => Promise<boolean>;
  confirmarEntrega?: V4DataCtx["confirmarEntrega"];
}

const patches: Array<Record<string, unknown>> = [];

/** Trava REAL + buildVals REAL + bloco REAL; a etapa ativa responde aos patches. */
function Harness({ c }: { c: Cenario }) {
  const [stage, setStage] = useState<V4Stage>(c.stage ?? "entrada");
  const iniciarDiagnostico = c.iniciarDiagnostico ?? (async () => false);
  const iniciarServico = c.iniciarServico ?? (async () => false);
  const escritaPrimaria = useEscritaPrimariaV4({
    lojaAtivaId: c.lojaId,
    selectedOsId: c.os?.id ?? null,
    detalhe: c.os,
    detalheCarregando: !!c.detalheCarregando,
    detalheErro: !!c.detalheErro,
    iniciarDiagnostico,
    iniciarServico,
  });
  const realOS = c.os && c.orcamentoMaterializado
    ? ({ ...c.os, orcamento: { id: "orc", status: "rascunho", servicos: [], pecas: [], total: 400, desconto: 0, criadoEm: "2026-10-07" } } as unknown as OrdemServico)
    : c.os;
  const v = buildVals(
    estado({ selectedOsId: c.os?.id ?? null, stage }),
    (p) => {
      const patch = (typeof p === "function" ? p(estado({ stage })) : p) as Partial<V4State>;
      patches.push(patch as Record<string, unknown>);
      if (patch.stage) setStage(patch.stage);
    },
    () => {},
    {
      ...ctxBase,
      lojaAtivaId: c.lojaId,
      realOS,
      detailLoading: !!c.detalheCarregando,
      detailError: c.detalheErro ?? null,
      detailCarregada: !c.detalheCarregando && !c.detalheErro && !!c.os,
      financialProjection: c.financeiro ?? finVazio,
      iniciarDiagnostico,
      iniciarServico,
      escritaPrimaria,
      confirmarEntrega: c.confirmarEntrega ?? (async () => false),
    },
  );
  return <ProximaAcaoV4 v={v} />;
}

const bloco = () => screen.getByRole("region", { name: "Próxima ação da OS" });
const botoes = () => within(bloco()).queryAllByRole("button");

function adiado() {
  let resolver: (ok: boolean) => void = () => {};
  const promessa = new Promise<boolean>((r) => { resolver = r; });
  return { promessa, resolver: (ok: boolean) => resolver(ok) };
}

function montar(c: Cenario) {
  patches.length = 0;
  const r = render(<Harness c={c} />);
  return { ...r, trocar: (n: Cenario) => r.rerender(<Harness c={n} />) };
}

describe("OPS-V4-FLUXO-CURTO-005 — bloco Próxima ação (C01–C08)", () => {
  it("C01 renderiza estado, título, descrição e CTA corretos (aberta → Iniciar diagnóstico)", () => {
    montar({ lojaId: "loja-1", os: os("os-1", "aberta") });
    const b = bloco();
    expect(b.getAttribute("data-estado")).toBe("acao");
    expect(b.getAttribute("data-efeito")).toBe("write");
    expect(within(b).getByText("Próxima ação")).toBeTruthy();
    expect(within(b).getByText("Iniciar diagnóstico", { selector: "span" })).toBeTruthy();
    expect(within(b).getByText(/Muda o status da OS para Diagnóstico/)).toBeTruthy();
    expect(within(b).getByRole("button", { name: "Iniciar diagnóstico" })).toBeTruthy();
  });

  it("C02 WAIT/aguardando não tem botão mutante: só abre o orçamento, nenhuma escrita", async () => {
    const iniciarServico = vi.fn(async () => true);
    const iniciarDiagnostico = vi.fn(async () => true);
    montar({ lojaId: "loja-1", os: os("os-2", "aguardando_aprovacao"), iniciarServico, iniciarDiagnostico, orcamentoMaterializado: true });
    expect(bloco().getAttribute("data-estado")).toBe("aguardando");
    expect(within(bloco()).getByText("Aguardando")).toBeTruthy();
    expect(botoes().map((b) => b.textContent)).toEqual(["Abrir orçamento"]);
    await userEvent.click(within(bloco()).getByRole("button", { name: "Abrir orçamento" }));
    expect(patches.at(-1)).toMatchObject({ stage: "orcamento" });
    expect(iniciarServico).not.toHaveBeenCalled();
    expect(iniciarDiagnostico).not.toHaveBeenCalled();
    expect(patches.every((p) => !("status" in p))).toBe(true);
  });

  it("C03 bloqueio mostra o motivo explícito (financeiro inconsistente)", () => {
    montar({ lojaId: "loja-1", os: os("os-3", "pronta"), stage: "entrega", financeiro: { ...finVazio, projection: projecao("os-3", "INCONSISTENT") } });
    expect(bloco().getAttribute("data-estado")).toBe("bloqueada");
    expect(within(bloco()).getByText("Revisar")).toBeTruthy();
    expect(within(bloco()).getByText(/Valor do título diverge do orçamento/)).toBeTruthy();
    expect(within(bloco()).getByRole("button", { name: "Abrir financeiro" })).toBeTruthy();
  });

  it("C04 financeiro carregando não mostra entrega (CTA desabilitado, nada acionável)", () => {
    montar({ lojaId: "loja-1", os: os("os-4", "pronta"), stage: "entrega", financeiro: { ...finVazio, loading: true } });
    expect(within(bloco()).getByText("Carregando situação financeira…")).toBeTruthy();
    expect(within(bloco()).queryByText(/entrega/i)).toBeNull();
    const cta = within(bloco()).getByRole("button", { name: "Carregando…" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("C05 concluída (entregue) sem transição; pós-venda só navega", async () => {
    montar({ lojaId: "loja-1", os: os("os-5", "entregue"), stage: "entrega" });
    expect(bloco().getAttribute("data-estado")).toBe("concluida");
    expect(within(bloco()).getByText("Fluxo operacional concluído")).toBeTruthy();
    expect(botoes().map((b) => b.textContent)).toEqual(["Abrir pós-venda"]);
    await userEvent.click(within(bloco()).getByRole("button", { name: "Abrir pós-venda" }));
    expect(patches.at(-1)).toMatchObject({ stage: "posvenda" });
    // Já no pós-venda, o atalho some (sem botão que leva para onde já se está).
    expect(botoes()).toHaveLength(0);
  });

  it("C06 CTA navega ao Financeiro (pronta + saldo) e depois aponta o controle da própria etapa", async () => {
    montar({ lojaId: "loja-1", os: os("os-6", "pronta"), stage: "entrega", financeiro: { ...finVazio, projection: projecao("os-6", "OPEN") } });
    expect(within(bloco()).getByText("Receber pagamento")).toBeTruthy();
    await userEvent.click(within(bloco()).getByRole("button", { name: "Abrir financeiro" }));
    expect(patches.at(-1)).toMatchObject({ stage: "financeiro" });
    expect(within(bloco()).getByText("Nesta etapa, logo abaixo")).toBeTruthy();
    expect(botoes()).toHaveLength(0);
  });

  it("C07 CTA navega à Entrega (pronta + quitada) sem entregar", async () => {
    const confirmarEntrega = vi.fn(async () => true);
    montar({ lojaId: "loja-1", os: os("os-7", "pronta"), stage: "financeiro", financeiro: { ...finVazio, projection: projecao("os-7", "PAID") }, confirmarEntrega });
    expect(within(bloco()).getByText("Confirmar entrega")).toBeTruthy();
    await userEvent.click(within(bloco()).getByRole("button", { name: "Abrir entrega" }));
    expect(patches.at(-1)).toMatchObject({ stage: "entrega" });
    expect(confirmarEntrega).not.toHaveBeenCalled();
  });

  it("C08 aprovado usa a ação existente de iniciar execução; na Execução não duplica o botão", async () => {
    const iniciarServico = vi.fn(async () => true);
    const { trocar } = montar({ lojaId: "loja-1", os: os("os-8", "aprovado"), stage: "entrada", iniciarServico });
    await userEvent.click(within(bloco()).getByRole("button", { name: "Iniciar execução" }));
    expect(iniciarServico).toHaveBeenCalledTimes(1);
    cleanup();
    montar({ lojaId: "loja-1", os: os("os-8b", "aprovado"), stage: "execucao", iniciarServico });
    expect(within(bloco()).getByText("Iniciar execução")).toBeTruthy();
    expect(within(bloco()).queryByRole("button", { name: /Iniciar execução/ })).toBeNull();
    expect(within(bloco()).getByText("Nesta etapa, logo abaixo")).toBeTruthy();
    void trocar;
  });
});

describe("OPS-V4-FLUXO-CURTO-005 — trava, troca de OS/loja, Entrada, teclado (C09–C14)", () => {
  it("C09 duplo clique não duplica a escrita; a trava só cai quando o detalhe é relido", async () => {
    const d = adiado();
    const iniciarServico = vi.fn(() => d.promessa);
    const osA = os("os-9", "aprovado");
    const { trocar } = montar({ lojaId: "loja-1", os: osA, iniciarServico });
    const cta = within(bloco()).getByRole("button", { name: "Iniciar execução" });
    fireEvent.click(cta);
    fireEvent.click(cta);
    fireEvent.click(cta);
    expect(iniciarServico).toHaveBeenCalledTimes(1);
    const busy = within(bloco()).getByRole("button", { name: "Processando…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await act(async () => { d.resolver(true); await d.promessa; });
    // Escrita concluída, detalhe ainda o mesmo objeto: continua travado (sem 2ª escrita).
    expect((within(bloco()).getByRole("button", { name: "Processando…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(bloco()).getByRole("button", { name: "Processando…" }));
    expect(iniciarServico).toHaveBeenCalledTimes(1);
    // Detalhe relido (novo objeto da mesma OS) → destrava.
    await act(async () => { trocar({ lojaId: "loja-1", os: os("os-9", "em_execucao"), iniciarServico }); });
    expect(within(bloco()).getByText("Marcar como pronta")).toBeTruthy();
  });

  it("C09b escrita que falha libera a trava na hora (sem prender o operador)", async () => {
    const iniciarServico = vi.fn(async () => false);
    montar({ lojaId: "loja-1", os: os("os-9b", "aprovado"), iniciarServico });
    await userEvent.click(within(bloco()).getByRole("button", { name: "Iniciar execução" }));
    const cta = within(bloco()).getByRole("button", { name: "Iniciar execução" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });

  it("C10 troca de OS durante a resposta mantém B: ação de B correta, sem trava nem navegação vindas de A", async () => {
    const d = adiado();
    const iniciarServico = vi.fn(() => d.promessa);
    const { trocar } = montar({ lojaId: "loja-1", os: os("os-A", "aprovado"), iniciarServico });
    fireEvent.click(within(bloco()).getByRole("button", { name: "Iniciar execução" }));
    expect(iniciarServico).toHaveBeenCalledTimes(1);
    // Operador troca para B (pronta e quitada) enquanto A ainda grava.
    await act(async () => {
      trocar({ lojaId: "loja-1", os: os("os-B", "pronta"), financeiro: { ...finVazio, projection: projecao("os-B", "PAID") }, iniciarServico });
    });
    expect(within(bloco()).getByText("Confirmar entrega")).toBeTruthy();
    expect((within(bloco()).getByRole("button", { name: "Abrir entrega" }) as HTMLButtonElement).disabled).toBe(false);
    const antes = patches.length;
    await act(async () => { d.resolver(true); await d.promessa; });
    expect(within(bloco()).getByText("Confirmar entrega")).toBeTruthy();
    expect(within(bloco()).queryByText("Processando…")).toBeNull();
    expect(patches.slice(antes)).toEqual([]);
    expect(iniciarServico).toHaveBeenCalledTimes(1);
  });

  it("C11 troca de loja mantém isolamento: a trava de loja-1 não atinge a mesma OS em loja-2", async () => {
    const d = adiado();
    const iniciarServico = vi.fn(() => d.promessa);
    const { trocar } = montar({ lojaId: "loja-1", os: os("os-11", "aprovado"), iniciarServico });
    fireEvent.click(within(bloco()).getByRole("button", { name: "Iniciar execução" }));
    await act(async () => { trocar({ lojaId: "loja-2", os: os("os-11", "aprovado"), iniciarServico }); });
    const cta = within(bloco()).getByRole("button", { name: "Iniciar execução" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    await act(async () => { d.resolver(true); await d.promessa; });
    expect(iniciarServico).toHaveBeenCalledTimes(1);
    expect((within(bloco()).getByRole("button", { name: "Iniciar execução" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("C12 Entrada pendente não volta a bloquear status adiantado", () => {
    // OS aprovada com a Entrada praticamente vazia (sem prova, acessórios ou checklist).
    montar({ lojaId: "loja-1", os: os("os-12", "aprovado", { provaEntradaV3: undefined, checklist: [], aberturaV3: { recepcao: {} } }) });
    expect(within(bloco()).getByText("Iniciar execução", { selector: "span" })).toBeTruthy();
    expect(within(bloco()).queryByText(/entrada|complementar|pend/i)).toBeNull();
    expect((within(bloco()).getByRole("button", { name: "Iniciar execução" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("C13 Enter digitando em campo não dispara a próxima ação (sem listener global)", async () => {
    const iniciarDiagnostico = vi.fn(async () => true);
    const add = vi.spyOn(window, "addEventListener");
    const add2 = vi.spyOn(document, "addEventListener");
    render(
      <>
        <input aria-label="Campo de teste" />
        <textarea aria-label="Texto de teste" />
        <Harness c={{ lojaId: "loja-1", os: os("os-13", "aberta"), iniciarDiagnostico }} />
      </>,
    );
    expect(add.mock.calls.some(([tipo]) => tipo === "keydown" || tipo === "keypress" || tipo === "keyup")).toBe(false);
    expect(add2.mock.calls.some(([tipo]) => tipo === "keydown" || tipo === "keypress" || tipo === "keyup")).toBe(false);
    await userEvent.type(screen.getByLabelText("Campo de teste"), "abc{Enter}");
    await userEvent.type(screen.getByLabelText("Texto de teste"), "linha{Enter}");
    expect(iniciarDiagnostico).not.toHaveBeenCalled();
    add.mockRestore();
    add2.mockRestore();
    // Nem o bloco, nem o header, nem o workspace registram atalho de teclado.
    for (const rel of [
      "components/operacoes-v4-preview/parts/ProximaAcaoV4.tsx",
      "components/operacoes-v4-preview/parts/CommandHeader.tsx",
      "components/operacoes-v4-preview/parts/WorkspaceView.tsx",
    ]) {
      expect(fonte(rel), rel).not.toMatch(/addEventListener\(\s*["']key|onKeyDown|↵/);
    }
  });

  it("C14 mobile: estrutura sem overflow (container query empilha, min-width:0, sem largura fixa)", () => {
    const css = fonte("components/operacoes-v4-preview/parts/proxima-acao-v4.module.css");
    expect(css).toMatch(/container-type:\s*inline-size/);
    expect(css).toMatch(/@container \(max-width: 620px\)[\s\S]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.body\s*\{[\s\S]*?min-width:\s*0/);
    expect(css).not.toMatch(/(^|[^-])width:\s*\d+px/m);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    montar({ lojaId: "loja-1", os: os("os-14", "aberta") });
    expect(bloco().getAttribute("style")).toBeNull();
  });
});

describe("OPS-V4-FLUXO-CURTO-005 — fonte única (header × bloco) e mock fora da autoridade", () => {
  it("header não tem CTA primário próprio nem usa PRIMARY; mock-data não exporta PRIMARY", () => {
    const header = fonte("components/operacoes-v4-preview/parts/CommandHeader.tsx");
    const hook = fonte("components/operacoes-v4-preview/use-v4-preview.ts");
    const mock = fonte("components/operacoes-v4-preview/mock-data.ts");
    expect(header).not.toMatch(/onPrimary|primaryLabel|hasPrimary|noPrimary|showKbd|Fluxo concluído/);
    expect(hook).not.toMatch(/\bPRIMARY\b/);
    expect(hook).toContain("derivarProximaAcaoV4(");
    expect(mock).not.toMatch(/export const PRIMARY\b/);
    expect(fonte("components/operacoes-v4-preview/parts/WorkspaceView.tsx")).toContain("<ProximaAcaoV4 v={v} />");
  });

  it("nenhuma ação primária usa o toast 'Indisponível nesta versão'", () => {
    const hook = fonte("components/operacoes-v4-preview/use-v4-preview.ts");
    expect(hook).not.toContain("Indisponível nesta versão");
  });
});
