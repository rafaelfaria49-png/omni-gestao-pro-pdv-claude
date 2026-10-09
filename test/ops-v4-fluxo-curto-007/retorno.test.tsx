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
import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  LIMITE_OBSERVACAO_INTERNA_V3,
  LIMITE_OCORRENCIA_PRE_ENTREGA_V4,
  PREFIXO_OCORRENCIA_PRE_ENTREGA_V4,
  resumirOrigemRetornoV4,
} from "@/lib/operacoes-v4/retorno-origem-v4";

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
    pronta2: os("pronta2", { status: "pronta", operacaoStatusV3: "pronta", entregaV3: undefined }),
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

describe("OPS-V4-FLUXO-CURTO-007 — correções da R3 (tentativa 3)", () => {
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
  /** O "servidor" concluiu a abertura (vínculo gravado com ESTA operação), mas a resposta se perdeu. */
  const gravarEPerderResposta = async (_s: string, id: string, input: { operacaoId: string; motivo: string }) => {
    banco[id] = os(id, { retornosV3: [{ id: `ret-${input.operacaoId}`, osOriginalId: id, motivo: input.motivo, criadoEm: NOW, status: "aberto", osRetornoId: "filha-x", osRetornoCodigo: "OS-FILHA-X", operacaoId: input.operacaoId }] });
    throw new Error("Falha de rede.");
  };

  it("N2: resposta perdida pela ficha — a ficha relê o servidor; ao fechar o seletor não há 'Abrir retorno' concorrente", async () => {
    const user = userEvent.setup();
    render(<FichaHarness expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.a!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Abrir retorno" }));
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await within(dialogo).findByText("OS-A", { selector: "div" });
    m.abrirRetornoV3.mockImplementationOnce(gravarEPerderResposta);
    const leiturasAntes = m.getOrdem.mock.calls.filter((c) => c[1] === "a").length;
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("A abertura anterior foi concluída no servidor: atendimento OS-FILHA-X.");
    await waitFor(() => expect(m.getOrdem.mock.calls.filter((c) => c[1] === "a").length).toBeGreaterThan(leiturasAntes));
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect((await screen.findAllByRole("button", { name: "Abrir atendimento OS-FILHA-X" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Abrir retorno" })).toBeNull();
  });

  it("N3: texto editado DURANTE a releitura não é apagado quando a operação anterior se revela concluída", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    await waitFor(() => expect(m.lerOrigemRetornoV3).toHaveBeenCalledTimes(1));
    let soltarLeitura!: () => void;
    m.lerOrigemRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltarLeitura = () => res(resumo(banco[id]!)); }));
    m.abrirRetornoV3.mockImplementationOnce(gravarEPerderResposta);
    const motivo = within(dialogo).getByLabelText("Motivo do retorno / novo defeito");
    await user.type(motivo, "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("Falha de rede.");
    await waitFor(() => expect(m.lerOrigemRetornoV3).toHaveBeenCalledTimes(2)); // releitura em voo
    await user.type(motivo, " e câmera");
    await act(async () => soltarLeitura());
    await within(dialogo).findByRole("button", { name: "Continuar no atendimento OS-FILHA-X" });
    expect(vAtual.rascunhoRetorno("a")).toEqual({ motivo: "Touch e câmera", observacao: "", acessorios: [] });
  });

  it("tentativa encerrada sem atendimento: relato mantido, operação descartada; o próximo envio usa operação NOVA", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    m.abrirRetornoV3.mockImplementationOnce(async (_s: string, id: string, input: { operacaoId: string; motivo: string }) => {
      // Servidor: a reserva desta operação expirou sem atendimento e foi encerrada por alguém.
      banco[id] = os(id, { retornosV3: [{ id: `ret-${input.operacaoId}`, osOriginalId: id, motivo: input.motivo, criadoEm: NOW, status: "finalizado", finalizadoEm: NOW, operacaoId: input.operacaoId }] });
      throw new Error("Esta tentativa de abertura foi encerrada sem atendimento.");
    });
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("A tentativa anterior foi encerrada sem atendimento. Confira o relato e abra novamente.");
    const op1 = m.abrirRetornoV3.mock.calls[0]![2].operacaoId;
    expect(vAtual.rascunhoRetorno("a")).toEqual({ motivo: "Touch", observacao: "", acessorios: [] });
    expect((within(dialogo).getByLabelText("Motivo do retorno / novo defeito") as HTMLTextAreaElement).value).toBe("Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await waitFor(() => expect(m.abrirRetornoV3).toHaveBeenCalledTimes(2));
    expect(m.abrirRetornoV3.mock.calls[1]![2]).toMatchObject({ motivo: "Touch" });
    expect(m.abrirRetornoV3.mock.calls[1]![2].operacaoId).not.toBe(op1);
  });

  it("N4: ocorrência digitada para a OS A não viaja para a OS B ao trocar de OS", async () => {
    const user = userEvent.setup();
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "OS-PRONTA", "OS-PRONTA");
    await user.type(within(dialogo).getByLabelText("Ocorrência (observação interna desta OS)"), "Texto de A");
    await user.click(within(dialogo).getByRole("button", { name: "← Trocar OS" }));
    fireEvent.click(within(dialogo).getByRole("option", { name: opcao("OS-PRONTA2") }));
    await within(dialogo).findByText("OS-PRONTA2", { selector: "div" });
    const ocorrencia = within(dialogo).getByLabelText("Ocorrência (observação interna desta OS)") as HTMLTextAreaElement;
    expect(ocorrencia.value).toBe("");
    await user.type(ocorrencia, "Texto de B");
    await user.click(within(dialogo).getByRole("button", { name: "Registrar ocorrência" }));
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledTimes(1));
    expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledWith(LOJA, "pronta2", "Ocorrência antes da entrega: Texto de B");
  });
});

