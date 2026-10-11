import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";
const m = vi.hoisted(() => ({ lerPagamentoOSV3: vi.fn(), receberOSV3: vi.fn(), registrarRecebimentoMistoOSV3: vi.fn(), estornarRecebimentoOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => m);
import { PdvServicoV3 } from "@/components/operacoes-v3/pages/PdvServicoV3";
import { OperacoesV3Context, type OperacoesV3ContextValue } from "@/components/operacoes-v3/context/OperacoesV3Context";
const A = { id: "os-a", codigo: "OS-A", status: "pronta", operacaoStatusV3: "pronta", cliente: { nome: "Cliente QA" }, equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" }, orcamento: { id: "orc-a", status: "aprovado", pecas: [], servicos: [{ id: "s", descricao: "Tela", valor: 400 }], desconto: 0, total: 400, criadoEm: "2026-10-01T12:00:00Z" } } as unknown as OrdemServico;
const leitura = { total: 400, recebido: 0, saldo: 400, status: "aberto", sessao: { aberta: true, sessaoId: "caixa" }, aPrazo: null };
function contexto(selectedOsId = A.id, storeId = "loja-qa"): OperacoesV3ContextValue {
  return { storeId, activeScreen: "pdv-servico", selectedOsId, navigate: vi.fn(), openOS: vi.fn(), ordens: [A, { ...A, id: "os-b", codigo: "OS-B" }], loading: false, primeiraCarga: false, error: null, reload: vi.fn(), mudarStatus: vi.fn(async () => true), abrirNovaOS: vi.fn(), notificar: vi.fn(), acaoEmConstrucao: vi.fn() };
}
function tela(c: OperacoesV3ContextValue) { return <OperacoesV3Context.Provider value={c}><PdvServicoV3 /></OperacoesV3Context.Provider>; }
async function montar() { const c = contexto(), r = render(tela(c)); await screen.findByText(/Saldo a receber/); await waitFor(() => expect((screen.getByLabelText(/Valor a receber/) as HTMLInputElement).value).not.toBe("")); return { ...r, c }; }
function enviar() { fireEvent.click(screen.getByRole("button", { name: /^PIX$/ })); fireEvent.change(screen.getByLabelText(/Valor a receber/), { target: { value: "100" } }); const b = screen.getByRole("button", { name: /^Receber · / }); expect((b as HTMLButtonElement).disabled).toBe(false); fireEvent.click(b); }
const negativo = (i: { operacaoId: string }, comercial: unknown) => ({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: i.operacaoId, requestFingerprint: "duravel", mensagem: "Motivo original devolvido pelo servidor", comercial });
beforeEach(() => { localStorage.clear(); Object.values(m).forEach(f => f.mockReset()); m.lerPagamentoOSV3.mockResolvedValue(leitura); });
afterEach(cleanup);

describe("R8 · V3 montada com hook real", () => {
  it.each([["APROVACAO_COMERCIAL_PENDENTE", "comercial"], ["ORCAMENTO_RECUSADO", "comercial"], ["ORCAMENTO_EXPIRADO", "comercial"], ["PRECO_AUSENTE", "comercial"], ["VALORES_DIVERGENTES", "financeiro"]])("%s: motivo e navegação preservados sobre leitura local aprovada", async (codigo, destino) => {
    m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i, { codigo, destino })); const r = await montar(); enviar();
    const aviso = await screen.findByTestId("recusa-comercial"); expect(aviso.textContent).toContain("Motivo original devolvido pelo servidor"); expect(screen.queryByTestId("pendencia-recebimento")).toBeNull();
    expect((screen.getByRole("button", { name: /^Receber · / }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: destino === "comercial" ? /Abrir o orçamento no prontuário/ : /conferir a cobrança/ }));
    expect(r.c.openOS).toHaveBeenCalledWith(A.id); expect(m.receberOSV3).toHaveBeenCalledTimes(1); expect(m.registrarRecebimentoMistoOSV3).not.toHaveBeenCalled(); expect(screen.queryByTestId("recusa-comercial")).toBeNull();
  });
  it("A→B→A: resposta tardia não apaga rascunho nem publica motivo de visita anterior", async () => {
    let resolver!: (r: unknown) => void; m.receberOSV3.mockReturnValue(new Promise(r => { resolver = r; })); const r = await montar(); enviar();
    r.rerender(tela(contexto("os-b"))); await screen.findByRole("heading", { name: /^OS-B · / }); r.rerender(tela(contexto())); await screen.findByRole("heading", { name: /^OS-A · / });
    await act(async () => resolver(negativo(m.receberOSV3.mock.calls[0]![2], { codigo: "PRECO_AUSENTE", destino: "comercial" })));
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect(document.body.textContent).not.toContain("Motivo original devolvido pelo servidor"); expect(m.receberOSV3).toHaveBeenCalledTimes(1);
  });
  it("incerteza posterior remove orientação comercial e mantém verificação da mesma confirmação", async () => {
    m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i, { codigo: "PRECO_AUSENTE", destino: "comercial" })); await montar(); enviar(); await screen.findByTestId("recusa-comercial");
    m.receberOSV3.mockRejectedValue(new Error("Connection closed.")); enviar(); await screen.findByTestId("pendencia-recebimento");
    expect(screen.queryByTestId("recusa-comercial")).toBeNull(); expect(screen.queryByRole("button", { name: /Abrir o orçamento no prontuário/ })).toBeNull(); expect(m.receberOSV3.mock.calls[1]![2].operacaoId).not.toBe(m.receberOSV3.mock.calls[0]![2].operacaoId);
  });
  it("remontar a tela não restaura motivo de recusa anterior", async () => {
    m.receberOSV3.mockImplementation(async (_s, _o, i) => negativo(i, { codigo: "PRECO_AUSENTE", destino: "comercial" })); const r = await montar(); enviar(); await screen.findByTestId("recusa-comercial"); r.unmount(); await montar(); expect(screen.queryByTestId("recusa-comercial")).toBeNull();
  });
});
