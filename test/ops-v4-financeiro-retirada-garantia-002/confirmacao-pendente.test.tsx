import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ ler: vi.fn(), receber: vi.fn(), misto: vi.fn(), estornar: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  lerPagamentoOSV3: m.ler, receberOSV3: m.receber,
  registrarRecebimentoMistoOSV3: m.misto, estornarRecebimentoOSV3: m.estornar,
}));
import { usePdvServicoV3 } from "@/components/operacoes-v3/hooks/use-pdv-servico-v3";

const leitura = { total: 420, recebido: 0, saldo: 420, status: "aberto", sessao: { aberta: true, sessaoId: "sessao-original" }, aPrazo: null };
const imediato = { linhas: [{ forma: "pix" as const, valor: 100 }], sessaoId: "sessao-original", saldoEsperado: 420, intencao: "parcial" as const, observacao: "Confirmação original" };
const misto = { pagamentosAgora: [{ forma: "pix" as const, valor: 100 }], saldoAPrazo: { valor: 320, vencimento: "2099-10-30", observacao: "Prazo original" }, sessaoId: "sessao-original", saldoEsperado: 420, intencao: "parcial" as const };
const resultado = { os: {}, pagamento: { ...leitura, recebido: 100, saldo: 320 }, recibo: { osId: "os-a", valorPago: 100 }, valorRecebido: 100, op: "parcial" };

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(m)) fn.mockReset();
  m.ler.mockResolvedValue(leitura);
});
afterEach(cleanup);
async function montar(storeId = "loja-a", osId = "os-a") {
  const r = renderHook(() => usePdvServicoV3(storeId, osId));
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}
function adiado<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

describe("R7 · P1-A: erro nunca comprova ausência da confirmação", () => {
  it.each([
    ["Connection closed. sem digest", () => new Error("Connection closed.")],
    ["timeout", () => Object.assign(new Error("Timeout antes da resposta"), { name: "TimeoutError" })],
    ["digest", () => Object.assign(new Error("Server Components render"), { digest: "123" })],
    ["permissão anterior ao replay", () => new Error("Sem permissão para receber esta OS.")],
  ])("mantém identidade e conteúdo após %s", async (_nome, erro) => {
    const r = await montar();
    m.receber.mockRejectedValueOnce(erro());
    await act(async () => { expect(await r.result.current.receber(imediato)).toBe(false); });
    const original = m.receber.mock.calls[0]![2];
    expect(r.result.current.pendenciaReceber).toMatchObject({ operacaoId: original.operacaoId, input: original });
  });

  it("permissão alterada no reenvio não libera confirmação antiga", async () => {
    const r = await montar();
    m.receber.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => { await r.result.current.receber(imediato); });
    const original = m.receber.mock.calls[0]![2];
    m.receber.mockRejectedValueOnce(new Error("Sem permissão."));
    await act(async () => { await r.result.current.receber(original); });
    expect(r.result.current.pendenciaReceber).toMatchObject({ input: original });
  });

  it("remount/refresh conserva a confirmação inteira antes de qualquer novo envio", async () => {
    const r = await montar();
    m.receber.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => { await r.result.current.receber(imediato); });
    const original = m.receber.mock.calls[0]![2];
    r.unmount();
    const novo = await montar();
    expect(novo.result.current.pendenciaReceber).toMatchObject({ input: original });
    await act(async () => { await novo.result.current.registrarMisto(misto); });
    expect(m.misto).not.toHaveBeenCalled();
  });

  it("alteração de forma/valor/sessão não dispara outra operação enquanto incerta", async () => {
    const r = await montar();
    m.receber.mockRejectedValue(new Error("Connection closed."));
    await act(async () => { await r.result.current.receber(imediato); });
    await act(async () => { await r.result.current.receber({ ...imediato, linhas: [{ forma: "dinheiro", valor: 50 }], sessaoId: "outra-sessao", saldoEsperado: 320 }); });
    expect(m.receber).toHaveBeenCalledTimes(1);
  });
});

