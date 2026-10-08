// OPS-V4-FLUXO-CURTO-007 — fluxo Retorno / Garantia MONTADO: hook REAL da V4
// (useV4Preview) + seletor REAL (RetornoOrigemPickerV4) + PosVendaStage real, com as
// actions "use server" substituídas por espiões (o "servidor" é um mapa em memória
// que devolve o MESMO DTO da action real: resumirOrigemRetornoV4). Prova a LIGAÇÃO:
// entrada pelo "+ Novo", busca com estados distintos e sem resposta atrasada, herança
// sem senha/acessórios, operação estável no retry, navegação só no mesmo contexto,
// ocorrência antes da entrega pela observação interna, teclado e foco.
// Concorrência/persistência reais: retorno.pg.test.ts (PostgreSQL).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({ loja: "loja-qa-007" as string | null }));
const m = vi.hoisted(() => ({
  listOrdens: vi.fn(),
  getOrdem: vi.fn(),
  abrirRetornoV3: vi.fn(),
  finalizarRetornoV3: vi.fn(),
  buscarOrigensRetornoV3: vi.fn(),
  lerOrigemRetornoV3: vi.fn(),
  adicionarObservacaoInternaV3: vi.fn(),
}));

vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.loja }), registrarGuardaTrocaLojaV4: vi.fn() }));
vi.mock("@/app/actions/ordens", () => ({ listOrdens: m.listOrdens, getOrdem: m.getOrdem }));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: vi.fn(async () => null),
  lerProjecoesFinanceirasOSV4: vi.fn(async () => []),
}));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })),
  lerPagamentoOSV3: vi.fn(async () => null),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: vi.fn(),
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: vi.fn(),
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
  atribuirTecnicoV3: vi.fn(), definirPrioridadeV3: vi.fn(), definirLocalFisicoV3: vi.fn(),
  adicionarObservacaoInternaV3: m.adicionarObservacaoInternaV3, salvarChecklistTecnicoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/estoque-actions", () => ({ consumirEstoqueOSActionV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({
  abrirRetornoV3: m.abrirRetornoV3,
  finalizarRetornoV3: m.finalizarRetornoV3,
  buscarOrigensRetornoV3: m.buscarOrigensRetornoV3,
  lerOrigemRetornoV3: m.lerOrigemRetornoV3,
}));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ enviarOrcamentoPorCanalV3: vi.fn() }));
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { OrdemServico } from "@/types/os";
import { useV4Preview, type V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import { RetornoOrigemPickerV4 } from "@/components/operacoes-v4-preview/parts/RetornoOrigemPickerV4";
import { PosVendaStage } from "@/components/operacoes-v4-preview/parts/stages/PosVendaStage";
import { NovoAtendimentoLauncher } from "@/components/operacoes-v4-preview/parts/NovoAtendimentoLauncher";
import { resumirOrigemRetornoV4 } from "@/lib/operacoes-v4/retorno-origem-v4";

const LOJA = "loja-qa-007";
const NOW = "2026-10-08T12:00:00.000Z";

function os(id: string, extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: `OS-${id.toUpperCase()}`, status: "entregue", operacaoStatusV3: "entregue",
    clienteId: `cli-${id}`, cliente: { id: `cli-${id}`, nome: `Cliente ${id.toUpperCase()}`, telefone: "11999990000" },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: `Galaxy ${id.toUpperCase()}`, numeroSerie: `IMEI-${id}`, acessorios: ["Capa", "Chip"], defeitoRelatado: "Tela quebrada" },
    senhaEquipamento: "1478", senhaEquipamentoTipo: "numerica",
    servicosCatalogo: [{ servicoId: "s1", descricao: "Troca de tela", custoInterno: 0, valorVenda: 300, prazoGarantiaDias: 90, termoGarantia: "" }],
    entregaV3: { entregueEm: "2026-10-01T12:00:00.000Z" },
    aberturaV3: { garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias: 90 } },
    criadoEm: "2026-09-20T12:00:00.000Z", prioridade: "media", timeline: [],
    ...extra,
  } as unknown as OrdemServico;
}

