import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
const m = vi.hoisted(() => ({ ler: vi.fn(), receber: vi.fn(), misto: vi.fn(), estornar: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({ lerPagamentoOSV3: m.ler, receberOSV3: m.receber, registrarRecebimentoMistoOSV3: m.misto, estornarRecebimentoOSV3: m.estornar }));
import { usePdvServicoV3 } from "@/components/operacoes-v3/hooks/use-pdv-servico-v3";
const leitura = { total: 420, recebido: 0, saldo: 420, status: "aberto", sessao: { aberta: true, sessaoId: "caixa" }, aPrazo: null };
const input = { linhas: [{ forma: "pix" as const, valor: 100 }], sessaoId: "caixa", saldoEsperado: 420 };
const motivo = { codigo: "VALORES_DIVERGENTES", destino: "financeiro" };
const terminal = (i: { operacaoId: string }, comercial: unknown = motivo) => ({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: i.operacaoId, requestFingerprint: "prova-duravel", mensagem: "Recusa comercial original", comercial });
const positivo = { os: {}, pagamento: { ...leitura, recebido: 100, saldo: 320 }, recibo: { osId: "os-a", valorPago: 100 } };
beforeEach(() => { localStorage.clear(); Object.values(m).forEach(f => f.mockReset()); m.ler.mockResolvedValue(leitura); m.receber.mockImplementation(async (_s, _o, i) => terminal(i)); });
afterEach(cleanup);
async function montar() { const r = renderHook(({ s, o }) => usePdvServicoV3(s, o), { initialProps: { s: "loja-a", o: "os-a" } }); await waitFor(() => expect(r.result.current.loading).toBe(false)); return r; }
function adiado<T>() { let resolver!: (v: T) => void; const promessa = new Promise<T>(r => { resolver = r; }); return { promessa, resolver }; }
describe("R8 · hook vincula motivo à recusa e ao contexto", () => {
  it.each([
    ["APROVACAO_COMERCIAL_PENDENTE", "comercial"], ["ORCAMENTO_RECUSADO", "comercial"], ["ORCAMENTO_EXPIRADO", "comercial"], ["PRECO_AUSENTE", "comercial"], ["VALORES_DIVERGENTES", "financeiro"],
  ])("%s → %s preservado, sem manter pendência financeira", async (codigo, destino) => {
    const r = await montar(); m.receber.mockImplementation(async (_s, _o, i) => terminal(i, { codigo, destino }));
    await act(async () => { expect(await r.result.current.receber(input)).toBe(false); });
    expect(r.result.current.recusaComercial).toEqual({ codigo, destino }); expect(r.result.current.error).toBe("Recusa comercial original"); expect(r.result.current.pendenciaReceber).toBeNull();
  });
  it.each([null, undefined, [], "comercial", { codigo: "constructor", destino: "comercial" }, { codigo: "PRECO_AUSENTE", destino: "https://externo.invalid" }, { codigo: "VALORES_DIVERGENTES", destino: "comercial" }, Object.create(motivo), Object.assign(Object.create({ codigo: "PRECO_AUSENTE" }), { destino: "comercial" })])("metadado ausente/inválido %# não muda prova nem fabrica destino", async comercial => {
    const r = await montar(); m.receber.mockImplementation(async (_s, _o, i) => ({ ...terminal(i, null), comercial }));
    await act(async () => { await r.result.current.receber(input); });
    expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaReceber).toBeNull(); expect(r.result.current.error).toBe("Recusa comercial original");
  });
  it("metadado não transforma INCERTO em terminal", async () => {
    const r = await montar(); m.receber.mockImplementation(async (_s, _o, i) => ({ ...terminal(i), estado: "INCERTO" }));
    await act(async () => { await r.result.current.receber(input); }); expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaReceber).not.toBeNull();
  });
  it("recusa de outra identidade não publica motivo nem libera a confirmação", async () => {
    const r = await montar(); m.receber.mockResolvedValue(terminal({ operacaoId: "outra-identidade" })); await act(async () => { await r.result.current.receber(input); });
    expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaReceber).not.toBeNull();
  });
  it.each(["os", "loja", "A-B-A"])("resposta tardia em %s não reaparece como recusa atual", async campo => {
    const r = await montar(), c = adiado<unknown>(); m.receber.mockReturnValue(c.promessa); let p!: Promise<boolean>;
    act(() => { p = r.result.current.receber(input); });
    r.rerender({ s: campo === "loja" ? "loja-b" : "loja-a", o: campo === "loja" ? "os-a" : "os-b" });
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    if (campo === "A-B-A") { r.rerender({ s: "loja-a", o: "os-a" }); await waitFor(() => expect(r.result.current.loading).toBe(false)); }
    await act(async () => { c.resolver(terminal(m.receber.mock.calls[0]![2])); await p; });
    expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.error).toBeNull();
  });
  it.each(["sucesso", "recusa não comercial", "Connection closed.", "reload"])("%s posterior limpa o motivo anterior", async caso => {
    const r = await montar(); await act(async () => { await r.result.current.receber(input); }); expect(r.result.current.recusaComercial).toEqual(motivo);
    if (caso === "reload") { act(() => r.result.current.reload()); await waitFor(() => expect(r.result.current.loading).toBe(false)); }
    else {
      if (caso === "sucesso") m.receber.mockResolvedValue(positivo);
      else if (caso === "Connection closed.") m.receber.mockRejectedValue(new Error(caso));
      else m.receber.mockImplementation(async (_s, _o, i) => terminal(i, null));
      await act(async () => { await r.result.current.receber(input); });
      expect(m.receber.mock.calls[1]![2].operacaoId).not.toBe(m.receber.mock.calls[0]![2].operacaoId);
      if (caso === "Connection closed.") expect(r.result.current.pendenciaReceber).not.toBeNull();
    }
    expect(r.result.current.recusaComercial ?? null).toBeNull();
  });
  it("outra instância no mesmo alvo invalida o motivo da confirmação anterior", async () => {
    const a = await montar(), b = await montar(); await act(async () => { await a.result.current.receber(input); }); expect(a.result.current.recusaComercial).toEqual(motivo);
    const c = adiado<unknown>(); m.receber.mockReturnValue(c.promessa); let p!: Promise<boolean>;
    act(() => { p = b.result.current.receber(input); });
    try { await waitFor(() => expect(a.result.current.recusaComercial ?? null).toBeNull()); }
    finally { await act(async () => { c.resolver(terminal(m.receber.mock.calls[1]![2], null)); await p; }); }
    expect(a.result.current.recusaComercial ?? null).toBeNull(); expect(a.result.current.error).toBeNull(); expect(a.result.current.pendenciaReceber).toBeNull();
  });

});


