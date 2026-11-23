// GOAL OPERACOES-V3-NOVA-OS-SELETOR-003 — "Nova OS" da V3 abre o seletor de 3 opções
// (Nova OS · Orçamento · Retorno / Garantia), cada uma no motor V3 já existente.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { OrigemRetornoResumoV4 } from "@/lib/operacoes-v4/retorno-origem-v4";

const mocks = vi.hoisted(() => ({
  criarOSEnterpriseV3: vi.fn(),
  criarOSPreOrcamentoV3: vi.fn(),
  abrirRetornoV3: vi.fn(),
  buscarOrigensRetornoV3: vi.fn(),
  reload: vi.fn(),
}));

// O Shell monta todas as telas; actions de outras telas importam o auth do servidor.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/api/clientes", () => ({ listClientes: vi.fn(async () => []) }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-qa", empresaDocumentos: null }) }));
vi.mock("@/lib/operacoes-v3/nova-os-actions", () => ({
  criarOSEnterpriseV3: mocks.criarOSEnterpriseV3,
  criarOSPreOrcamentoV3: mocks.criarOSPreOrcamentoV3,
}));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({
  abrirRetornoV3: mocks.abrirRetornoV3,
  buscarOrigensRetornoV3: mocks.buscarOrigensRetornoV3,
  finalizarRetornoV3: vi.fn(),
  lerOrigemRetornoV3: vi.fn(),
}));
vi.mock("@/components/operacoes-v3/hooks/use-ordens-v3", () => ({
  useOrdensV3: () => ({ ordens: [], loading: false, primeiraCarga: false, error: null, reload: mocks.reload }),
}));

import { NovoAtendimentoSeletorV3 } from "@/components/operacoes-v3/components/NovoAtendimentoSeletorV3";
import { NovaOSEnterpriseModalV3 } from "@/components/operacoes-v3/components/NovaOSEnterpriseModalV3";
import { RetornoOrigemV3Modal } from "@/components/operacoes-v3/components/RetornoOrigemV3Modal";
import { OperacoesV3Shell } from "@/components/operacoes-v3/OperacoesV3Shell";

function origem(over: Partial<OrigemRetornoResumoV4> = {}): OrigemRetornoResumoV4 {
  return {
    osId: "os-orig",
    codigo: "OS-00025",
    cliente: { id: "c1", nome: "Maria", telefone: "11999990000" },
    aparelho: { tipo: "Celular", marca: "Apple", modelo: "iPhone 11", descricao: "Apple iPhone 11" },
    servicoExecutado: ["Troca de tela"],
    entregueEm: "2026-10-01T15:00:00.000Z",
    garantia: { situacao: "ativa", label: "Garantia ativa", prazoDias: 90 },
    retornos: [],
    aberturaInterrompida: false,
    acessoriosOriginais: [],
    enquadramento: { id: "garantia_ativa", label: "Garantia ativa", descricao: "Retorno coberto.", tone: "success", acao: "abrir_retorno" },
    ...over,
  } as OrigemRetornoResumoV4;
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não implementa scroll em elementos (o Shell rola o <main> ao trocar de tela).
  Element.prototype.scrollTo = vi.fn() as unknown as Element["scrollTo"];
  window.localStorage.clear();
  mocks.criarOSEnterpriseV3.mockResolvedValue({ os: { id: "os-nova" } });
  mocks.criarOSPreOrcamentoV3.mockResolvedValue({ os: { id: "os-orc" } });
  mocks.buscarOrigensRetornoV3.mockResolvedValue([origem()]);
  mocks.abrirRetornoV3.mockResolvedValue({ os: { id: "os-orig" }, atendimento: { id: "os-ret" }, situacao: "criado", retornoId: "r1" });
});
afterEach(() => cleanup());

function preencherMinimo() {
  fireEvent.change(screen.getByPlaceholderText("Nome do cliente"), { target: { value: "Cliente V3" } });
  fireEvent.click(screen.getByRole("button", { name: /Equipamento/ }));
  fireEvent.change(screen.getByPlaceholderText("Ex.: Apple, Samsung"), { target: { value: "Moto" } });
  fireEvent.change(screen.getByPlaceholderText("Ex.: iPhone 13 Pro"), { target: { value: "G" } });
  fireEvent.click(screen.getByRole("button", { name: /Problema/ }));
  fireEvent.change(screen.getByPlaceholderText("O que o cliente relatou?"), { target: { value: "Não liga" } });
}