let banco: Record<string, OrdemServico> = {};
/** Nome acessível da opção começa pelo código (OS-A ≠ OS-ANDAMENTO). */
const opcao = (codigo: string) => new RegExp(`^${codigo}(?![A-Z0-9-])`);
const resumo = (o: OrdemServico) => resumirOrigemRetornoV4(o, new Date(NOW));

function Harness({ expor }: { expor: (v: V4Vals) => void }) {
  const v = useV4Preview();
  expor(v);
  return (
    <div>
      <button type="button" onClick={v.openNovoAtendimento}>+ Novo</button>
      <button type="button" onClick={() => v.openRetornoFluxo("a")}>Abrir retorno pré-selecionado</button>
      <div data-testid="selecionada">{v.selectedOsId ?? "nenhuma"}</div>
      <div data-testid="stage">{v.stage}</div>
      <NovoAtendimentoLauncher v={v} />
      <RetornoOrigemPickerV4 v={v} />
    </div>
  );
}

let vAtual: V4Vals;
async function montar() {
  const r = render(<Harness expor={(v) => { vAtual = v; }} />);
  await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
  return r;
}

beforeEach(() => {
  h.loja = LOJA;
  banco = {
    a: os("a"),
    b: os("b", { entregaV3: { entregueEm: "2025-01-01T12:00:00.000Z" } }),
    pronta: os("pronta", { status: "pronta", operacaoStatusV3: "pronta", entregaV3: undefined }),
    andamento: os("andamento", { retornosV3: [{ id: "r1", osOriginalId: "andamento", motivo: "Câmera", criadoEm: "2026-10-05T12:00:00.000Z", status: "aberto", osRetornoId: "filha-and", osRetornoCodigo: "OS-FILHA-AND" }] }),
  };
  for (const fn of Object.values(m)) fn.mockReset();
  m.listOrdens.mockImplementation(async () => Object.values(banco));
  m.getOrdem.mockImplementation(async (_sid: string, id: string) => banco[id] ?? null);
  m.buscarOrigensRetornoV3.mockImplementation(async (sid: string, termo: string) =>
    sid === LOJA ? Object.values(banco).filter((o) => JSON.stringify(o).toLowerCase().includes(termo.toLowerCase())).map(resumo) : [],
  );
  m.lerOrigemRetornoV3.mockImplementation(async (sid: string, id: string) => (sid === LOJA && banco[id] ? resumo(banco[id]!) : null));
  m.abrirRetornoV3.mockImplementation(async (_sid: string, id: string) => {
    banco.filha = os("filha", { status: "aberta", operacaoStatusV3: "aberta", entregaV3: undefined, vinculoRetornoV3: { osOrigemId: id, osOrigemCodigo: banco[id]!.codigo, retornoId: "r" } });
    return { os: banco[id], atendimento: banco.filha, situacao: "criado", retornoId: "r" };
  });
  m.adicionarObservacaoInternaV3.mockImplementation(async (_sid: string, id: string) => banco[id]);
});
afterEach(() => cleanup());

async function buscarESelecionar(user: ReturnType<typeof userEvent.setup>, termo: string, codigo: string) {
  const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
  const busca = within(dialogo).getByRole("combobox", { name: "Buscar OS original" });
  await user.clear(busca);
  await user.type(busca, termo);
  await within(dialogo).findByRole("option", { name: opcao(codigo) });
  fireEvent.click(within(dialogo).getByRole("option", { name: opcao(codigo) }));
  await within(dialogo).findByText(codigo, { selector: "div" });
  return dialogo;
}