describe("R7 · P1-B: pendência exclusiva entre imediato e misto", () => {
  it("imediato gravado/resposta perdida bloqueia misto em outra chave", async () => {
    const r = await montar();
    m.receber.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => { await r.result.current.receber(imediato); });
    m.misto.mockResolvedValue({ ok: true, pagamento: resultado.pagamento, recibo: resultado.recibo });
    await act(async () => { await r.result.current.registrarMisto({ ...misto, saldoEsperado: 320, saldoAPrazo: { ...misto.saldoAPrazo, valor: 220 } }); });
    expect(m.misto).not.toHaveBeenCalled();
    expect(r.result.current.pendenciaReceber).not.toBeNull();
  });

  it("misto incerto bloqueia imediato", async () => {
    const r = await montar();
    m.misto.mockRejectedValueOnce(new Error("Connection closed."));
    await act(async () => { await r.result.current.registrarMisto(misto); });
    m.receber.mockResolvedValue(resultado);
    await act(async () => { await r.result.current.receber(imediato); });
    expect(m.receber).not.toHaveBeenCalled();
    expect(r.result.current.pendenciaMisto).not.toBeNull();
  });

  it("misto sem permissão/sem conferência fica incerto mesmo na primeira chamada", async () => {
    const r = await montar();
    m.misto.mockResolvedValue({ ok: false, code: "sem_permissao", mensagem: "Sem permissão." });
    await act(async () => { await r.result.current.registrarMisto(misto); });
    expect(r.result.current.pendenciaMisto).toMatchObject({ input: expect.objectContaining(misto) });
    await act(async () => { await r.result.current.receber(imediato); });
    expect(m.receber).not.toHaveBeenCalled();
  });

  it("duas instâncias da mesma OS compartilham o bloqueio durante o primeiro await", async () => {
    const a = await montar();
    const b = await montar();
    const controle = adiado<typeof resultado>();
    m.receber.mockReturnValue(controle.promessa);
    let p!: Promise<boolean>;
    act(() => { p = a.result.current.receber(imediato); });
    await act(async () => { await b.result.current.registrarMisto(misto); });
    expect(m.misto).not.toHaveBeenCalled();
    await act(async () => { controle.resolver(resultado); await p; });
  });
});


