// Experimento independente: componentes e hook reais; OS sintéticas, sem banco.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";
import { useEffect, useState } from "react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({ loja: "loja-qa-datas" as string | null, reloadDetail: () => {} }));
const m = vi.hoisted(() => ({
  listOrdens: vi.fn(), getOrdem: vi.fn(), corrigirDatas: vi.fn(),
  receber: vi.fn(), entregar: vi.fn(),
  acessorios: vi.fn(), dadosBasicos: vi.fn(), checklist: vi.fn(),
}));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.loja }), registrarGuardaTrocaLojaV4: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard/operacoes-v4" }));
vi.mock("@/hooks/useUserCredits", () => ({ useUserCredits: () => ({ credits: 500, loading: false, error: null }) }));
vi.mock("@/hooks/use-sidebar-collapsed", () => ({ useSidebarCollapsed: () => ({ collapsed: false, setCollapsed: vi.fn() }) }));
vi.mock("@/components/ia-mestre/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("@/components/theme/LegibilityToggle", () => ({ LegibilityToggle: () => null }));
vi.mock("@/components/painel-inicial/MobileNavSheet", () => ({ MobileNavSheet: () => null }));
vi.mock("@/app/actions/ordens", () => ({ listOrdens: m.listOrdens, getOrdem: m.getOrdem }));
// Mantém o leitor real; expõe somente seu comando de refresh ao harness.
vi.mock("@/components/operacoes-v4-preview/use-ordens-v4", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/operacoes-v4-preview/use-ordens-v4")>();
  return { ...real, useOrdemV4: (storeId: string | null, osId: string | null) => {
    const resultado = real.useOrdemV4(storeId, osId);
    h.reloadDetail = resultado.reload;
    return resultado;
  } };
});
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: vi.fn(async () => null), lerProjecoesFinanceirasOSV4: vi.fn(async () => []),
}));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })),
  lerPagamentoOSV3: vi.fn(async () => ({ total: 0, recebido: 0, saldo: 0, status: "aberto", sessao: null })),
  receberOSV3: m.receber, estornarRecebimentoOSV3: vi.fn(), registrarRecebimentoMistoOSV3: vi.fn(), lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: m.entregar, salvarAssinaturaRetiradaV3: vi.fn(), adicionarFotoSaidaV3: vi.fn(), removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: m.checklist }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), corrigirOrcamentoV3: vi.fn(),
  aprovarOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/status-actions", () => ({ aplicarTransicaoStatusV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/prova-entrada-actions", () => ({
  salvarIdentificacaoV3: vi.fn(), salvarProvaEntradaV3: vi.fn(), salvarAcessoriosEntradaV3: m.acessorios,
  adicionarFotoEntradaV3: vi.fn(), removerFotoEntradaV3: vi.fn(), salvarAssinaturaClienteV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/dados-basicos-actions", () => ({ salvarDadosBasicosOSV3: m.dadosBasicos }));
vi.mock("@/lib/operacoes-v3/producao-actions", () => ({
  atribuirTecnicoV3: vi.fn(), definirPrioridadeV3: vi.fn(), definirLocalFisicoV3: vi.fn(),
  adicionarObservacaoInternaV3: vi.fn(), salvarChecklistTecnicoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/estoque-actions", () => ({ consumirEstoqueOSActionV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({
  abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn(), buscarOrigensRetornoV3: vi.fn(), lerOrigemRetornoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ enviarOrcamentoPorCanalV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/datas-correcao-actions", () => ({ corrigirDatasOSV3: m.corrigirDatas }));
vi.mock("@/components/operacoes-v3/components/SignaturePadV3", () => ({ SignaturePadV3: () => null }));

import { Topbar } from "@/components/painel-inicial/Topbar";
import { CommandDialog, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { CommandHeader } from "@/components/operacoes-v4-preview/parts/CommandHeader";
import { seedEntradaEditor } from "@/lib/operacoes-v4/entrada-form";
import { seedDadosBasicos } from "@/lib/operacoes-v4/dados-basicos-form";
import { EntradaWorkspace } from "@/components/operacoes-v4-preview/parts/stages/EntradaWorkspace";
import { EntradaStage } from "@/components/operacoes-v4-preview/parts/stages/EntradaStage";
import { CorrigirDatasModalV4 } from "@/components/operacoes-v4-preview/parts/CorrigirDatasModalV4";
import { useV4Preview, type V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";

const LOJA = "loja-qa-datas";
const AVISO = "A correção de datas operacionais não altera automaticamente pagamento, Caixa ou fechamento financeiro.";
const SEM_ENTREGA = "Entrega ainda não registrada. Corrija a entrada real, se necessário, e informe a data efetiva na etapa Entrega.";
type OSQA = OrdemServico & { aberturaV3: { versao?: number; recepcao: Record<string, unknown>; garantiaPrevista?: unknown } };
function os(id = "a", extra: Record<string, unknown> = {}): OSQA {
  return {
    id, storeId: LOJA, codigo: "OS-" + id.toUpperCase(), numero: id, status: "pronta", operacaoStatusV3: "pronta",
    criadoEm: "2026-10-10T12:00:00.000Z", prioridade: "media",
    cliente: { nome: "Cliente sintético" }, equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "QA", defeitoRelatado: "Tela quebrada" },
    aberturaV3: { versao: 1, recepcao: {
      recebidoPor: "Operador QA", origem: "balcao", prioridade: "normal",
      dataEntrada: "2026-10-02T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-10-02" },
      previsaoEntrega: "2026-10-08T21:30:00.000Z", previsaoEntregaMeta: { precisao: "data_hora", dia: "2026-10-08" },
    } },
    timeline: [], ...extra,
  } as unknown as OSQA;
}
function entregue(): OrdemServico {
  const base = os();
  return {
    ...base, status: "entregue", operacaoStatusV3: "entregue",
    aberturaV3: { ...base.aberturaV3, garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 } },
    entregueEm: "2026-10-08T15:00:00.000Z",
    entregaV3: { entregueEm: "2026-10-08T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-10-08" }, registradoEm: "2026-10-10T13:00:00.000Z" },
    retirada: { confirmado: true, retiradoEm: "2026-10-08T15:00:00.000Z" },
  } as unknown as OrdemServico;
}
function vals(o: OrdemServico = os(), extra: Record<string, unknown> = {}): V4Vals {
  return {
    selectedOsId: o.id, realOS: o, os: { aparelho: "Moto QA", cliente: "Cliente sintético", defeito: "Tela quebrada", origem: "Balcão" },
    detailLoading: false, detailError: null, cargaEntradaEstabelecida: true,
    entradaEditorSeed: seedEntradaEditor(o), dadosBasicosSeed: seedDadosBasicos(o), entradaFotos: [],
    salvarIdentificacao: vi.fn(async () => true), salvarProvaEntrada: vi.fn(async () => true),
    salvarChecklist: vi.fn(async () => true), salvarAcessorios: vi.fn(async () => true),
    salvarDadosBasicos: vi.fn(async () => true), openCorrigirDatas: vi.fn(), ...extra,
  } as unknown as V4Vals;
}
function datas() { return within(screen.getByRole("region", { name: "Datas do atendimento" })); }
function valor(rotulo: string) { return datas().getByText(rotulo, { selector: "dt" }).nextElementSibling?.textContent; }
function recepcao() { fireEvent.click(screen.getByRole("button", { name: /Recepção/ })); }
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
let servidor: OrdemServico[] = [];
const scrollIntoViewOriginal = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  // jsdom não faz layout. Só adapta APIs de medição/scroll; Dialog e foco são reais.
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T18:00:00.000Z"));
  h.loja = LOJA;
  servidor = [os("a"), os("b")];
  for (const fn of Object.values(m)) fn.mockReset();
  m.listOrdens.mockImplementation(async (sid: string) => servidor.map((o) => ({ ...o, storeId: sid })));
  m.getOrdem.mockImplementation(async (sid: string, id: string) => {
    const o = servidor.find((item) => item.id === id);
    return o ? { ...o, storeId: sid } : null;
  });
  m.corrigirDatas.mockResolvedValue({ ok: true, diff: [], garantia: { temImpacto: false, linhas: [] }, os: {} });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoViewOriginal });
});