describe("OPS-V4-FLUXO-CURTO-007 — entrada pelo + Novo e seletor da OS original (T53)", () => {
  it("+ Novo → Retorno / Garantia abre só o seletor (busca focada); nada é criado", async () => {
    const user = userEvent.setup();
    await montar();
    await user.click(screen.getByRole("button", { name: "+ Novo" }));
    await user.click(await screen.findByRole("button", { name: /Retorno \/ Garantia/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    expect(document.activeElement).toBe(within(dialogo).getByRole("combobox", { name: "Buscar OS original" }));
    expect(vAtual.novaOSOpen).toBe(false);
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("busca: estados distintos (curto, carregando, vazio, erro com retry) e nunca mostra resposta velha", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    const busca = within(dialogo).getByRole("combobox", { name: "Buscar OS original" });
    expect(within(dialogo).getByText("Digite ao menos 2 caracteres.")).toBeTruthy();

    // Resposta lenta de "Galaxy A" chega DEPOIS da de "Galaxy B": a tela fica com B.
    let soltarA!: () => void;
    m.buscarOrigensRetornoV3.mockImplementationOnce((_sid: string) => new Promise((res) => { soltarA = () => res([resumo(banco.a!)]); }));
    await user.type(busca, "Galaxy A");
    await within(dialogo).findByText("Buscando na loja ativa…");
    await waitFor(() => expect(m.buscarOrigensRetornoV3).toHaveBeenCalledTimes(1)); // requisição de "Galaxy A" em voo
    await user.clear(busca);
    await user.type(busca, "Galaxy B");
    await within(dialogo).findByRole("option", { name: opcao("OS-B") });
    await act(async () => soltarA());
    expect(within(dialogo).queryByRole("option", { name: opcao("OS-A") })).toBeNull();

    await user.clear(busca);
    await user.type(busca, "zzz-inexistente");
    await within(dialogo).findByText("Nenhuma OS encontrada nesta loja.");

    m.buscarOrigensRetornoV3.mockRejectedValueOnce(new Error("Sem conexão com o servidor."));
    await user.clear(busca);
    await user.type(busca, "Galaxy");
    await within(dialogo).findByText("Sem conexão com o servidor.");
    await user.click(within(dialogo).getByRole("button", { name: "Tentar de novo" }));
    await within(dialogo).findByRole("option", { name: opcao("OS-A") });
  });

  it("herda cliente/aparelho/serviço/garantia sem recadastro e SEM senha ou acessórios marcados; abre e navega para o atendimento", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    expect(within(dialogo).getAllByText("Cliente A").length).toBe(2); // lista + detalhe herdado
    expect(within(dialogo).getByText("Samsung Galaxy A")).toBeTruthy();
    expect(within(dialogo).getByText("Troca de tela")).toBeTruthy();
    expect(within(dialogo).getAllByText("Garantia vigente").length).toBeGreaterThan(0);
    expect(dialogo.textContent).not.toContain("1478");
    expect((within(dialogo).getByLabelText("Senha do aparelho (opcional)") as HTMLInputElement).value).toBe("");
    expect((within(dialogo).getByRole("checkbox", { name: "Capa" }) as HTMLInputElement).checked).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(within(dialogo).getByLabelText("Motivo do retorno / novo defeito")));

    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch voltou a falhar");
    await user.click(within(dialogo).getByRole("checkbox", { name: "Capa" }));
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));

    await waitFor(() => expect(m.abrirRetornoV3).toHaveBeenCalledTimes(1));
    const [sid, origem, input] = m.abrirRetornoV3.mock.calls[0]!;
    expect(sid).toBe(LOJA);
    expect(origem).toBe("a");
    expect(input).toMatchObject({ motivo: "Touch voltou a falhar", recepcao: { acessorios: ["Capa"] } });
    expect(input.operacaoId).toMatch(/^rtv4-/);
    expect(input.recepcao.senha).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(screen.getByTestId("selecionada").textContent).toBe("filha");
    expect(screen.getByTestId("stage").textContent).toBe("entrada");
  });
});