describe("OPS-V4-FLUXO-CURTO-007 rev 15 — P2 nº 1: limite da ocorrência antes da entrega", () => {
  const ROTULO = "Ocorrência (observação interna desta OS)";
  // O "servidor" aplica a MESMA regra de adicionarObservacaoInternaV3 (trim + teto de 2000).
  beforeEach(() => {
    m.adicionarObservacaoInternaV3.mockImplementation(async (_sid: string, id: string, texto: string) => {
      const conteudo = (texto ?? "").trim();
      if (conteudo.length > LIMITE_OBSERVACAO_INTERNA_V3) throw new Error("Observação interna deve ter no máximo 2000 caracteres.");
      return banco[id];
    });
  });

  async function ocorrenciaDaPronta(user: ReturnType<typeof userEvent.setup>) {
    await montar();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "OS-PRONTA", "OS-PRONTA");
    const campo = within(dialogo).getByLabelText(ROTULO) as HTMLTextAreaElement;
    return { dialogo, campo, botao: () => within(dialogo).getByRole("button", { name: "Registrar ocorrência" }) as HTMLButtonElement };
  }
  async function colar(user: ReturnType<typeof userEvent.setup>, campo: HTMLTextAreaElement, texto: string) {
    await user.click(campo);
    await user.paste(texto);
  }

  it("L1: exatamente no limite (1971) registra e o servidor recebe 2000 caracteres", async () => {
    const user = userEvent.setup();
    const { dialogo, campo, botao } = await ocorrenciaDaPronta(user);
    expect(campo.hasAttribute("maxlength")).toBe(false);
    await colar(user, campo, "a".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4));
    expect(within(dialogo).getByText(`1971/${LIMITE_OCORRENCIA_PRE_ENTREGA_V4} caracteres`)).toBeTruthy();
    expect(botao().disabled).toBe(false);
    await user.click(botao());
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledTimes(1));
    const enviado = m.adicionarObservacaoInternaV3.mock.calls[0]![2] as string;
    expect(enviado).toBe(`${PREFIXO_OCORRENCIA_PRE_ENTREGA_V4}${"a".repeat(1971)}`);
    expect(enviado.length).toBe(2000);
    await within(dialogo).findByText(/Nenhum retorno foi aberto/);
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("L2: um caractere acima (1972) não envia, explica o limite e preserva o texto intacto", async () => {
    const user = userEvent.setup();
    const { dialogo, campo, botao } = await ocorrenciaDaPronta(user);
    const texto = "b".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4 + 1);
    await colar(user, campo, texto);
    expect(campo.value).toBe(texto);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(within(dialogo).getByText("1972/1971 caracteres")).toBeTruthy();
    expect(within(dialogo).getByText(/Texto acima do limite de 1971 caracteres/)).toBeTruthy();
    expect(botao().disabled).toBe(true);
    fireEvent.click(botao());
    expect(m.adicionarObservacaoInternaV3).not.toHaveBeenCalled();
    expect(campo.value).toBe(texto);
    // Apagar 1 caractere libera e o envio é o texto do operador, sem corte.
    await user.type(campo, "{Backspace}");
    expect(botao().disabled).toBe(false);
    expect(within(dialogo).queryByText(/Texto acima do limite/)).toBeNull();
    await user.click(botao());
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledTimes(1));
    expect((m.adicionarObservacaoInternaV3.mock.calls[0]![2] as string).length).toBe(2000);
  });

  it("L3: relato de 2000 caracteres colado não é cortado em silêncio nem enviado", async () => {
    const user = userEvent.setup();
    const { dialogo, campo, botao } = await ocorrenciaDaPronta(user);
    const texto = "c".repeat(2000);
    await colar(user, campo, texto);
    expect(campo.value).toBe(texto);
    expect(within(dialogo).getByText("2000/1971 caracteres")).toBeTruthy();
    expect(botao().disabled).toBe(true);
    expect(m.adicionarObservacaoInternaV3).not.toHaveBeenCalled();
  });

  it("L4: espaços nas bordas não contam; quebras de linha e Unicode contam como o servidor conta", async () => {
    const user = userEvent.setup();
    const { dialogo, campo, botao } = await ocorrenciaDaPronta(user);
    const miolo = `${"é".repeat(1000)}\n${"ç".repeat(970)}`; // 1971 com a quebra
    await colar(user, campo, `   \n${miolo}\n   `);
    expect(within(dialogo).getByText("1971/1971 caracteres")).toBeTruthy();
    await user.click(botao());
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledWith(LOJA, "pronta", `${PREFIXO_OCORRENCIA_PRE_ENTREGA_V4}${miolo}`));
    expect(campo.value).toBe("");

    // Emoji fora do BMP ocupa 2 unidades no servidor: 986 emojis = 1972 → recusado na tela.
    await colar(user, campo, "📱".repeat(986));
    expect(within(dialogo).getByText("1972/1971 caracteres")).toBeTruthy();
    expect(botao().disabled).toBe(true);
    expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledTimes(1);
  });

  it("L5: falha do servidor mantém o texto; nova tentativa envia o MESMO conteúdo", async () => {
    const user = userEvent.setup();
    const { dialogo, campo, botao } = await ocorrenciaDaPronta(user);
    const texto = "d".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4);
    await colar(user, campo, texto);
    m.adicionarObservacaoInternaV3.mockRejectedValueOnce(new Error("Sem conexão com o servidor."));
    await user.click(botao());
    await within(dialogo).findByText("Não foi possível registrar a ocorrência. O texto foi mantido.");
    expect(campo.value).toBe(texto);
    await user.click(botao());
    await waitFor(() => expect(m.adicionarObservacaoInternaV3).toHaveBeenCalledTimes(2));
    expect(m.adicionarObservacaoInternaV3.mock.calls[1]![2]).toBe(m.adicionarObservacaoInternaV3.mock.calls[0]![2]);
    await within(dialogo).findByText(/Nenhum retorno foi aberto/);
  });

  it("L6: texto acima do limite na OS A não viaja para a OS B (nem o aviso)", async () => {
    const user = userEvent.setup();
    const { dialogo, campo } = await ocorrenciaDaPronta(user);
    await colar(user, campo, "e".repeat(2000));
    await user.click(within(dialogo).getByRole("button", { name: "← Trocar OS" }));
    fireEvent.click(within(dialogo).getByRole("option", { name: opcao("OS-PRONTA2") }));
    await within(dialogo).findByText("OS-PRONTA2", { selector: "div" });
    expect((within(dialogo).getByLabelText(ROTULO) as HTMLTextAreaElement).value).toBe("");
    expect(within(dialogo).getByText("0/1971 caracteres")).toBeTruthy();
    expect(within(dialogo).queryByText(/Texto acima do limite/)).toBeNull();
    expect(m.adicionarObservacaoInternaV3).not.toHaveBeenCalled();
  });
});