describe("Datas persistidas e acesso visível na Entrada", () => {
  it("cadastro em 10/10 e entrada física anterior: mantém precisão, fuso e significados", () => {
    render(<EntradaWorkspace v={vals()} />);
    expect(valor("Entrada real do aparelho")).toBe("02/10/2026");
    expect(valor("Cadastro da OS no sistema")).toBe("10/10/2026 09:00");
    expect(valor("Previsão de entrega")).toBe("08/10/2026 18:30");
    expect(valor("Entrega efetiva")).toBe("Não registrada");
    expect(datas().getByText(SEM_ENTREGA)).toBeTruthy();
    expect(datas().getByText(AVISO)).toBeTruthy();
    // A seção também está visível quando a área inicial é Segurança.
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Segurança");
  });

  it("campos ausentes não herdam cadastro, previsão interna ou a data atual", () => {
    render(<EntradaWorkspace v={vals(os("a", {
      criadoEm: "inválido", aberturaV3: { recepcao: {} }, sla: { prazo: "2026-10-12T15:00:00.000Z" },
    }))} />);
    expect(valor("Entrada real do aparelho")).toBe("Não registrada");
    expect(valor("Cadastro da OS no sistema")).toBe("Não registrado");
    expect(valor("Previsão de entrega")).toBe("Não informada");
    expect(datas().queryAllByText(/2026/)).toHaveLength(0);
  });

  it("OS entregue mostra a data efetiva e mantém cadastro separado", () => {
    render(<EntradaWorkspace v={vals(entregue())} />);
    expect(valor("Entrega efetiva")).toBe("08/10/2026");
    expect(valor("Cadastro da OS no sistema")).toBe("10/10/2026 09:00");
    expect(datas().queryByText(SEM_ENTREGA)).toBeNull();
  });

  it("Corrigir datas e Corrigir dados da abertura têm ações distintas", () => {
    const v = vals();
    render(<EntradaWorkspace v={v} />);
    recepcao();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir dados da abertura" }));
    expect(screen.getByLabelText("Defeito relatado")).toBeTruthy();
    expect(v.openCorrigirDatas).not.toHaveBeenCalled();
    fireEvent.click(datas().getByRole("button", { name: "Corrigir datas" }));
    expect(v.openCorrigirDatas).toHaveBeenCalledTimes(1);
  });

  it("rascunho de outra área bloqueia correção, preserva edição e resumo persistido", () => {
    const v = vals();
    render(<EntradaWorkspace v={v} />);
    recepcao();
    fireEvent.change(screen.getByLabelText("Observações internas (opcional)"), { target: { value: "Preservar anotação" } });
    fireEvent.change(screen.getByLabelText(/^Previsão de entrega/), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: /Segurança/ }));
    expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(true);
    expect(datas().getByRole("status").textContent).toContain("rascunho está preservado");
    expect(valor("Previsão de entrega")).toBe("08/10/2026 18:30");
    fireEvent.click(datas().getByRole("button", { name: "Corrigir datas" }));
    expect(v.openCorrigirDatas).not.toHaveBeenCalled();
    recepcao();
    expect((screen.getByLabelText("Observações internas (opcional)") as HTMLTextAreaElement).value).toBe("Preservar anotação");
    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    { cargaEntradaEstabelecida: false, detailLoading: true },
    { cargaEntradaEstabelecida: false, detailError: "Falha de rede" },
    { selectedOsId: "outra-os" },
  ])("carga incompleta/erro/OS divergente bloqueia o acesso e oculta datas antigas: %j", (extra) => {
    const v = vals(os(), extra);
    render(<EntradaWorkspace v={v} />);
    expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(true);
    expect(datas().queryByText("02/10/2026")).toBeNull();
    expect(datas().getByRole("status").textContent).toContain("carregamento completo");
  });

  it("salvamento em curso mantém a correção bloqueada", async () => {
    const p = deferred<boolean>();
    render(<EntradaWorkspace v={vals(os(), { salvarDadosBasicos: () => p.promise })} />);
    recepcao();
    fireEvent.change(screen.getByLabelText("Prioridade"), { target: { value: "alta" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(datas().getByRole("status").textContent).toContain("Aguarde o salvamento");
    expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => p.resolve(true));
  });
});