describe("OPS-V4-FLUXO-CURTO-007 — retry, rascunho e contexto (T56 na UI)", () => {
  it("falha: o relato fica; retry do MESMO relato reusa a operação; relato editado gera operação nova", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    m.abrirRetornoV3.mockRejectedValueOnce(new Error("Falha de rede."));
    const motivo = within(dialogo).getByLabelText("Motivo do retorno / novo defeito");
    await user.type(motivo, "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("Falha de rede.");
    expect((motivo as HTMLTextAreaElement).value).toBe("Touch");
    const op1 = m.abrirRetornoV3.mock.calls[0]![2].operacaoId;

    // Resposta perdida: o servidor pode ter gravado — o retry reenvia a MESMA operação.
    m.abrirRetornoV3.mockRejectedValueOnce(new Error("Tempo esgotado."));
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("Tempo esgotado.");
    expect(m.abrirRetornoV3.mock.calls[1]![2].operacaoId).toBe(op1);

    await user.type(motivo, " e câmera");
    m.abrirRetornoV3.mockRejectedValueOnce(new Error("Falha de novo."));
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("Falha de novo.");
    expect(m.abrirRetornoV3.mock.calls[2]![2].operacaoId).not.toBe(op1);

    // Fechar e reabrir na mesma loja+OS preserva o rascunho do relato.
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    act(() => vAtual.openRetornoFluxo("a"));
    const reaberto = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await waitFor(() => expect((within(reaberto).getByLabelText("Motivo do retorno / novo defeito") as HTMLTextAreaElement).value).toBe("Touch e câmera"));
  });

  it("duplo clique em Abrir: UMA chamada (a UI trava; a idempotência real é do servidor)", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    const botao = within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await within(dialogo).findByRole("button", { name: "Abrindo atendimento…" });
    expect(m.abrirRetornoV3).toHaveBeenCalledTimes(1);
    await act(async () => soltar());
  });

  it("troca de loja durante a abertura: fluxo fecha e a resposta atrasada NÃO navega nem abre nada na loja nova", async () => {
    const user = userEvent.setup();
    const r = await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    h.loja = "loja-qa-007-b";
    r.rerender(<Harness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    await act(async () => soltar());
    expect(screen.getByTestId("selecionada").textContent).toBe("nenhuma");
    expect(vAtual.retornoFluxo).toBeNull();
  });

  it("busca em voo durante a troca de loja não repovoa nada", async () => {
    const user = userEvent.setup();
    const r = await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    let soltar!: () => void;
    m.buscarOrigensRetornoV3.mockImplementationOnce(() => new Promise((res) => { soltar = () => res([resumo(banco.a!)]); }));
    await user.type(within(dialogo).getByRole("combobox", { name: "Buscar OS original" }), "Galaxy");
    await within(dialogo).findByText("Buscando na loja ativa…");
    await waitFor(() => expect(m.buscarOrigensRetornoV3).toHaveBeenCalledTimes(1)); // requisição em voo
    h.loja = "loja-qa-007-b";
    r.rerender(<Harness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => soltar());
    expect(screen.queryByRole("option")).toBeNull();
  });
});

describe("OPS-V4-FLUXO-CURTO-007 — enquadramento (T55 e retorno em andamento)", () => {
  it("OS ainda não entregue: oferece ocorrência pela observação interna; nunca chama abrirRetornoV3", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "OS-PRONTA", "OS-PRONTA");
    expect(within(dialogo).getAllByText("OS ainda não entregue").length).toBeGreaterThan(0);
    expect(within(dialogo).queryByRole("button", { name: "Abrir atendimento de retorno" })).toBeNull();
    await user.type(within(dialogo).getByLabelText("Ocorrência (observação interna desta OS)"), "Cliente relatou chiado");
    await user.click(within(dialogo).getByRole("button", { name: "Registrar ocorrência" }));
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledWith(LOJA, "pronta", "Ocorrência antes da entrega: Cliente relatou chiado"));
    await within(dialogo).findByText(/Nenhum retorno foi aberto/);
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("retorno já em andamento: oferece continuar no atendimento existente, sem botão de criar", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "OS-ANDAMENTO", "OS-ANDAMENTO");
    expect(within(dialogo).queryByRole("button", { name: "Abrir atendimento de retorno" })).toBeNull();
    await user.click(within(dialogo).getByRole("button", { name: "Continuar no atendimento OS-FILHA-AND" }));
    await waitFor(() => expect(screen.getByTestId("selecionada").textContent).toBe("filha-and"));
    expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull();
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("fora da garantia: registra com aviso de cobertura não confirmada", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy B", "OS-B");
    expect(within(dialogo).getAllByText("Sem cobertura confirmada").length).toBeGreaterThan(0);
    expect(dialogo.textContent).toContain("qualquer serviço cobrável é decidido no orçamento do atendimento");
  });

  it("pré-seleção (ficha / portfólio): relê a OS no servidor, sem busca", async () => {
    await montar();
    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir retorno pré-selecionado" }));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await within(dialogo).findByText("OS-A", { selector: "div" });
    expect(m.lerOrigemRetornoV3).toHaveBeenCalledWith(LOJA, "a");
    expect(m.buscarOrigensRetornoV3).not.toHaveBeenCalled();
  });
});