const inputMisto = { sessaoId: "caixa", pagamentosAgora: [{ forma: "pix" as const, valor: 100 }], saldoAPrazo: { valor: 320, vencimento: "2099-12-31" }, saldoEsperado: 420 };
const terminalMisto = (comercial: unknown = motivo) => ({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: "Recusa mista original", comercial });
describe("N2 · orientação da recusa mista usa a prova terminal e a visita atual", () => {
  it.each([["APROVACAO_COMERCIAL_PENDENTE", "comercial"], ["ORCAMENTO_RECUSADO", "comercial"], ["ORCAMENTO_EXPIRADO", "comercial"], ["PRECO_AUSENTE", "comercial"], ["VALORES_DIVERGENTES", "financeiro"]])("%s → %s é preservado sem pendência financeira", async (codigo, destino) => {
    const r = await montar(); m.misto.mockResolvedValue(terminalMisto({ codigo, destino }));
    await act(async () => { expect(await r.result.current.registrarMisto(inputMisto)).toMatchObject({ status: "recusado", code: "comercial_nao_elegivel" }); });
    expect(r.result.current.recusaComercial).toEqual({ codigo, destino }); expect(r.result.current.error).toBe("Recusa mista original");
    expect(r.result.current.pendenciaMisto).toBeNull(); expect(r.result.current.confirmacaoBloqueada).toBe(false); expect(localStorage.length).toBe(0);
    expect(m.receber).not.toHaveBeenCalled(); expect(m.estornar).not.toHaveBeenCalled();
  });
  it.each([null, undefined, [], "comercial", { codigo: "constructor", destino: "comercial" }, { codigo: "PRECO_AUSENTE", destino: "https://externo.invalid" }, { codigo: "VALORES_DIVERGENTES", destino: "comercial" }, Object.create(motivo)])("metadado misto inválido %# mantém a recusa sem fabricar destino", async comercial => {
    const r = await montar(); m.misto.mockResolvedValue({ ...terminalMisto(), comercial });
    await act(async () => { await r.result.current.registrarMisto(inputMisto); });
    expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.error).toBe("Recusa mista original"); expect(r.result.current.pendenciaMisto).toBeNull();
  });
  it("campo comercial herdado da resposta não publica destino", async () => {
    const r = await montar(); const res = { ...terminalMisto() }; delete (res as { comercial?: unknown }).comercial; Object.setPrototypeOf(res, { comercial: motivo }); m.misto.mockResolvedValue(res);
    await act(async () => { await r.result.current.registrarMisto(inputMisto); }); expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaMisto).toBeNull();
  });
  it("metadado não transforma recusa sem naoRegistrada em terminal", async () => {
    const r = await montar(); m.misto.mockResolvedValue({ ...terminalMisto(), naoRegistrada: undefined });
    await act(async () => { expect(await r.result.current.registrarMisto(inputMisto)).toMatchObject({ status: "incerto" }); });
    expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaMisto).not.toBeNull(); expect(r.result.current.confirmacaoBloqueada).toBe(true);
  });
  it("recusa não comercial não adota metadado comercial", async () => {
    const r = await montar(); m.misto.mockResolvedValue({ ...terminalMisto(), code: "caixa_fechado" });
    await act(async () => { await r.result.current.registrarMisto(inputMisto); }); expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.pendenciaMisto).toBeNull();
  });
  it.each(["os", "loja", "A-B-A"])("resposta mista tardia em %s não publica motivo de outra visita", async campo => {
    const r = await montar(), c = adiado<unknown>(); m.misto.mockReturnValue(c.promessa); let p!: ReturnType<typeof r.result.current.registrarMisto>;
    act(() => { p = r.result.current.registrarMisto(inputMisto); });
    r.rerender({ s: campo === "loja" ? "loja-b" : "loja-a", o: campo === "loja" ? "os-a" : "os-b" }); await waitFor(() => expect(r.result.current.loading).toBe(false));
    if (campo === "A-B-A") { r.rerender({ s: "loja-a", o: "os-a" }); await waitFor(() => expect(r.result.current.loading).toBe(false)); }
    await act(async () => { c.resolver(terminalMisto()); await p; }); expect(r.result.current.recusaComercial ?? null).toBeNull(); expect(r.result.current.error).toBeNull();
  });
  it.each(["sucesso", "recusa não comercial", "incerto", "reload", "remontar"])("%s posterior limpa a orientação mista anterior", async caso => {
    const r = await montar(); m.misto.mockResolvedValue(terminalMisto()); await act(async () => { await r.result.current.registrarMisto(inputMisto); }); expect(r.result.current.recusaComercial).toEqual(motivo);
    if (caso === "reload") { act(() => r.result.current.reload()); await waitFor(() => expect(r.result.current.loading).toBe(false)); }
    else if (caso === "remontar") { r.unmount(); const novo = await montar(); expect(novo.result.current.recusaComercial ?? null).toBeNull(); return; }
    else {
      if (caso === "sucesso") m.misto.mockResolvedValue({ ok: true, ...positivo });
      else if (caso === "incerto") m.misto.mockRejectedValue(new Error("Connection closed."));
      else m.misto.mockResolvedValue({ ...terminalMisto(null), code: "caixa_fechado" });
      await act(async () => { await r.result.current.registrarMisto(inputMisto); }); expect(m.misto.mock.calls[1]![2].operacaoId).not.toBe(m.misto.mock.calls[0]![2].operacaoId);
      if (caso === "incerto") expect(r.result.current.pendenciaMisto).not.toBeNull();
    }
    expect(r.result.current.recusaComercial ?? null).toBeNull();
  });
  it("outra instância iniciando confirmação invalida a orientação mista", async () => {
    const a = await montar(), b = await montar(); m.misto.mockResolvedValue(terminalMisto()); await act(async () => { await a.result.current.registrarMisto(inputMisto); }); expect(a.result.current.recusaComercial).toEqual(motivo);
    const c = adiado<unknown>(); m.misto.mockReturnValue(c.promessa); let p!: ReturnType<typeof b.result.current.registrarMisto>;
    act(() => { p = b.result.current.registrarMisto(inputMisto); });
    try { await waitFor(() => expect(a.result.current.recusaComercial ?? null).toBeNull()); }
    finally { await act(async () => { c.resolver(terminalMisto(null)); await p; }); }
    expect(a.result.current.error).toBeNull(); expect(a.result.current.pendenciaMisto).toBeNull();
  });
});