describe("OPS-V4-FLUXO-CURTO-007 rev 15 — P2 nº 2: teclado no diálogo 'Finalizar retorno'", () => {
  const fundo = vi.fn();
  function FichaComFundo({ expor }: { expor: (v: V4Vals) => void }) {
    const v = useV4Preview();
    expor(v);
    return (
      <div>
        <button type="button" onClick={() => fundo("antes")}>Fundo antes</button>
        {v.realOS ? <PosVendaStage v={v} /> : null}
        <button type="button" onClick={() => fundo("depois")}>Fundo depois</button>
      </div>
    );
  }
  beforeEach(() => {
    fundo.mockReset();
    banco.andamento2 = os("andamento2", { retornosV3: [{ id: "r2", osOriginalId: "andamento2", motivo: "Bateria", criadoEm: "2026-10-06T12:00:00.000Z", status: "aberto", osRetornoId: "filha-and2", osRetornoCodigo: "OS-FILHA-AND2" }] });
    m.finalizarRetornoV3.mockImplementation(async (_sid: string, id: string, retornoId: string, opts?: { observacao?: string }) => {
      const atual = banco[id]! as unknown as { retornosV3: Array<Record<string, unknown>> };
      banco[id] = os(id, { retornosV3: atual.retornosV3.map((r) => (r.id === retornoId ? { ...r, status: "finalizado", finalizadoEm: NOW, observacaoFinal: opts?.observacao } : r)) });
      return banco[id];
    });
  });

  async function abrirFinalizar(user: ReturnType<typeof userEvent.setup>, osId = "andamento") {
    render(<FichaComFundo expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco[osId]!, "posvenda"));
    const gatilho = await screen.findByRole("button", { name: "Finalizar retorno" });
    await user.click(gatilho);
    const dialogo = await screen.findByRole("dialog", { name: "Finalizar retorno" });
    return { gatilho, dialogo };
  }
  const controles = (dialogo: HTMLElement) => ({
    fechar: within(dialogo).getByRole("button", { name: "Fechar" }),
    resolucao: within(dialogo).getByLabelText(/Resolução/),
    cancelar: within(dialogo).getByRole("button", { name: "Cancelar" }),
    finalizar: within(dialogo).getByRole("button", { name: /^(Finalizar retorno|Finalizando…)$/ }),
  });

  it("K01–K03: foco inicial na resolução; Tab percorre só o diálogo e volta do último ao primeiro", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirFinalizar(user);
    const c = controles(dialogo);
    expect(document.activeElement).toBe(c.resolucao);
    await user.tab();
    expect(document.activeElement).toBe(c.cancelar);
    await user.tab();
    expect(document.activeElement).toBe(c.finalizar);
    await user.tab();
    expect(document.activeElement).toBe(c.fechar);
    for (let i = 0; i < 9; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
  });

  it("K04–K05: Shift+Tab no primeiro vai ao último; o foco nunca alcança o fundo", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirFinalizar(user);
    const c = controles(dialogo);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(c.fechar);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(c.finalizar);
    for (let i = 0; i < 9; i += 1) {
      await user.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Fundo antes" }));
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Fundo depois" }));
    }
    // Foco programático/clique no fundo volta para dentro do diálogo.
    act(() => screen.getByRole("button", { name: "Fundo depois" }).focus());
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it("K06: com a finalização em andamento (botões desabilitados) Tab, Shift+Tab e Enter não alcançam o fundo; Escape não fecha", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirFinalizar(user);
    let soltar!: () => void;
    m.finalizarRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res(banco[id]); }));
    await user.click(controles(dialogo).finalizar);
    await within(dialogo).findByRole("button", { name: "Finalizando…" });
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
      await user.keyboard("{Enter}");
      await user.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Finalizar retorno" })).toBeTruthy();
    expect(fundo).not.toHaveBeenCalled();
    expect(m.finalizarRetornoV3).toHaveBeenCalledTimes(1);
    await act(async () => soltar());
  });

  it("K07–K08: Escape fecha e o foco volta ao 'Finalizar retorno' que abriu; Enter no fundo nunca dispara", async () => {
    const user = userEvent.setup();
    const { gatilho, dialogo } = await abrirFinalizar(user);
    await user.type(controles(dialogo).resolucao, "Conector{Enter}ressoldado");
    expect(fundo).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    expect(document.activeElement).toBe(gatilho);
    expect(m.finalizarRetornoV3).not.toHaveBeenCalled();
    // Reabrir na mesma OS mantém a resolução digitada (rascunho local do diálogo).
    await user.click(gatilho);
    const reaberto = await screen.findByRole("dialog", { name: "Finalizar retorno" });
    expect((controles(reaberto).resolucao as HTMLTextAreaElement).value).toBe("Conector\nressoldado");
  });

  it("K09: finalizado com sucesso, o gatilho some — o foco vai ao card do Retorno, nunca ao body", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirFinalizar(user);
    await user.type(controles(dialogo).resolucao, "Conector ressoldado");
    await user.click(controles(dialogo).finalizar);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    expect(m.finalizarRetornoV3).toHaveBeenCalledWith(LOJA, "andamento", "r1", { observacao: "Conector ressoldado" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Finalizar retorno" })).toBeNull());
    const ativo = document.activeElement as HTMLElement;
    expect(ativo).not.toBe(document.body);
    expect(ativo.isConnected).toBe(true);
    expect(ativo.tagName).toBe("SECTION");
    expect(ativo.textContent).toContain("Retorno");
  });

  it("K10: trocar de OS com o diálogo aberto o fecha, foco vai a destino válido e a resolução não viaja", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirFinalizar(user);
    await user.type(controles(dialogo).resolucao, "Texto da OS andamento");
    await act(async () => vAtual.selectOS(banco.a!, "posvenda"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    const ativo = document.activeElement as HTMLElement;
    expect(ativo).not.toBe(document.body);
    expect(ativo.isConnected).toBe(true);
    // Outra OS com retorno em andamento: o diálogo abre limpo e finaliza o retorno DELA.
    await act(async () => vAtual.selectOS(banco.andamento2!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Finalizar retorno" }));
    const outro = await screen.findByRole("dialog", { name: "Finalizar retorno" });
    expect((controles(outro).resolucao as HTMLTextAreaElement).value).toBe("");
    await user.click(controles(outro).finalizar);
    await waitFor(() => expect(m.finalizarRetornoV3).toHaveBeenCalledWith(LOJA, "andamento2", "r2", { observacao: undefined }));
    expect(fundo).not.toHaveBeenCalled();
  });
});

describe("OPS-V4-FLUXO-CURTO-007 rev 15 — tentativa 2 (achados da R5)", () => {
  function FichaNaRaiz({ expor }: { expor: (v: V4Vals) => void }) {
    const v = useV4Preview();
    expor(v);
    // Mesma âncora da raiz da V4 (OperacoesV4Preview): destino quando a etapa sai da tela.
    return (
      <div data-og-v4-raiz="" tabIndex={-1}>
        <button type="button">Fundo</button>
        {v.realOS && v.isPos ? <PosVendaStage v={v} /> : null}
      </div>
    );
  }
  beforeEach(() => {
    banco.andamento2 = os("andamento2", { retornosV3: [{ id: "r2", osOriginalId: "andamento2", motivo: "Bateria", criadoEm: "2026-10-06T12:00:00.000Z", status: "aberto", osRetornoId: "filha-and2", osRetornoCodigo: "OS-FILHA-AND2" }] });
  });
  async function abrirFinalizarNaRaiz(user: ReturnType<typeof userEvent.setup>) {
    render(<FichaNaRaiz expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.andamento!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Finalizar retorno" }));
    return screen.findByRole("dialog", { name: "Finalizar retorno" });
  }

  it("K11: A→B→A com o diálogo aberto em A — voltar à OS A NÃO reabre o diálogo", async () => {
    const user = userEvent.setup();
    const dialogo = await abrirFinalizarNaRaiz(user);
    await user.type(within(dialogo).getByLabelText(/Resolução/), "Rascunho de A");
    await act(async () => vAtual.selectOS(banco.andamento2!, "posvenda"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    await act(async () => vAtual.selectOS(banco.andamento!, "posvenda"));
    await screen.findByRole("button", { name: "Finalizar retorno" });
    expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull();
    expect(m.finalizarRetornoV3).not.toHaveBeenCalled();
  });

  it("K12: a etapa Pós-venda sai da tela com o diálogo aberto — o foco vai à raiz da V4, nunca ao body", async () => {
    const user = userEvent.setup();
    await abrirFinalizarNaRaiz(user);
    await act(async () => vAtual.selectOS(banco.a!, "entrada"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Finalizar retorno" })).toBeNull();
    const ativo = document.activeElement as HTMLElement;
    expect(ativo).not.toBe(document.body);
    expect(ativo.hasAttribute("data-og-v4-raiz")).toBe(true);
  });

  it("N01–N03: launcher + Novo — Tab e Shift+Tab circulam só pelas opções; foco no fundo volta; Escape fecha", async () => {
    const user = userEvent.setup();
    await montar();
    await user.click(screen.getByRole("button", { name: "+ Novo" }));
    const launcher = await screen.findByRole("dialog", { name: "Novo atendimento" });
    const opcoes = within(launcher).getAllByRole("button");
    expect(opcoes.length).toBeGreaterThan(1);
    expect(launcher.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < opcoes.length + 3; i += 1) {
      await user.tab();
      expect(launcher.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < opcoes.length + 3; i += 1) {
      await user.tab({ shift: true });
      expect(launcher.contains(document.activeElement)).toBe(true);
    }
    // Ciclo exato: do último volta ao primeiro e vice-versa.
    act(() => opcoes[opcoes.length - 1]!.focus());
    await user.tab();
    expect(document.activeElement).toBe(opcoes[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(opcoes[opcoes.length - 1]);
    // Foco programático no fundo volta para dentro do launcher.
    act(() => screen.getByRole("button", { name: "Abrir retorno pré-selecionado" }).focus());
    expect(launcher.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo atendimento" })).toBeNull());
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });
});

describe("OPS-V4-FLUXO-CURTO-007 rev 15 — tentativa 3 (achados da R6)", () => {
  /** Abre a paleta por outro caminho (camada legítima por cima, sem passar pelo atalho). */
  let abrirPaletaPorFora: () => void = () => {};
  /** Mesmo atalho e mesmo componente do Topbar do AppShell: CommandDialog (Radix, portal). */
  function PaletaAppShell() {
    const [aberta, setAberta] = useState(false);
    useEffect(() => {
      abrirPaletaPorFora = () => setAberta(true);
    }, []);
    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          setAberta((a) => !a);
        }
      };
      document.addEventListener("keydown", down);
      return () => document.removeEventListener("keydown", down);
    }, []);
    return (
      <CommandDialog open={aberta} onOpenChange={setAberta} title="Buscar Rota ou Ação" description="Atalhos">
        <CommandInput placeholder="Digite para buscar" />
        <CommandList>
          <CommandEmpty>Nada.</CommandEmpty>
          <CommandGroup heading="Ações">
            <CommandItem>Nova venda</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }
  /** Raiz da V4 real (focável) + fundo + paleta do AppShell fora da raiz. */
  function V4ComPaleta({ expor }: { expor: (v: V4Vals) => void }) {
    const v = useV4Preview();
    expor(v);
    return (
      <>
        <div data-og-v4-raiz="" tabIndex={-1}>
          <button type="button" onClick={v.openNovoAtendimento}>+ Novo</button>
          <button type="button" onClick={() => fundo()}>Fundo</button>
          {v.realOS && v.isPos ? <PosVendaStage v={v} /> : null}
          <NovoAtendimentoLauncher v={v} />
          <RetornoOrigemPickerV4 v={v} />
        </div>
        <PaletaAppShell />
      </>
    );
  }
  const fundo = vi.fn();
  const paleta = () => screen.findByRole("dialog", { name: "Buscar Rota ou Ação" });
  async function montarComPaleta() {
    render(<V4ComPaleta expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
  }
  /** Ctrl+K dentro do diálogo V4 NÃO abre a paleta por trás dele; o foco fica no diálogo. */
  async function ctrlKContido(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
    const antes = document.activeElement;
    expect(dialogo.contains(antes)).toBe(true);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog", { name: "Buscar Rota ou Ação" })).toBeNull();
    expect(document.activeElement).toBe(antes);
  }
  /** Camada legítima aberta por outro caminho: fica com o foco; o Escape dela fecha só ela. */
  async function camadaPorCimaRespeitada(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
    act(() => abrirPaletaPorFora());
    const p = await paleta();
    const busca = within(p).getByPlaceholderText("Digite para buscar");
    await waitFor(() => expect(document.activeElement).toBe(busca));
    await user.type(busca, "venda");
    expect((busca as HTMLInputElement).value).toBe("venda");
    expect(p.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Buscar Rota ou Ação" })).toBeNull());
    expect(dialogo.isConnected).toBe(true);
    // A paleta (Radix, sem trigger) solta o foco no body ao fechar: nenhum controle de fundo
    // fica com ele, Enter não aciona nada e o próximo Tab volta ao diálogo.
    const ativo = document.activeElement;
    expect(ativo === document.body || dialogo.contains(ativo)).toBe(true);
    await user.keyboard("{Enter}");
    expect(fundo).not.toHaveBeenCalled();
    await user.tab();
    expect(dialogo.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialogo.contains(document.activeElement)).toBe(true);
  }
  beforeEach(() => {
    fundo.mockReset();
    // jsdom não tem as APIs de layout que o cmdk usa (ambiente, não comportamento do app).
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
  });

  it("F1: seletor gravando — clique no backdrop e foco na raiz NÃO tiram o foco do diálogo; Tab/Enter não alcançam o fundo", async () => {
    const user = userEvent.setup();
    await montarComPaleta();
    act(() => vAtual.openRetornoFluxo(null));
    const dialogo = await buscarESelecionar(user, "Galaxy A", "OS-A");
    let soltar!: () => void;
    m.abrirRetornoV3.mockImplementationOnce((_s: string, id: string) => new Promise((res) => { soltar = () => res({ os: banco[id], atendimento: os("filha"), situacao: "criado", retornoId: "r" }); }));
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByRole("button", { name: "Abrindo atendimento…" });
    // Clique no backdrop durante a gravação: não fecha e não move o foco (mousedown cancelado).
    const backdrop = dialogo.parentElement!;
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    expect(screen.getByRole("dialog", { name: "Retorno / Garantia" })).toBeTruthy();
    // Foco na raiz da V4 (o destino que um clique nativo daria): volta para dentro do seletor.
    const raiz = document.querySelector<HTMLElement>("[data-og-v4-raiz]")!;
    act(() => raiz.focus());
    expect(dialogo.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
      await user.keyboard("{Enter}");
      await user.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    expect(fundo).not.toHaveBeenCalled();
    expect(m.abrirRetornoV3).toHaveBeenCalledTimes(1);
    await act(async () => soltar());
  });

  it("F2: fechar o launcher (Escape ou backdrop) devolve o foco ao '+ Novo'; escolher uma modalidade não", async () => {
    const user = userEvent.setup();
    await montarComPaleta();
    const novo = screen.getByRole("button", { name: "+ Novo" });
    await user.click(novo);
    await screen.findByRole("dialog", { name: "Novo atendimento" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo atendimento" })).toBeNull());
    expect(document.activeElement).toBe(novo);

    await user.click(novo);
    const launcher = await screen.findByRole("dialog", { name: "Novo atendimento" });
    await user.click(launcher.parentElement!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo atendimento" })).toBeNull());
    expect(document.activeElement).toBe(novo);

    await user.click(novo);
    await user.click(await screen.findByRole("button", { name: /Retorno \/ Garantia/ }));
    const seletor = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    expect(document.activeElement).toBe(within(seletor).getByRole("combobox", { name: "Buscar OS original" }));
  });

  it("F3a: 'Finalizar retorno' — Ctrl+K não abre a paleta por trás; paleta aberta por fora fica com o foco e o Escape dela não fecha o diálogo", async () => {
    const user = userEvent.setup();
    await montarComPaleta();
    await act(async () => vAtual.selectOS(banco.andamento!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Finalizar retorno" }));
    const finalizar = await screen.findByRole("dialog", { name: "Finalizar retorno" });
    await ctrlKContido(user, finalizar);
    await camadaPorCimaRespeitada(user, finalizar);
    expect(screen.getByRole("dialog", { name: "Finalizar retorno" })).toBe(finalizar);
    expect(m.finalizarRetornoV3).not.toHaveBeenCalled();
    // Fechado o diálogo, o atalho do AppShell volta a funcionar.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finalizar retorno" })).toBeNull());
    await user.keyboard("{Control>}k{/Control}");
    await paleta();
  });

  it("F3b: launcher — Ctrl+K contido; paleta por fora fecha sozinha no Escape; o Escape seguinte fecha o launcher e devolve o foco", async () => {
    const user = userEvent.setup();
    await montarComPaleta();
    const novo = screen.getByRole("button", { name: "+ Novo" });
    await user.click(novo);
    const launcher = await screen.findByRole("dialog", { name: "Novo atendimento" });
    await ctrlKContido(user, launcher);
    await camadaPorCimaRespeitada(user, launcher);
    expect(screen.getByRole("dialog", { name: "Novo atendimento" })).toBe(launcher);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo atendimento" })).toBeNull());
    expect(document.activeElement).toBe(novo);
  });

  it("F3c: seletor Retorno / Garantia — Ctrl+K contido; paleta por fora fica com o foco e o Escape dela não fecha o seletor", async () => {
    const user = userEvent.setup();
    await montarComPaleta();
    act(() => vAtual.openRetornoFluxo(null));
    const seletor = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await ctrlKContido(user, seletor);
    await camadaPorCimaRespeitada(user, seletor);
    expect(screen.getByRole("dialog", { name: "Retorno / Garantia" })).toBe(seletor);
  });
});

describe("OPS-V4-FLUXO-CURTO-007 rev 16 — R7-01: foco ao fechar o seletor quando o gatilho some", () => {
  let abrirPaletaPorFora: () => void = () => {};
  /** Paleta Ctrl+K do AppShell (CommandDialog real do projeto), fora da raiz da V4. */
  function Paleta() {
    const [aberta, setAberta] = useState(false);
    useEffect(() => {
      abrirPaletaPorFora = () => setAberta(true);
    }, []);
    return (
      <CommandDialog open={aberta} onOpenChange={setAberta} title="Buscar Rota ou Ação" description="Atalhos">
        <CommandInput placeholder="Digite para buscar" />
        <CommandList>
          <CommandEmpty>Nada.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    );
  }
  /** Ficha (PosVendaStage) + seletor dentro da raiz REAL da V4 (data-og-v4-raiz, tabIndex=-1). */
  function FichaNaRaiz({ expor }: { expor: (v: V4Vals) => void }) {
    const v = useV4Preview();
    expor(v);
    return (
      <>
        <div data-og-v4-raiz="" tabIndex={-1}>
          {v.realOS ? <PosVendaStage v={v} /> : null}
          <RetornoOrigemPickerV4 v={v} />
        </div>
        <Paleta />
      </>
    );
  }
  const raiz = () => document.querySelector<HTMLElement>("[data-og-v4-raiz]")!;
  /** O "servidor" concluiu a abertura (vínculo gravado com ESTA operação), mas a resposta se perdeu. */
  const gravarEPerderResposta = async (_s: string, id: string, input: { operacaoId: string; motivo: string }) => {
    banco[id] = os(id, { retornosV3: [{ id: `ret-${input.operacaoId}`, osOriginalId: id, motivo: input.motivo, criadoEm: NOW, status: "aberto", osRetornoId: "filha-x", osRetornoCodigo: "OS-FILHA-X", operacaoId: input.operacaoId }] });
    throw new Error("Falha de rede.");
  };
  async function abrirPelaFicha(user: ReturnType<typeof userEvent.setup>, osAlvo: OrdemServico) {
    render(<FichaNaRaiz expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(osAlvo, "posvenda"));
    const gatilho = await screen.findByRole("button", { name: "Abrir retorno" });
    await user.click(gatilho);
    const dialogo = await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    await within(dialogo).findByText(osAlvo.codigo as string, { selector: "div" });
    return { gatilho, dialogo };
  }
  async function perderRespostaEReler(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
    m.abrirRetornoV3.mockImplementationOnce(gravarEPerderResposta);
    await user.type(within(dialogo).getByLabelText("Motivo do retorno / novo defeito"), "Touch");
    await user.click(within(dialogo).getByRole("button", { name: "Abrir atendimento de retorno" }));
    await within(dialogo).findByText("A abertura anterior foi concluída no servidor: atendimento OS-FILHA-X.");
    // A releitura da ficha mostra o retorno criado e desmonta o "Abrir retorno".
    await waitFor(() => expect(screen.queryByRole("button", { name: "Abrir retorno" })).toBeNull());
  }
  beforeEach(() => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
  });

  it("R16-a (R7-01): resposta perdida + releitura desmontam o gatilho — Fechar leva o foco à raiz da V4, nunca ao body; Tab segue navegando", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirPelaFicha(user, banco.a!);
    await perderRespostaEReler(user, dialogo);
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(raiz());
    await user.tab();
    const proximo = document.activeElement as HTMLElement;
    expect(proximo).not.toBe(document.body);
    expect(raiz().contains(proximo)).toBe(true);
    // Fechar não abre de novo, não cria nada e não duplica: UMA chamada, o atendimento é o gravado.
    expect(m.abrirRetornoV3).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull();
    expect((await screen.findAllByRole("button", { name: "Abrir atendimento OS-FILHA-X" })).length).toBeGreaterThan(0);
  });

  it("R16-b (R7-01, Escape): mesmo cenário fechando por Escape — foco na raiz da V4", async () => {
    const user = userEvent.setup();
    const { dialogo } = await abrirPelaFicha(user, banco.a!);
    await perderRespostaEReler(user, dialogo);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).toBe(raiz());
    expect(m.abrirRetornoV3).toHaveBeenCalledTimes(1);
  });

  it("R16-c: gatilho original ainda na tela — Fechar devolve o foco a ele (comportamento preservado)", async () => {
    const user = userEvent.setup();
    const { gatilho, dialogo } = await abrirPelaFicha(user, banco.a!);
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(gatilho.isConnected).toBe(true);
    expect(document.activeElement).toBe(gatilho);
  });

  it("R16-d: trocar de OS com o seletor aberto — ao fechar, o foco NÃO volta ao gatilho do atendimento anterior", async () => {
    const user = userEvent.setup();
    banco.a2 = os("a2");
    const { dialogo } = await abrirPelaFicha(user, banco.a!);
    await act(async () => vAtual.selectOS(banco.a2!, "posvenda"));
    await waitFor(() => expect(vAtual.selectedOsId).toBe("a2"));
    // A ficha da OS a2 também oferece "Abrir retorno" (o mesmo nó pode ser reaproveitado pelo React).
    await screen.findByRole("button", { name: "Abrir retorno" });
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).toBe(raiz());
    expect(m.abrirRetornoV3).not.toHaveBeenCalled();
  });

  it("R16-e: trocar de LOJA com o seletor aberto — ele fecha e o foco vai à raiz da V4, nunca ao body", async () => {
    const user = userEvent.setup();
    const r = render(<FichaNaRaiz expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(vAtual.ordens.length).toBeGreaterThan(0));
    await act(async () => vAtual.selectOS(banco.a!, "posvenda"));
    await user.click(await screen.findByRole("button", { name: "Abrir retorno" }));
    await screen.findByRole("dialog", { name: "Retorno / Garantia" });
    h.loja = "loja-qa-007-b";
    r.rerender(<FichaNaRaiz expor={(v) => { vAtual = v; }} />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(raiz());
  });

  it("R16-f: camada legítima por cima (paleta) ativa quando o seletor fecha — o foco continua nela", async () => {
    const user = userEvent.setup();
    await abrirPelaFicha(user, banco.a!);
    act(() => abrirPaletaPorFora());
    const paleta = await screen.findByRole("dialog", { name: "Buscar Rota ou Ação" });
    const busca = within(paleta).getByPlaceholderText("Digite para buscar");
    await waitFor(() => expect(document.activeElement).toBe(busca));
    act(() => vAtual.closeRetornoFluxo());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Retorno / Garantia" })).toBeNull());
    expect(document.activeElement).toBe(busca);
  });
});