describe("OPS-V4-FLUXO-CURTO-007 — teclado e foco", () => {
  it("setas + Enter selecionam; Tab/Shift+Tab ficam no diálogo; Enter no relato não envia; Escape fecha e devolve o foco", async () => {
    const user = userEvent.setup();
    await montar();
    const gatilho = screen.getByRole("button", { name: "+ Novo" });
    gatilho.focus();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    const busca = within(dialogo).getByRole("combobox", { name: "Buscar OS original" });
    await user.type(busca, "Galaxy");
    await within(dialogo).findByRole("option", { name: opcao("OS-A") });
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    await within(dialogo).findByText("OS-A", { selector: "div" });
    const motivo = within(dialogo).getByLabelText("Motivo do retorno / novo defeito");
    await waitFor(() => expect(document.activeElement).toBe(motivo));
    await user.keyboard("Linha 1{Enter}Linha 2");
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();

    const focaveis = Array.from(dialogo.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])"));
    focaveis[focaveis.length - 1]!.focus();
    await user.tab();
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focaveis[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focaveis[focaveis.length - 1]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).toBe(gatilho);
  });

  it("Escape é ignorado enquanto a abertura está em andamento", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Retorno / Garantia" })).toBeTruthy();
    await act(async () => soltar());
  });
});