let atual: V4Vals;
let janelaLegitima: (aberta: boolean) => void;
function Harness({ overlays = false }: { overlays?: boolean }) {
  const [legitima, setLegitima] = useState(false);
  const v = useV4Preview();
  useEffect(() => { atual = v; janelaLegitima = setLegitima; });
  return <>
    {overlays ? <Topbar /> : null}
    <div data-og-v4-raiz="" tabIndex={-1}>
    {overlays ? <CommandHeader v={v} /> : null}
    <EntradaStage v={v} />
    <CorrigirDatasModalV4 open={v.corrigirDatasOpen} os={v.realOS} onClose={v.closeCorrigirDatas} onSalvo={v.onDatasCorrigidas} />
    </div>
    {overlays ? <CommandDialog open={legitima} onOpenChange={setLegitima} title="Janela legítima">
      <CommandInput placeholder="Comando legítimo" />
      <CommandList><CommandItem>Uma ação legítima</CommandItem></CommandList>
    </CommandDialog> : null}
  </>;
}
async function montar(overlays = false) {
  const r = render(<Harness overlays={overlays} />);
  await waitFor(() => expect(atual.ordens).toHaveLength(2));
  act(() => atual.selectOS(servidor[0]!, "entrada"));
  await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
  return r;
}
function abrir() { fireEvent.click(datas().getByRole("button", { name: "Corrigir datas" })); }
function preencherEntrada() {
  fireEvent.change(screen.getByLabelText(/^Data de entrada do aparelho/), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Entrada física anterior ao cadastro" } });
}
function salvarCorrecao() { fireEvent.click(screen.getByRole("button", { name: "Salvar correção" })); }

describe("Novo acesso -> hook real -> editor auditado existente", () => {
  it("mantém o teclado dentro da correção e devolve foco ao acesso visível", async () => {
    await montar();
    const acesso = datas().getByRole("button", { name: "Corrigir datas" });
    acesso.focus();
    abrir();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const janela = within(dialog);
    const fechar = janela.getByRole("button", { name: "Fechar" });
    const cancelar = janela.getByRole("button", { name: "Cancelar" });
    fechar.focus();
    fireEvent.keyDown(fechar, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancelar);
    fireEvent.keyDown(cancelar, { key: "Tab" });
    expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(fechar, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(acesso));
  });

  it("Escape durante o salvamento preserva a janela e a requisição auditada", async () => {
    const p = deferred<unknown>();
    m.corrigirDatas.mockReturnValueOnce(p.promise);
    await montar();
    abrir();
    preencherEntrada();
    salvarCorrecao();
    await waitFor(() => expect(m.corrigirDatas).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByLabelText(/^Data de entrada do aparelho/), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => p.resolve({ ok: true, diff: [], garantia: null, os: {} }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("entrega de 06/10 não registrada: corrige só a entrada, sem criar entrega/pagamento", async () => {
    await montar();
    abrir();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(AVISO)).toBeTruthy();
    expect(dialog.queryByLabelText(/^Data da entrega/)).toBeNull();
    preencherEntrada();
    const leituras = m.getOrdem.mock.calls.length;
    salvarCorrecao();
    await waitFor(() => expect(m.corrigirDatas).toHaveBeenCalledTimes(1));
    expect(m.corrigirDatas.mock.calls[0]).toEqual([LOJA, "a", expect.objectContaining({
      motivo: "Entrada física anterior ao cadastro",
      alteracoes: { dataEntrada: { iso: "2026-10-01T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-10-01" } } },
      esperados: { dataEntrada: "2026-10-02T15:00:00.000Z|dia" },
    })]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(m.getOrdem.mock.calls.length).toBeGreaterThan(leituras);
    expect(m.entregar).not.toHaveBeenCalled();
    expect(m.receber).not.toHaveBeenCalled();
  });

  it("corrige entrada e entrega juntas, preservando motivo, CAS e confirmação de garantia", async () => {
    servidor[0] = entregue();
    await montar();
    abrir();
    preencherEntrada();
    fireEvent.change(screen.getByLabelText(/^Data da entrega/), { target: { value: "2026-10-06" } });
    salvarCorrecao();
    expect(m.corrigirDatas).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Confirmo que a garantia passa a contar/ }));
    salvarCorrecao();
    await waitFor(() => expect(m.corrigirDatas).toHaveBeenCalledTimes(1));
    expect(m.corrigirDatas.mock.calls[0]![2]).toMatchObject({
      motivo: "Entrada física anterior ao cadastro", confirmarImpactoGarantia: true,
      alteracoes: {
        dataEntrada: { iso: "2026-10-01T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-10-01" } },
        dataEntrega: { iso: "2026-10-06T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-10-06" } },
      },
      esperados: { dataEntrada: "2026-10-02T15:00:00.000Z|dia", dataEntrega: "2026-10-08T15:00:00.000Z|dia" },
    });
    expect(m.entregar).not.toHaveBeenCalled();
    expect(m.receber).not.toHaveBeenCalled();
  });

  it.each(["conflito", "permissao"])("%s do editor atual mantém os valores e o motivo, sem fechar a janela", async (tipo) => {
    m.corrigirDatas.mockResolvedValue({ ok: false, tipo, mensagem: "Correção recusada pelo servidor" });
    await montar();
    abrir();
    preencherEntrada();
    salvarCorrecao();
    expect(await screen.findByText("Correção recusada pelo servidor")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText(/^Data de entrada do aparelho/) as HTMLInputElement).value).toBe("2026-10-01");
    expect((screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/) as HTMLTextAreaElement).value).toContain("Entrada física");
  });

  it("o menu também respeita o rascunho sujo da Entrada", async () => {
    await montar();
    recepcao();
    fireEvent.change(screen.getByLabelText("Observações internas (opcional)"), { target: { value: "Não perder" } });
    act(() => atual.moreItems.find((item) => item.label === "Corrigir datas")!.onClick());
    expect(atual.corrigirDatasOpen).toBe(false);
    expect(atual.toast).toContain("Salve ou descarte");
    expect((screen.getByLabelText("Observações internas (opcional)") as HTMLTextAreaElement).value).toBe("Não perder");
    expect(m.corrigirDatas).not.toHaveBeenCalled();
  });

  it("troca de OS fecha o modal e voltar não ressuscita a janela antiga", async () => {
    await montar();
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => atual.selectOS(servidor[1]!, "entrada"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    act(() => atual.selectOS(servidor[0]!, "entrada"));
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("troca de loja com o mesmo id fecha o modal e impede reutilizar o motivo", async () => {
    const r = await montar();
    abrir();
    preencherEntrada();
    h.loja = "loja-qa-outra";
    r.rerender(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    abrir();
    expect((screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/) as HTMLTextAreaElement).value).toBe("");
    expect(m.corrigirDatas).not.toHaveBeenCalled();
  });

  it.each(["os", "loja"])("resposta tardia ao salvar não fecha a nova correção após trocar %s", async (troca) => {
    const p = deferred<unknown>();
    m.corrigirDatas.mockReturnValueOnce(p.promise);
    const r = await montar();
    abrir();
    preencherEntrada();
    salvarCorrecao();
    await waitFor(() => expect(m.corrigirDatas).toHaveBeenCalledTimes(1));
    if (troca === "os") act(() => atual.selectOS(servidor[1]!, "entrada"));
    else { h.loja = "loja-qa-outra"; r.rerender(<Harness />); }
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/), { target: { value: "Motivo da seleção nova" } });
    await act(async () => p.resolve({ ok: true, diff: [], garantia: null, os: {} }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByPlaceholderText(/Ex\.: o aparelho foi entregue/) as HTMLTextAreaElement).value).toBe("Motivo da seleção nova");
    expect(m.corrigirDatas.mock.calls[0]!.slice(0, 2)).toEqual([LOJA, "a"]);
    expect(m.corrigirDatas).toHaveBeenCalledTimes(1);
  });

  it("refresh da mesma OS mantém formulário e CAS do que foi visto ao abrir", async () => {
    await montar();
    abrir();
    preencherEntrada();
    const p = deferred<OrdemServico>();
    m.getOrdem.mockReturnValueOnce(p.promise);
    act(() => h.reloadDetail());
    expect(screen.getByRole("dialog")).toBeTruthy();
    const nova = os();
    const novaEntrada = { ...nova.aberturaV3!.recepcao, dataEntrada: "2026-10-03T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-10-03" } };
    await act(async () => p.resolve({ ...nova, aberturaV3: { ...nova.aberturaV3, recepcao: novaEntrada } } as unknown as OrdemServico));
    expect((screen.getByLabelText(/^Data de entrada do aparelho/) as HTMLInputElement).value).toBe("2026-10-01");
    salvarCorrecao();
    await waitFor(() => expect(m.corrigirDatas).toHaveBeenCalledTimes(1));
    expect(m.corrigirDatas.mock.calls[0]![2].esperados.dataEntrada).toBe("2026-10-02T15:00:00.000Z|dia");
  });

  it("detalhe pendente bloqueia botão e menu até confirmar a OS da seleção", async () => {
    const p = deferred<OrdemServico>();
    m.getOrdem.mockReturnValueOnce(p.promise);
    const r = renderHook(() => useV4Preview());
    await waitFor(() => expect(r.result.current.ordens).toHaveLength(2));
    act(() => r.result.current.selectOS(servidor[0]!, "entrada"));
    act(() => r.result.current.openCorrigirDatas());
    expect(r.result.current.corrigirDatasOpen).toBe(false);
    await act(async () => p.resolve(servidor[0]!));
    act(() => r.result.current.openCorrigirDatas());
    expect(r.result.current.corrigirDatasOpen).toBe(true);
  });
});