describe("seletor Novo atendimento", () => {
  it("mostra só Nova OS, Orçamento e Retorno / Garantia — sem Atendimento rápido", () => {
    render(<NovoAtendimentoSeletorV3 open onClose={vi.fn()} onEscolher={vi.fn()} />);
    const dialogo = screen.getByRole("dialog", { name: "Novo atendimento" });
    const opcoes = Array.from(dialogo.querySelectorAll("[data-opcao]")).map((b) => b.getAttribute("data-opcao"));
    expect(opcoes).toEqual(["os", "orcamento", "retorno"]);
    expect(within(dialogo).queryByText(/Atendimento rápido/)).toBeNull();
  });

  it("ESC e o botão Fechar fecham; escolher repassa a opção", () => {
    const onClose = vi.fn();
    const onEscolher = vi.fn();
    render(<NovoAtendimentoSeletorV3 open onClose={onClose} onEscolher={onEscolher} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /Retorno \/ Garantia/ }));
    expect(onEscolher).toHaveBeenCalledWith("retorno");
  });
});

describe("Nova OS em modo orçamento", () => {
  it("sem passo Pagamento, entrada opcional, grava por criarOSPreOrcamentoV3 — nunca a Nova OS", async () => {
    const onCreated = vi.fn();
    render(<NovaOSEnterpriseModalV3 open modo="orcamento" storeId="loja-qa" onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.getByRole("heading", { name: "Novo orçamento" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pagamento/ })).toBeNull();
    preencherMinimo();
    fireEvent.click(screen.getByRole("button", { name: /Recepção/ }));
    expect((screen.getByLabelText(/^Data de entrada do aparelho/) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Registrar orçamento/ }));
    await waitFor(() => expect(mocks.criarOSPreOrcamentoV3).toHaveBeenCalledTimes(1));
    const [sid, draft, proposta] = mocks.criarOSPreOrcamentoV3.mock.calls[0]!;
    expect(sid).toBe("loja-qa");
    expect(draft.recepcao.dataEntrada).toBe("");
    expect(proposta).toMatchObject({ validadeDias: 7, dataProposta: { meta: { precisao: "dia" } } });
    expect(mocks.criarOSEnterpriseV3).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith("os-orc");
  });

  it("modo padrão continua a Nova OS completa (com Pagamento e entrada obrigatória)", async () => {
    render(<NovaOSEnterpriseModalV3 open storeId="loja-qa" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Nova OS Enterprise" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pagamento/ })).toBeTruthy();
    preencherMinimo();
    fireEvent.click(screen.getByRole("button", { name: /Criar Ordem de Serviço/ }));
    await waitFor(() => expect(mocks.criarOSEnterpriseV3).toHaveBeenCalledTimes(1));
    expect(mocks.criarOSPreOrcamentoV3).not.toHaveBeenCalled();
  });

  it("rascunho do orçamento não se mistura com o da Nova OS", () => {
    window.localStorage.clear();
    const { unmount } = render(<NovaOSEnterpriseModalV3 open modo="orcamento" storeId="loja-qa" onClose={vi.fn()} onCreated={vi.fn()} />);
    unmount();
    render(<NovaOSEnterpriseModalV3 open storeId="loja-qa" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/Você tem uma OS em andamento/)).toBeNull();
  });
});