describe("OPS-V4-FLUXO-CURTO-007 — Pós-venda usa o MESMO fluxo", () => {
  function FichaHarness({ expor }: { expor: (v: V4Vals) => void }) {
    const v = useV4Preview();
    expor(v);
    return (
      <div>
        {v.realOS ? <PosVendaStage v={v} /> : null}
        <RetornoOrigemPickerV4 v={v} />
      </div>
    );
  }

  it("OS entregue: 'Abrir retorno' abre o seletor pré-selecionado (sem formulário paralelo)", async () => {
    const user = userEvent.setup();
    render(<FichaHarness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.a!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Abrir retorno" }));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await within(dialogo).findByText("OS-A", { selector: "div" });
    expect(m.lerOrigemRetornoV3).toHaveBeenCalledWith(LOJA, "a");
  });

  it("OS não entregue: a ficha oferece 'Registrar ocorrência', nunca 'Abrir retorno'", async () => {
    render(<FichaHarness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.pronta!, "posvenda"));
    await screen.findByRole("button", { name: "Registrar ocorrência" });
    expect(screen.queryByRole("button", { name: "Abrir retorno" })).toBeNull();
  });

  it("atendimento filho mostra 'Retorno da OS-…' e abre a original", async () => {
    banco.filha = os("filha", { status: "aberta", operacaoStatusV3: "aberta", entregaV3: undefined, vinculoRetornoV3: { osOrigemId: "a", osOrigemCodigo: "OS-A", retornoId: "r", garantiaAtivaNaAbertura: true, garantiaSituacaoNaAbertura: "ativa", motivo: "Touch" } });
    const user = userEvent.setup();
    render(<FichaHarness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.filha!, "posvenda"));
    await screen.findByText("Retorno da OS-A");
    expect(screen.getByText(/Garantia da OS original vigente na abertura/)).toBeTruthy();
    expect(screen.getByText(/Garantia deste atendimento/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Abrir OS original" }));
    await waitFor(() => expect(vAtual.selectedOsId).toBe("a"));
  });
});

describe("OPS-V4-FLUXO-CURTO-007 — correções da R2 (tentativa 2)", () => {
  it("F3: resposta da busca anterior chegando DURANTE o debounce do novo termo não aparece nem é selecionável", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    const busca = within(dialogo).getByRole("combobox", { name: "Buscar OS original" });
    let soltar!: () => void;
    m.buscarOrigensRetornoV3.mockImplementationOnce(() => new Promise((res) => { soltar = () => res([resumo(banco.a!)]); }));
    await user.type(busca, "Galaxy");
    await waitFor(() => expect(m.buscarOrigensRetornoV3).toHaveBeenCalledTimes(1));
    // Novo termo; a resposta velha chega ANTES da próxima busca disparar.
    let soltarB!: () => void;
    m.buscarOrigensRetornoV3.mockImplementationOnce(() => new Promise((res) => { soltarB = () => res([resumo(banco.b!)]); }));
    await user.type(busca, " B");
    await act(async () => soltar());
    expect(within(dialogo).queryByRole("option")).toBeNull();
    expect(within(dialogo).getByText("Buscando na loja ativa…")).toBeTruthy();
    await waitFor(() => expect(m.buscarOrigensRetornoV3).toHaveBeenCalledTimes(2));
    await act(async () => soltarB());
    await within(dialogo).findByRole("option", { name: opcao("OS-B") });
    expect(within(dialogo).queryByRole("option", { name: opcao("OS-A") })).toBeNull();
  });

  it("F4: seleção trocada (A→B) na mesma loja durante a abertura: a resposta não troca a seleção", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await act(async () => vAtual.selectOS(banco.b!, "posvenda"));
    await waitFor(() => expect(screen.getByTestId("selecionada").textContent).toBe("b"));
    await act(async () => soltar());
    expect(screen.getByTestId("selecionada").textContent).toBe("b");
    await within(dialogo).findByText(/Retorno registrado: atendimento OS-FILHA/);
  });

  it("F5: com a abertura em andamento (tudo desabilitado) Tab e Shift+Tab continuam no diálogo", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByRole("button", { name: "Abrindo atendimento…" });
    await waitFor(() => expect(document.activeElement).toBe(dialogo));
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
      await user.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await act(async () => soltar());
  });

  it("F6: aberto pelo + Novo, ao fechar o foco volta ao + Novo", async () => {
    const user = userEvent.setup();
    await montar();
    const novo = screen.getByRole("button", { name: "+ Novo" });
    await user.click(novo);
    await user.click(await screen.findByRole("button", { name: /Retorno \/ Garantia/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    expect(dialogo).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).toBe(novo);
  });

  it("F8: resposta perdida com retorno já gravado pela MESMA operação: o rascunho é encerrado (a operação nunca é reusada)", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    m.abrirRetornoV3.mockImplementationOnce(async (_s: string, id: string, input: { operacaoId: string; motivo: string }) => {
      // O servidor concluiu (vínculo gravado com ESTA operação), mas a resposta se perdeu.
      banco[id] = os(id, { retornosV3: [{ id: `ret-${input.operacaoId}`, osOriginalId: id, motivo: input.motivo, criadoEm: NOW, status: "aberto", osRetornoId: "filha-x", osRetornoCodigo: "OS-FILHA-X", operacaoId: input.operacaoId }] });
      throw new Error("Falha de rede.");
    });
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByRole("button", { name: "Continuar no atendimento OS-FILHA-X" });
    expect(vAtual.rascunhoRetorno("a")).toBeNull();
    await user.click(within(dialogo).getByRole("button", { name: "Continuar no atendimento OS-FILHA-X" }));
    await waitFor(() => expect(screen.getByTestId("selecionada").textContent).toBe("filha-x"));
    expect(vAtual.rascunhoRetorno("a")).toBeNull();
  });
});