describe("R7 · reconciliação, isolamento e persistência", () => {
  it("resultado estruturado INCERTO não libera a identidade", async () => {
    const r = await montar();
    m.receber.mockImplementation(async (_s, _o, i) => ({ estado: "INCERTO", operacaoId: i.operacaoId, mensagem: "Conferência autorizada necessária." }));
    await act(async () => { await r.result.current.receber(imediato); });
    expect(r.result.current.pendenciaReceber?.input).toEqual(m.receber.mock.calls[0]![2]);
  });
  it("recusa terminal da mesma identidade libera NOVA confirmação", async () => {
    const r = await montar();
    m.receber.mockImplementationOnce(async (_s, _o, i) => ({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: i.operacaoId, requestFingerprint: "recusa-cercada", mensagem: "Saldo alterado." }));
    await act(async () => { await r.result.current.receber(imediato); });
    expect(r.result.current.pendenciaReceber).toBeNull();
    m.receber.mockResolvedValue(resultado);
    await act(async () => { expect(await r.result.current.receber({ ...imediato, linhas: [{ forma: "dinheiro", valor: 50 }] })).toBe(true); });
    expect(m.receber.mock.calls[1]![2].operacaoId).not.toBe(m.receber.mock.calls[0]![2].operacaoId);
  });
  it("recusa terminal de OUTRA identidade não apaga a pendência", async () => {
    const r = await montar();
    m.receber.mockResolvedValue({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: "outra-identidade", requestFingerprint: "recusa", mensagem: "Recusa alheia." });
    await act(async () => { await r.result.current.receber(imediato); });
    expect(r.result.current.pendenciaReceber).not.toBeNull();
  });
  it("positivo exige reconhecimento autenticado; falha antes do reconhecimento mantém a pendência", async () => {
    const r = await montar();
    m.receber.mockImplementation(async (_s, _o, i) => ({ estado: "CONFIRMADO", resultado, prova: { operacaoId: i.operacaoId, requestFingerprint: "hash-original", tipo: "imediato" } }));
    m.ler.mockImplementation(async (_s, _o, prova) => { if (prova) throw new Error("Permissão alterada."); return leitura; });
    await act(async () => { expect(await r.result.current.receber(imediato)).toBe(false); });
    const original = m.receber.mock.calls[0]![2];
    expect(r.result.current.pendenciaReceber?.input).toEqual(original);
    m.ler.mockResolvedValue(leitura);
    await act(async () => { expect(await r.result.current.verificarConfirmacao!()).toBe(true); });
    expect(m.receber.mock.calls[1]![2]).toEqual(original);
    expect(m.ler).toHaveBeenCalledWith("loja-a", "os-a", { operacaoId: original.operacaoId, requestFingerprint: "hash-original", tipo: "imediato" });
    expect(r.result.current.pendenciaReceber).toBeNull();
  });
  it.each(["valor", "sessão", "vencimento"])("misto incerto não aceita outro %s", async (campo) => {
    const r = await montar(); m.misto.mockRejectedValue(new Error("Connection closed."));
    await act(async () => { await r.result.current.registrarMisto(misto); });
    const mudado = campo === "valor" ? { ...misto, pagamentosAgora: [{ forma: "pix" as const, valor: 50 }], saldoAPrazo: { ...misto.saldoAPrazo, valor: 370 } } : campo === "sessão" ? { ...misto, sessaoId: "outra-sessao" } : { ...misto, saldoAPrazo: { ...misto.saldoAPrazo, vencimento: "2099-11-30" } };
    await act(async () => { await r.result.current.registrarMisto(mudado); });
    expect(m.misto).toHaveBeenCalledTimes(1);
  });
  it.each(["os", "loja"])("resposta tardia não altera a outra %s e a confirmação de origem sobrevive", async (campo) => {
    const r = renderHook(({ s, o }) => usePdvServicoV3(s, o), { initialProps: { s: "loja-a", o: "os-a" } });
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    const c = adiado<unknown>(); m.receber.mockReturnValue(c.promessa);
    let promessa!: Promise<boolean>;
    act(() => { promessa = r.result.current.receber(imediato); });
    r.rerender({ s: campo === "loja" ? "loja-b" : "loja-a", o: campo === "os" ? "os-b" : "os-a" });
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    await act(async () => { c.resolver({ estado: "INCERTO", operacaoId: m.receber.mock.calls[0]![2].operacaoId }); await promessa; });
    expect(r.result.current.ultimoRecibo).toBeNull(); expect(r.result.current.pendenciaReceber).toBeNull();
    r.rerender({ s: "loja-a", o: "os-a" });
    await waitFor(() => expect(r.result.current.pendenciaReceber).not.toBeNull());
  });
  it("duplo clique imediato envia UMA vez antes de qualquer await", async () => {
    const r = await montar(), c = adiado<typeof resultado>(); m.receber.mockReturnValue(c.promessa);
    let a!: Promise<boolean>, b!: Promise<boolean>;
    act(() => { a = r.result.current.receber(imediato); b = r.result.current.receber(imediato); });
    expect(await b).toBe(false); expect(m.receber).toHaveBeenCalledTimes(1);
    await act(async () => { c.resolver(resultado); await a; });
  });
  it("releitura vazia de pendência não comprova ausência de uma operação em processamento", async () => {
    const r = await montar(); m.receber.mockRejectedValue(new Error("Timeout"));
    await act(async () => { await r.result.current.receber(imediato); });
    const original = r.result.current.pendenciaReceber;
    act(() => r.result.current.reload());
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    expect(r.result.current.pendenciaReceber).toEqual(original);
    await act(async () => { expect(await r.result.current.estornar({ sessaoId: "sessao-original" })).toBe(false); });
    expect(m.estornar).not.toHaveBeenCalled();
  });
  it("outra aba informa a pendência e bloqueia a modalidade alternativa", async () => {
    const r = await montar();
    const input = { ...imediato, operacaoId: "op-outra-aba-original", confirmacaoClienteV3: true };
    act(() => {
      localStorage.setItem('omni:confirmacao-financeira:v1:["loja-a","os-a"]', JSON.stringify({ versao: 1, key: JSON.stringify(["loja-a", "os-a"]), storeId: "loja-a", osId: "os-a", operacaoId: input.operacaoId, tipo: "imediato", input }));
      window.dispatchEvent(new Event("storage"));
    });
    expect(r.result.current.pendenciaReceber?.input).toEqual(input);
    await act(async () => { await r.result.current.registrarMisto(misto); });
    expect(m.misto).not.toHaveBeenCalled();
  });
  it("metadado local ilegível bloqueia; não inventa uma identidade substituta", async () => {
    localStorage.setItem('omni:confirmacao-financeira:v1:["loja-a","os-a"]', '{incompleto');
    const r = await montar();
    await act(async () => { await r.result.current.receber(imediato); await r.result.current.registrarMisto(misto); });
    expect(m.receber).not.toHaveBeenCalled(); expect(m.misto).not.toHaveBeenCalled(); expect(r.result.current.confirmacaoBloqueada).toBe(true);
  });
  it("refresh sem metadado local recupera a pendência autoritativa da OS", async () => {
    const input = { ...imediato, operacaoId: "op-servidor-original", confirmacaoClienteV3: true };
    const pendencia = { versao: 1, key: JSON.stringify(["loja-a", "os-a"]), storeId: "loja-a", osId: "os-a", operacaoId: input.operacaoId, tipo: "imediato", input, requestFingerprint: "hash" };
    m.ler.mockResolvedValue({ ...leitura, pendenciaConfirmacao: pendencia });
    const r = await montar();
    expect(r.result.current.pendenciaReceber?.input).toEqual(input);
    m.receber.mockResolvedValue(resultado);
    await act(async () => { expect(await r.result.current.verificarConfirmacao!()).toBe(true); });
    expect(m.receber.mock.calls[0]![2]).toEqual(input);
  });
});


it("R7 · mesmo valor por forma em outra representação ainda reenvia o input ORIGINAL", async () => {
 const r = await montar(); m.receber.mockRejectedValueOnce(new Error("Connection closed."));
 await act(async () => { await r.result.current.receber(imediato); });
 const original = m.receber.mock.calls[0]![2]; m.receber.mockResolvedValue(resultado);
 await act(async () => { expect(await r.result.current.receber({ ...imediato, linhas: [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }] })).toBe(true); });
 expect(m.receber.mock.calls[1]![2]).toEqual(original);
});
