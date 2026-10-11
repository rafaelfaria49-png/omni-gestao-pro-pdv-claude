// R8: superfície V4 montada com useV4Preview e hook financeiro reais; actions espiãs.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ loja: "loja-qa-frg2" as string | null }));
const m = vi.hoisted(() => ({
  listOrdens: vi.fn(),
  getOrdem: vi.fn(),
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(async () => []),
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: vi.fn(),
  aprovarOrcamentoParaReceberV3: vi.fn(),
  conferirEscopoAprovacaoV3: vi.fn(),
  conferirFormalizacaoAprovacaoV3: vi.fn(),
  formalizarAprovacaoPendenteV3: vi.fn(),
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
  estornarRecebimentoOSV3: vi.fn(),
  registrarRecebimentoMistoOSV3: m.registrarRecebimentoMistoOSV3,
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  registrarEntregaV3: vi.fn(), salvarAssinaturaRetiradaV3: vi.fn(), adicionarFotoSaidaV3: vi.fn(), removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(), salvarOrcamentoV3: vi.fn(), corrigirOrcamentoV3: vi.fn(), recusarOrcamentoV3: vi.fn(), aprovarOrcamentoV3: vi.fn(),
  aprovarOrcamentoParaReceberV3: m.aprovarOrcamentoParaReceberV3,
  conferirEscopoAprovacaoV3: m.conferirEscopoAprovacaoV3,
  conferirFormalizacaoAprovacaoV3: m.conferirFormalizacaoAprovacaoV3,
  formalizarAprovacaoPendenteV3: m.formalizarAprovacaoPendenteV3,
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
import type { EntradaFormalizacaoV3, EscopoFormalizacaoV3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";

const LOJA = "loja-qa-frg2";

function os(id: string): OrdemServico {
  return {
    id, storeId: LOJA, codigo: `OS-${id.toUpperCase()}`, numero: id.toUpperCase(), status: "pronta", operacaoStatusV3: "pronta",
    cliente: { nome: `Cliente ${id}` }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA" },
    criadoEm: "2026-10-01T12:00:00.000Z", prioridade: "media",
    orcamento: { id: "orc", status: "aprovado", sintetizado: false, total: 300, desconto: 0, criadoEm: "2026-10-01T12:00:00Z", servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [] },
    timeline: [],
  } as unknown as OrdemServico;
}
const A = os("a");
const B = os("b");
const proj = (o: OrdemServico, loja = LOJA) =>
  projectFinancialOSV4({ storeId: loja, osId: o.id, prismaValorTotal: 300, loadedAt: "2026-10-09T12:00:00Z", payload: { ...(o as unknown as Record<string, unknown>), valorTotal: 300 } as never, titulo: null });

function adiado<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

beforeEach(() => {
  localStorage.clear();
  h.loja = LOJA;
  for (const fn of Object.values(m)) fn.mockReset();
  m.listOrdens.mockImplementation(async () => [A, B]);
  m.getOrdem.mockImplementation(async (_sid: string, id: string) => (id === "a" ? A : id === "b" ? B : null));
  m.lerProjecaoFinanceiraOSV4.mockImplementation(async (sid: string, id: string) => proj(id === "a" ? A : B, sid));
  m.lerProjecoesFinanceirasOSV4.mockImplementation(async () => []);
  m.lerPagamentoOSV3.mockImplementation(async () => ({ total: 300, recebido: 0, saldo: 300, status: "aberto", sessao: { aberta: true, sessaoId: "sessao-qa" }, aPrazo: null }));
});
afterEach(() => cleanup());

async function montarComOS(id: "a" | "b") {
  const r = renderHook(() => useV4Preview());
  await waitFor(() => expect(r.result.current.ordens.length).toBe(2));
  await act(async () => r.result.current.selectOS(id === "a" ? A : B, "orcamento"));
  await waitFor(() => expect(r.result.current.realOS?.id).toBe(id));
  await waitFor(() => expect(r.result.current.financial.projection?.osId).toBe(id));
  await waitFor(() => expect(r.result.current.pdvServico.loading).toBe(false));
  return r;
}


import { ReceberPagamentoV4 } from "@/components/operacoes-v4-preview/parts/ReceberPagamentoV4";
let vivo: ReturnType<typeof useV4Preview>;
function TelaReal() { const v = useV4Preview(); useEffect(() => { vivo = v; }, [v]); return <ReceberPagamentoV4 v={v} />; }
async function abrirTela() {
  const r = render(<TelaReal />); await waitFor(() => expect(vivo.ordens.length).toBe(2));
  await act(async () => vivo.selectOS(A, "financeiro")); await waitFor(() => expect(vivo.realOS?.id).toBe("a")); await waitFor(() => expect(vivo.pdvServico.loading).toBe(false));
  act(() => vivo.openReceberPagamentoAqui()); await screen.findByRole("dialog", { name: "Receber pagamento" }); return r;
}
function confirmar() { const d = screen.getByRole("dialog", { name: "Receber pagamento" }); fireEvent.click(within(d).getByRole("button", { name: "Pagamento parcial" })); fireEvent.change(within(d).getByLabelText("Forma da linha 1"), { target: { value: "pix" } }); fireEvent.change(within(d).getByLabelText("Valor da linha 1"), { target: { value: "100" } }); fireEvent.change(within(d).getByLabelText("Observação (opcional)"), { target: { value: "Rascunho do operador" } }); fireEvent.click(within(d).getByRole("button", { name: /^Confirmar R/ })); }
const negativo = (i: { operacaoId: string }, codigo = "VALORES_DIVERGENTES", destino = "financeiro") => ({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: i.operacaoId, requestFingerprint: "duravel", mensagem: "Recusa original do servidor", comercial: { codigo, destino } });

describe("R8 · V4 montada com useV4Preview e hook V3 reais", () => {
  it.each([["APROVACAO_COMERCIAL_PENDENTE", "comercial"], ["ORCAMENTO_RECUSADO", "comercial"], ["ORCAMENTO_EXPIRADO", "comercial"], ["PRECO_AUSENTE", "comercial"], ["VALORES_DIVERGENTES", "financeiro"]])("%s: preserva rascunho e navega apenas ao destino canônico", async (codigo, destino) => {
    m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i, codigo, destino)); await abrirTela(); confirmar();
    const aviso = await screen.findByTestId("recusa-comercial"); expect(aviso.textContent).toContain("Recusa original do servidor");
    expect((screen.getByLabelText("Observação (opcional)") as HTMLInputElement).value).toBe("Rascunho do operador"); expect(vivo.pdvServico.pendenciaReceber).toBeNull();
    expect((screen.getByRole("button", { name: /^Confirmar R/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(aviso).getByRole("button", { name: destino === "comercial" ? "Conferir orçamento →" : "Conferir cobrança →" }));
    await waitFor(() => expect(vivo.stage).toBe(destino === "comercial" ? "orcamento" : "financeiro")); expect(vivo.receberPagamentoOpen).toBe(false); expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.receberOSV3).toHaveBeenCalledTimes(1); expect(m.aprovarOrcamentoParaReceberV3).not.toHaveBeenCalled(); expect(vivo.pdvServico.recusaComercial).toBeNull();
  });
  it("fechar e reabrir não recupera motivo histórico; restaura foco", async () => {
    const origem = document.createElement("button"); origem.textContent = "Origem"; document.body.append(origem); origem.focus();
    try {
      m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i)); await abrirTela(); confirmar(); await screen.findByTestId("recusa-comercial"); fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(document.activeElement).toBe(origem); act(() => vivo.openReceberPagamentoAqui()); await screen.findByRole("dialog"); expect(screen.queryByTestId("recusa-comercial")).toBeNull();
    } finally { origem.remove(); }
  });
  it("nova confirmação pendente retira o atalho comercial e mantém o rascunho original travado", async () => {
    m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i)); await abrirTela(); confirmar(); await screen.findByTestId("recusa-comercial");
    let resolver!: (r: unknown) => void; m.receberOSV3.mockReturnValue(new Promise(r => { resolver = r; })); confirmar(); await waitFor(() => expect(vivo.pdvServico.recebendo).toBe(true));
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect((screen.getByLabelText("Observação (opcional)") as HTMLInputElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolver({ estado: "INCERTO" })); expect(vivo.pdvServico.pendenciaReceber).not.toBeNull(); expect(screen.queryByRole("button", { name: /Conferir cobrança/ })).toBeNull();
  });
  it.each(["os", "loja", "A-B-A"])("resposta tardia em %s não vaza motivo nem fecha superfície nova", async campo => {
    let resolver!: (r: unknown) => void; m.receberOSV3.mockReturnValue(new Promise(r => { resolver = r; })); const r = await abrirTela(); confirmar();
    if (campo === "loja") { h.loja = "loja-b"; r.rerender(<TelaReal />); await waitFor(() => expect(vivo.pdvServico.pagamento).toBeNull()); }
    else { await act(async () => vivo.selectOS(B, "financeiro")); await waitFor(() => expect(vivo.realOS?.id).toBe("b")); if (campo === "A-B-A") { await act(async () => vivo.selectOS(A, "financeiro")); await waitFor(() => expect(vivo.realOS?.id).toBe("a")); } act(() => vivo.openReceberPagamentoAqui()); }
    await act(async () => resolver(negativo(m.receberOSV3.mock.calls[0]![2])));
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect(vivo.pdvServico.recusaComercial).toBeNull(); expect(m.receberOSV3).toHaveBeenCalledTimes(1);
  });
});


function confirmarMisto() {
  const d = screen.getByRole("dialog", { name: "Receber pagamento" });
  fireEvent.change(within(d).getByLabelText("Forma da linha 1"), { target: { value: "pix" } }); fireEvent.change(within(d).getByLabelText("Valor da linha 1"), { target: { value: "100" } });
  fireEvent.click(within(d).getByRole("button", { name: "+ Dividir pagamento" })); fireEvent.change(within(d).getByLabelText("Forma da linha 2"), { target: { value: "a_prazo" } });
  fireEvent.change(within(d).getByLabelText("Vencimento da parte a prazo"), { target: { value: "2099-12-31" } }); fireEvent.change(within(d).getByLabelText("Observação (opcional)"), { target: { value: "Rascunho misto N2" } });
  const b = within(d).getByRole("button", { name: /^Registrar R/ }); expect((b as HTMLButtonElement).disabled).toBe(false); fireEvent.click(b);
}
describe("N2 · V4 mista montada com useV4Preview e hook real", () => {
  it.each([["PRECO_AUSENTE", "comercial"], ["VALORES_DIVERGENTES", "financeiro"]])("%s preserva rascunho e só navega ao clicar no destino correto", async (codigo, destino) => {
    m.registrarRecebimentoMistoOSV3.mockResolvedValue({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: "Recusa mista original do servidor", comercial: { codigo, destino } }); await abrirTela(); confirmarMisto();
    const aviso = await screen.findByTestId("recusa-comercial"); expect(aviso.textContent).toContain("Recusa mista original do servidor"); expect(vivo.stage).toBe("financeiro"); expect(vivo.receberPagamentoOpen).toBe(true);
    expect((screen.getByLabelText("Observação (opcional)") as HTMLInputElement).value).toBe("Rascunho misto N2"); expect((screen.getByLabelText("Valor da linha 1") as HTMLInputElement).value).toBe("100"); expect(vivo.pdvServico.pendenciaMisto).toBeNull();
    expect((screen.getByRole("button", { name: /^Registrar R/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(aviso).getByRole("button", { name: destino === "comercial" ? "Conferir orçamento →" : "Conferir cobrança →" }));
    await waitFor(() => expect(vivo.stage).toBe(destino === "comercial" ? "orcamento" : "financeiro")); expect(vivo.receberPagamentoOpen).toBe(false); expect(vivo.pdvServico.recusaComercial).toBeNull();
    expect(m.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1); expect(m.receberOSV3).not.toHaveBeenCalled(); expect(m.aprovarOrcamentoParaReceberV3).not.toHaveBeenCalled();
  });
});


describe("N2 · ciclo de vida da orientação mista na V4", () => {
  it.each(["os", "loja", "A-B-A"])("resposta mista tardia em %s não publica orientação na superfície atual", async campo => {
    let resolver!: (r: unknown) => void; m.registrarRecebimentoMistoOSV3.mockReturnValue(new Promise(r => { resolver = r; })); const r = await abrirTela(); confirmarMisto();
    if (campo === "loja") { h.loja = "loja-b"; r.rerender(<TelaReal />); await waitFor(() => expect(vivo.pdvServico.pagamento).toBeNull()); }
    else { await act(async () => vivo.selectOS(B, "financeiro")); await waitFor(() => expect(vivo.realOS?.id).toBe("b")); if (campo === "A-B-A") { await act(async () => vivo.selectOS(A, "financeiro")); await waitFor(() => expect(vivo.realOS?.id).toBe("a")); } act(() => vivo.openReceberPagamentoAqui()); }
    await act(async () => resolver({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: "Recusa mista de visita antiga", comercial: { codigo: "VALORES_DIVERGENTES", destino: "financeiro" } }));
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect(vivo.pdvServico.recusaComercial).toBeNull(); expect(m.registrarRecebimentoMistoOSV3).toHaveBeenCalledTimes(1);
  });
  it("fechar/reabrir limpa a orientação mista e restaura foco", async () => {
    const origem = document.createElement("button"); document.body.append(origem); origem.focus();
    try {
      m.registrarRecebimentoMistoOSV3.mockResolvedValue({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: "Recusa mista original", comercial: { codigo: "PRECO_AUSENTE", destino: "comercial" } }); await abrirTela(); confirmarMisto(); await screen.findByTestId("recusa-comercial"); fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(document.activeElement).toBe(origem); act(() => vivo.openReceberPagamentoAqui()); await screen.findByRole("dialog"); expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect(vivo.pdvServico.recusaComercial).toBeNull();
    } finally { origem.remove(); }
  });
  it("nova confirmação mista incerta limpa orientação e mantém o rascunho bloqueado", async () => {
    m.registrarRecebimentoMistoOSV3.mockResolvedValue({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: "Recusa mista original", comercial: { codigo: "PRECO_AUSENTE", destino: "comercial" } }); await abrirTela(); confirmarMisto(); await screen.findByTestId("recusa-comercial");
    let resolver!: (r: unknown) => void; m.registrarRecebimentoMistoOSV3.mockReturnValue(new Promise(r => { resolver = r; })); fireEvent.click(screen.getByRole("button", { name: /^Registrar R/ })); await waitFor(() => expect(vivo.pdvServico.registrandoMisto).toBe(true));
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect((screen.getByLabelText("Observação (opcional)") as HTMLInputElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolver({ ok: false, code: "sem_permissao", mensagem: "Sem conferência", comercial: { codigo: "PRECO_AUSENTE", destino: "comercial" } })); expect(vivo.pdvServico.pendenciaMisto).not.toBeNull(); expect(screen.queryByRole("button", { name: /Conferir orçamento/ })).toBeNull();
  });
});