describe("Retorno / Garantia pela OS original", () => {
  async function buscarESelecionar() {
    fireEvent.change(screen.getByPlaceholderText(/OS-00025/), { target: { value: "Maria" } });
    fireEvent.click(await screen.findByRole("button", { name: /OS-00025 · Maria/ }));
  }

  it("abre o retorno vinculado à original; retry do mesmo relato reusa o operacaoId", async () => {
    mocks.abrirRetornoV3.mockRejectedValueOnce(new Error("Falha de rede"));
    const onRetornoAberto = vi.fn();
    render(<RetornoOrigemV3Modal open storeId="loja-qa" onClose={vi.fn()} onAbrirOS={vi.fn()} onRetornoAberto={onRetornoAberto} />);
    await buscarESelecionar();
    expect(mocks.buscarOrigensRetornoV3).toHaveBeenCalledWith("loja-qa", "Maria");
    fireEvent.change(screen.getByPlaceholderText("O que o cliente relata agora?"), { target: { value: "Tela piscando" } });
    fireEvent.click(screen.getByRole("button", { name: /Abrir retorno/ }));
    expect(await screen.findByText("Falha de rede")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Abrir retorno/ }));
    await waitFor(() => expect(onRetornoAberto).toHaveBeenCalledWith("os-ret", "criado"));
    expect(mocks.abrirRetornoV3).toHaveBeenCalledTimes(2);
    const [c1, c2] = mocks.abrirRetornoV3.mock.calls;
    expect(c1![0]).toBe("loja-qa");
    expect(c1![1]).toBe("os-orig");
    expect(c1![2]).toMatchObject({ motivo: "Tela piscando" });
    expect(c1![2].operacaoId).toBeTruthy();
    expect(c2![2].operacaoId).toBe(c1![2].operacaoId);
  });

  it("retorno já em andamento: abre o atendimento existente, sem criar outro", async () => {
    mocks.buscarOrigensRetornoV3.mockResolvedValue([
      origem({
        retornoAberto: { id: "r1", status: "aberto", motivo: "x", criadoEm: "", osRetornoId: "os-ret-1", osRetornoCodigo: "OS-00031", emAbertura: false },
        enquadramento: { id: "retorno_em_andamento", label: "Retorno em andamento", descricao: "Já existe.", tone: "info", acao: "continuar_atendimento" },
      }),
    ]);
    const onAbrirOS = vi.fn();
    render(<RetornoOrigemV3Modal open storeId="loja-qa" onClose={vi.fn()} onAbrirOS={onAbrirOS} onRetornoAberto={vi.fn()} />);
    await buscarESelecionar();
    expect(screen.queryByRole("button", { name: /^Abrir retorno$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Abrir atendimento em andamento \(OS-00031\)/ }));
    expect(onAbrirOS).toHaveBeenCalledWith("os-ret-1");
    expect(mocks.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("OS ainda não entregue: não oferece abrir retorno, só ver a original", async () => {
    mocks.buscarOrigensRetornoV3.mockResolvedValue([
      origem({ enquadramento: { id: "nao_entregue", label: "OS ainda não entregue", descricao: "Registre na própria OS.", tone: "warn", acao: "registrar_ocorrencia" } }),
    ]);
    const onAbrirOS = vi.fn();
    render(<RetornoOrigemV3Modal open storeId="loja-qa" onClose={vi.fn()} onAbrirOS={onAbrirOS} onRetornoAberto={vi.fn()} />);
    await buscarESelecionar();
    expect(screen.queryByRole("button", { name: /Abrir retorno/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver OS original" }));
    expect(onAbrirOS).toHaveBeenCalledWith("os-orig");
  });

  it("ESC fecha o fluxo", () => {
    const onClose = vi.fn();
    render(<RetornoOrigemV3Modal open storeId="loja-qa" onClose={onClose} onAbrirOS={vi.fn()} onRetornoAberto={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Shell V3 — o botão Nova OS abre o seletor", () => {
  it("Nova OS → seletor → Orçamento abre o formulário em modo orçamento; Retorno abre o localizador", () => {
    render(<OperacoesV3Shell />);
    const botoes = screen.getAllByRole("button", { name: /Nova OS/ });
    fireEvent.click(botoes[0]!);
    expect(screen.getByRole("dialog", { name: "Novo atendimento" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Orçamento[\s\S]*Só proposta|Só proposta[\s\S]*Orçamento/ }));
    expect(screen.queryByRole("dialog", { name: "Novo atendimento" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Novo orçamento" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Novo orçamento" })).getAllByRole("button", { name: "Fechar" })[0]!);

    fireEvent.click(screen.getAllByRole("button", { name: /Nova OS/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Retorno \/ Garantia/ }));
    expect(screen.getByRole("dialog", { name: "Retorno / Garantia" })).toBeTruthy();
  });
});