function bloquearTodosOsAcessos() {
  expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => atual.openCorrigirDatas());
  act(() => atual.moreItems.find((item) => item.label === "Corrigir datas")!.onClick());
  expect(atual.corrigirDatasOpen).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(atual.toast).toContain("Aguarde o salvamento");
  expect(m.corrigirDatas).not.toHaveBeenCalled();
}

describe("Corretivo P2: ocupação compartilhada da Entrada", () => {
  it("P2-2: registrar nenhum acessório sem sujeira bloqueia botão, comando e menu até terminar", async () => {
    const p = deferred<undefined>();
    m.acessorios.mockReturnValueOnce(p.promise);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Segurança/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar: nenhum acessório recebido" }));
    await waitFor(() => expect(m.acessorios).toHaveBeenCalledTimes(1));
    try {
      expect(atual.rascunhos!.sujo(LOJA + "::a")).toBe(false);
      expect(datas().getByRole("status").textContent).toContain("Aguarde o salvamento");
      bloquearTodosOsAcessos();
    } finally { await act(async () => p.resolve(undefined)); }
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    act(() => atual.moreItems.find((item) => item.label === "Corrigir datas")!.onClick());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("comando já capturado recusa salvamento sem rascunho no mesmo evento, antes do render", async () => {
    const p = deferred<undefined>();
    m.checklist.mockReturnValueOnce(p.promise);
    await montar();
    const comando = atual.moreItems.find((item) => item.label === "Corrigir datas")!.onClick;
    let salvamento!: Promise<boolean>;
    act(() => { salvamento = atual.salvarChecklist([]); comando(); });
    try {
      expect(atual.rascunhos!.sujo(LOJA + "::a")).toBe(false);
      expect(atual.corrigirDatasOpen).toBe(false);
      bloquearTodosOsAcessos();
    } finally { await act(async () => { p.resolve(undefined); await salvamento; }); }
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("rascunho que volta ao original durante o salvamento continua bloqueado e preservado", async () => {
    const p = deferred<undefined>();
    m.dadosBasicos.mockReturnValueOnce(p.promise);
    await montar();
    recepcao();
    const campo = screen.getByLabelText("Observações internas (opcional)") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "Anotação em gravação" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(m.dadosBasicos).toHaveBeenCalledTimes(1));
    fireEvent.change(campo, { target: { value: "" } });
    try {
      expect(atual.rascunhos!.sujo(LOJA + "::a")).toBe(false);
      bloquearTodosOsAcessos();
      expect(campo.value).toBe("");
    } finally { await act(async () => p.resolve(undefined)); }
    await waitFor(() => expect(atual.entradaOcupada).toBe(false));
    expect(campo.value).toBe("");
    // A gravação confirmou o snapshot enviado. A edição posterior continua
    // preservada como rascunho; só a ocupação deve ser liberada neste ponto.
    expect(datas().getByRole("status").textContent).toContain("Salve ou descarte");
    fireEvent.change(campo, { target: { value: "Anotação em gravação" } });
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("operações simultâneas no mesmo alvo só liberam após a última resposta", async () => {
    const a = deferred<undefined>();
    const b = deferred<undefined>();
    m.acessorios.mockReturnValueOnce(a.promise);
    m.checklist.mockReturnValueOnce(b.promise);
    await montar();
    let pa!: Promise<boolean>;
    let pb!: Promise<boolean>;
    act(() => {
      pa = atual.salvarAcessorios([], { registrarSemAlteracao: true });
      pb = atual.salvarChecklist([]);
    });
    await act(async () => { a.resolve(undefined); await pa; });
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    try { bloquearTodosOsAcessos(); }
    finally { await act(async () => { b.resolve(undefined); await pb; }); }
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("recusa do servidor libera a ocupação e preserva o rascunho para revisão", async () => {
    m.dadosBasicos.mockRejectedValueOnce(new Error("Permissão recusada no servidor"));
    await montar();
    recepcao();
    const campo = screen.getByLabelText("Observações internas (opcional)") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "Preservar após recusa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(m.dadosBasicos).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeTruthy());
    expect(campo.value).toBe("Preservar após recusa");
    expect(datas().getByRole("status").textContent).toContain("Salve ou descarte");
    fireEvent.change(campo, { target: { value: "" } });
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each(["os", "loja"])("ocupação pertence ao alvo: troca de %s e resposta antiga não liberam a operação nova", async (troca) => {
    const a = deferred<undefined>();
    const b = deferred<undefined>();
    m.acessorios.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const r = await montar();
    let pa!: Promise<boolean>;
    let pb!: Promise<boolean>;
    act(() => { pa = atual.salvarAcessorios([], { registrarSemAlteracao: true }); });
    if (troca === "os") act(() => atual.selectOS(servidor[1]!, "entrada"));
    else { h.loja = "loja-qa-outra"; r.rerender(<Harness />); }
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    act(() => { pb = atual.salvarAcessorios([], { registrarSemAlteracao: true }); });
    await act(async () => { a.resolve(undefined); await pa; });
    try { bloquearTodosOsAcessos(); }
    finally { await act(async () => { b.resolve(undefined); await pb; }); }
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("A→B→A conserva a ocupação original até a action terminar", async () => {
    const p = deferred<undefined>();
    m.acessorios.mockReturnValueOnce(p.promise);
    await montar();
    let salvamento!: Promise<boolean>;
    act(() => { salvamento = atual.salvarAcessorios([], { registrarSemAlteracao: true }); });
    act(() => atual.selectOS(servidor[1]!, "entrada"));
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    act(() => atual.selectOS(servidor[0]!, "entrada"));
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    try { bloquearTodosOsAcessos(); }
    finally { await act(async () => { p.resolve(undefined); await salvamento; }); }
    await waitFor(() => expect((datas().getByRole("button", { name: "Corrigir datas" }) as HTMLButtonElement).disabled).toBe(false));
    abrir();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Corretivo P2: recuperação de foco e listeners", () => {
  it("recupera foco externo, contém teclado ocupado e remove os listeners ao desmontar", async () => {
    const p = deferred<unknown>();
    m.corrigirDatas.mockReturnValueOnce(p.promise);
    const r = await montar();
    const acesso = datas().getByRole("button", { name: "Corrigir datas" });
    acesso.focus();
    abrir();
    preencherEntrada();
    const dialog = screen.getByRole("dialog");
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "Salvar correção" }));
    expect((within(dialog).getByRole("button", { name: "Salvando…" }) as HTMLButtonElement).disabled).toBe(true);
    acesso.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);
    // Exercita o fallback mesmo se nenhum controle puder receber Tab.
    dialog.querySelectorAll<HTMLInputElement>("button,input,textarea,select").forEach((c) => { c.disabled = true; });
    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dialog);
    r.unmount();
    const externo = document.createElement("button");
    document.body.append(externo);
    externo.focus();
    expect(document.activeElement).toBe(externo);
    expect(fireEvent.keyDown(externo, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(externo, { key: "Escape" })).toBe(true);
    externo.remove();
    await act(async () => p.resolve({ ok: true, diff: [], garantia: null, os: {} }));
  });
});


describe("P2/P3 — Topbar + CommandDialog Radix + correção reais", () => {
  it.each([false, true])("Ctrl+K respeita a correção (ocupada=%s)", async (busy) => {
    const p = deferred<unknown>();
    if (busy) m.corrigirDatas.mockReturnValueOnce(p.promise);
    await montar(true);
    abrir();
    if (busy) { preencherEntrada(); salvarCorrecao(); }
    await userEvent.setup().keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog", { name: "Buscar Rota ou Ação" })).toBeNull();
    const dialog = screen.getByRole("dialog", { name: /^Corrigir datas/ });
    expect(dialog.contains(document.activeElement)).toBe(true);
    if (busy) await act(async () => p.resolve({ ok: false, tipo: "conflito", mensagem: "Recusa sintética" }));
  });

  it("Ctrl+K alterna normalmente fora da correção", async () => {
    await montar(true);
    const origem = datas().getByRole("button", { name: "Corrigir datas" });
    origem.focus();
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("dialog", { name: "Buscar Rota ou Ação" });
    expect(palette.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(origem));
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("outra janela mantém foco/Escape quando o busy termina", async () => {
    const p = deferred<unknown>();
    m.corrigirDatas.mockReturnValueOnce(p.promise);
    await montar(true);
    abrir(); preencherEntrada(); salvarCorrecao();
    act(() => janelaLegitima(true));
    const legitima = screen.getByRole("dialog", { name: "Janela legítima" });
    await waitFor(() => expect(legitima.contains(document.activeElement)).toBe(true));
    await act(async () => p.resolve({ ok: false, tipo: "conflito", mensagem: "Recusa sintética" }));
    expect(legitima.contains(document.activeElement)).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Janela legítima" })).toBeNull();
    expect(screen.getByRole("dialog", { name: /^Corrigir datas/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("dialog", { name: /^Corrigir datas/ }).contains(document.activeElement)).toBe(true));
  });

  it("correção solicitada aguarda a paleta ativa sem disputar foco", async () => {
    await montar(true);
    const user = userEvent.setup();
    await user.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("dialog", { name: "Buscar Rota ou Ação" });
    act(() => atual.openCorrigirDatas());
    expect(palette.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("dialog", { name: /^Corrigir datas/ })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("dialog", { name: /^Corrigir datas/ }).contains(document.activeElement)).toBe(true));
  });

  it("pedido no mesmo evento que fecha a paleta não fica aguardando um nó removido", async () => {
    await montar(true);
    await userEvent.setup().keyboard("{Control>}k{/Control}");
    act(() => {
      atual.openCorrigirDatas();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    await waitFor(() => expect(screen.getByRole("dialog", { name: /^Corrigir datas/ }).contains(document.activeElement)).toBe(true));
  });

  it("menu removido restaura foco à raiz da V4", async () => {
    const r = await montar(true);
    const user = userEvent.setup();
    await user.click(screen.getByTitle("Mais ações"));
    const item = screen.getByRole("button", { name: /📅.*Corrigir datas/ });
    await user.click(item);
    expect(item.isConnected).toBe(false);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(r.container.querySelector("[data-og-v4-raiz]")));
  });

  it("sucesso restaura o botão original após a recarga da mesma Entrada", async () => {
    await montar(true);
    const acesso = datas().getByRole("button", { name: "Corrigir datas" });
    acesso.focus(); abrir(); preencherEntrada(); salvarCorrecao();
    await waitFor(() => expect(atual.corrigirDatasOpen).toBe(false));
    await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    expect(acesso.isConnected).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(acesso));
  });

  it.each([false, true])("recarga atrasada não rouba foco escolhido nem deixa restauração após unmount=%s", async (desmontar) => {
    const r = await montar(true);
    const acesso = datas().getByRole("button", { name: "Corrigir datas" });
    acesso.focus(); abrir(); preencherEntrada();
    const reload = deferred<OrdemServico | null>();
    m.getOrdem.mockReturnValueOnce(reload.promise);
    salvarCorrecao();
    await waitFor(() => expect(atual.corrigirDatasOpen).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(r.container.querySelector("[data-og-v4-raiz]")));
    if (desmontar) r.unmount();
    const destino = document.createElement("button");
    document.body.append(destino); destino.focus();
    await act(async () => reload.resolve(servidor[0]!));
    if (!desmontar) await waitFor(() => expect(atual.cargaEntradaEstabelecida).toBe(true));
    expect(document.activeElement).toBe(destino);
    destino.remove();
  });

  it("a restauração adiada não rouba foco da nova OS ou do unmount", async () => {
    const r = await montar(true);
    const acesso = datas().getByRole("button", { name: "Corrigir datas" });
    acesso.focus(); abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    act(() => atual.selectOS(servidor[1]!, "entrada"));
    const destino = document.createElement("button");
    document.body.append(destino); destino.focus();
    await waitFor(() => expect(atual.realOS?.id).toBe("b"));
    expect(document.activeElement).toBe(destino);
    r.unmount();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(destino);
    expect(fireEvent.keyDown(destino, { key: "Escape" })).toBe(true);
    destino.remove();
  });
});
