"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estornarRecebimentoOSV3, lerPagamentoOSV3, receberOSV3, registrarRecebimentoMistoOSV3,
  type CaixaSessaoV3, type EstornarRecebimentoInputV3, type ReceberOSInputV3,
  type RegistrarRecebimentoMistoInputV3, type RegistrarRecebimentoMistoResultV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { aPrazoVisivelV3, type APrazoV3, type ComprovanteReciboV3, type PagamentoV3 } from "@/lib/operacoes-v3/payment-model";
import {
  conteudoConfirmacaoImediataV3, conteudoConfirmacaoMistaV3, gerarOperacaoIdV3,
  lerPendenciaConfirmacaoV3, MENSAGEM_CONFIRMACAO_PENDENTE_V3,
  type PendenciaConfirmacaoFinanceiraV3, type ProvaConfirmacaoFinanceiraV3,
} from "@/lib/operacoes-v3/recebimento-misto-model";

export interface PdvServicoState {
  pagamento: PagamentoV3 | null; sessao: CaixaSessaoV3 | null; loading: boolean;
  recebendo: boolean; estornando: boolean; error: string | null;
  ultimoRecibo: ComprovanteReciboV3 | null; reload: () => void;
  receber: (input: ReceberOSInputV3) => Promise<boolean>;
  estornar: (input: EstornarRecebimentoInputV3) => Promise<boolean>; limparRecibo: () => void;
}
export type DadosRecebimentoMistoV3 = Omit<RegistrarRecebimentoMistoInputV3, "operacaoId">;
export interface PendenciaRecebimentoMistoV3 { key: string; operacaoId: string; input: RegistrarRecebimentoMistoInputV3; }
export interface PendenciaRecebimentoV3 { key: string; operacaoId: string; input: ReceberOSInputV3; }
export type RegistroMistoResultadoUIV3 =
  | { status: "ok"; resultado: Extract<RegistrarRecebimentoMistoResultV3, { ok: true }> }
  | { status: "recusado"; code: string; mensagem: string; saldoAtual?: number }
  | { status: "incerto"; mensagem: string } | { status: "em_andamento" };
export interface PdvServicoV3Completo extends PdvServicoState {
  aPrazo: APrazoV3 | null; registrandoMisto: boolean;
  pendenciaMisto: PendenciaRecebimentoMistoV3 | null;
  pendenciaReceber?: PendenciaRecebimentoV3 | null;
  pendenciaConfirmacao?: PendenciaConfirmacaoFinanceiraV3 | null;
  confirmacaoBloqueada?: boolean;
  verificarConfirmacao?: () => Promise<boolean>;
  registrarMisto: (dados: DadosRecebimentoMistoV3) => Promise<RegistroMistoResultadoUIV3>;
}

export function projetarLeituraAtualPdvServicoV3(input: {
  targetKey: string | null;
  loadedKey: string | null;
  errorKey: string | null;
  pagamento: PagamentoV3 | null;
  sessao: CaixaSessaoV3 | null;
  loading: boolean;
  error: string | null;
}): Pick<PdvServicoState, "pagamento" | "sessao" | "loading" | "error"> {
  const carregadoParaAlvo = input.targetKey !== null && input.loadedKey === input.targetKey;
  const erroDoAlvo = input.targetKey !== null && input.errorKey === input.targetKey ? input.error : null;
  const carregandoAlvo = input.targetKey !== null && (input.loading || (!carregadoParaAlvo && input.errorKey !== input.targetKey));
  return {
    pagamento: carregadoParaAlvo ? input.pagamento : null,
    sessao: carregadoParaAlvo ? input.sessao : null,
    loading: carregandoAlvo,
    error: erroDoAlvo,
  };
}

/** Uma exceção nunca constitui prova negativa, independentemente de mensagem ou digest. */
export function recebimentoSemRespostaV3(_e: unknown): boolean { return true; }

const PREFIXO = "omni:confirmacao-financeira:v1:";
const EVENTO = "omni:confirmacao-financeira";
// Exclusão síncrona entre instâncias no mesmo documento. Entre abas/sessões, o fence
// persistido na MESMA transação financeira e a consultiva por OS são a autoridade.
const emVoo = new Set<string>();
function lerLocal(storeId: string, osId: string): { pendencia: PendenciaConfirmacaoFinanceiraV3 | null; bloqueada: boolean } {
  try {
    const raw = window.localStorage.getItem(PREFIXO + JSON.stringify([storeId, osId]));
    const pendencia = raw ? lerPendenciaConfirmacaoV3(JSON.parse(raw), storeId, osId) : null;
    return { pendencia, bloqueada: raw !== null && !pendencia };
  } catch { return { pendencia: null, bloqueada: true }; }
}
function persistir(p: PendenciaConfirmacaoFinanceiraV3): void {
  // Antes de enviar: o refresh não pode transformar incerteza em operação nova.
  window.localStorage.setItem(PREFIXO + p.key, JSON.stringify(p));
  window.dispatchEvent(new Event(EVENTO));
}
function remover(p: PendenciaConfirmacaoFinanceiraV3): void {
  if (lerLocal(p.storeId, p.osId).pendencia?.operacaoId !== p.operacaoId) return;
  window.localStorage.removeItem(PREFIXO + p.key);
  window.dispatchEvent(new Event(EVENTO));
}
function mesmoConteudo(a: PendenciaConfirmacaoFinanceiraV3, b: PendenciaConfirmacaoFinanceiraV3): boolean {
  if (a.key !== b.key || a.tipo !== b.tipo || a.operacaoId !== b.operacaoId) return false;
  return a.tipo === "imediato" && b.tipo === "imediato"
    ? conteudoConfirmacaoImediataV3(a.input) === conteudoConfirmacaoImediataV3(b.input)
    : a.tipo === "misto" && b.tipo === "misto" && conteudoConfirmacaoMistaV3(a.input) === conteudoConfirmacaoMistaV3(b.input);
}

export function usePdvServicoV3(storeId: string | null, osId: string | null): PdvServicoV3Completo {
  const sid = (storeId ?? "").trim(), id = (osId ?? "").trim();
  const targetKey = sid && id ? JSON.stringify([sid, id]) : null;
  const [pagamento, setPagamento] = useState<PagamentoV3 | null>(null);
  const [sessao, setSessao] = useState<CaixaSessaoV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [recebendo, setRecebendo] = useState(false), [registrandoMisto, setRegistrandoMisto] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [error, setError] = useState<string | null>(null), [errorKey, setErrorKey] = useState<string | null>(null);
  const [ultimoRecibo, setUltimoRecibo] = useState<ComprovanteReciboV3 | null>(null), [reciboKey, setReciboKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null), [nonce, setNonce] = useState(0);
  const [aPrazo, setAPrazo] = useState<APrazoV3 | null>(null);
  const [pendencias, setPendencias] = useState<Record<string, PendenciaConfirmacaoFinanceiraV3>>({});
  const [bloqueios, setBloqueios] = useState<Record<string, boolean>>({});
  const reqRef = useRef(0), activeKeyRef = useRef(targetKey);
  activeKeyRef.current = targetKey;
  const saldoVistoRef = useRef<{ key: string; saldo: number } | null>(null);
  saldoVistoRef.current = loadedKey && pagamento ? { key: loadedKey, saldo: pagamento.saldo } : null;
  const sincronizar = useCallback((s: string, o: string) => {
    const key = JSON.stringify([s, o]), local = lerLocal(s, o);
    setPendencias((prev) => { const next = { ...prev }; if (local.pendencia) next[key] = local.pendencia; else delete next[key]; return next; });
    if (local.bloqueada) setBloqueios((prev) => ({ ...prev, [key]: true }));
  }, []);
  const erro = useCallback((key: string, mensagem = MENSAGEM_CONFIRMACAO_PENDENTE_V3) => {
    if (activeKeyRef.current === key) { setErrorKey(key); setError(mensagem); }
  }, []);
  const assimilar = useCallback((s: string, o: string, res: Awaited<ReturnType<typeof lerPagamentoOSV3>>) => {
    const key = JSON.stringify([s, o]);
    if (res.pendenciaConfirmacao) persistir(res.pendenciaConfirmacao);
    setBloqueios((prev) => ({ ...prev, [key]: !!res.confirmacaoBloqueada || lerLocal(s, o).bloqueada }));
    sincronizar(s, o);
    if (activeKeyRef.current !== key) return;
    const { sessao: caixa, aPrazo: ap, pendenciaConfirmacao: _p, confirmacaoBloqueada: _b, ...pag } = res;
    setPagamento(pag); setSessao(caixa); setAPrazo(ap ?? null); setLoadedKey(key);
  }, [sincronizar]);

  useEffect(() => {
    if (!sid || !id) return;
    const sync = () => sincronizar(sid, id);
    sync(); window.addEventListener(EVENTO, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENTO, sync); window.removeEventListener("storage", sync); };
  }, [sid, id, sincronizar]);
  useEffect(() => {
    const req = ++reqRef.current;
    setPagamento(null); setSessao(null); setAPrazo(null); setLoadedKey(null); setErrorKey(null); setError(null);
    if (!sid || !id) { setLoading(false); return; }
    setLoading(true);
    lerPagamentoOSV3(sid, id).then((res) => {
      if (req !== reqRef.current || activeKeyRef.current !== targetKey) return;
      assimilar(sid, id, res); setLoading(false);
    }).catch((e) => {
      if (req !== reqRef.current || activeKeyRef.current !== targetKey) return;
      erro(targetKey!, e instanceof Error ? e.message : "Falha ao carregar o pagamento da OS."); setLoading(false);
    });
  }, [sid, id, targetKey, nonce, assimilar, erro]);

  const enviar = useCallback(async (solicitada: PendenciaConfirmacaoFinanceiraV3): Promise<{ confirmado: boolean; misto?: RegistroMistoResultadoUIV3 }> => {
    const local = lerLocal(solicitada.storeId, solicitada.osId);
    // Mesmo conteúdo canônico nunca substitui a representação original congelada.
    const p = local.pendencia && mesmoConteudo(local.pendencia, solicitada) ? local.pendencia : solicitada;
    if (emVoo.has(p.key)) return { confirmado: false, misto: { status: "em_andamento" } };
    if (local.bloqueada || (local.pendencia && !mesmoConteudo(local.pendencia, p))) {
      erro(p.key); return { confirmado: false, misto: { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 } };
    }
    try { persistir(p); } catch {
      setBloqueios((prev) => ({ ...prev, [p.key]: true })); erro(p.key);
      return { confirmado: false, misto: { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 } };
    }
    emVoo.add(p.key);
    if (p.tipo === "imediato") setRecebendo(true); else setRegistrandoMisto(true);
    if (activeKeyRef.current === p.key) { setError(null); setErrorKey(null); }
    const reconhecer = async (prova?: ProvaConfirmacaoFinanceiraV3) => {
      if (prova) {
        if (prova.operacaoId !== p.operacaoId || prova.tipo !== p.tipo) throw new Error("Prova incompatível.");
        const leitura = await lerPagamentoOSV3(p.storeId, p.osId, prova);
        assimilar(p.storeId, p.osId, leitura);
        if (leitura.confirmacaoBloqueada || leitura.pendenciaConfirmacao) throw new Error("Reconhecimento ainda pendente.");
      }
      remover(p); sincronizar(p.storeId, p.osId);
    };
    try {
      if (p.tipo === "imediato") {
        const resposta = await receberOSV3(p.storeId, p.osId, { ...p.input, confirmacaoClienteV3: true });
        if ("estado" in resposta && resposta.estado === "RECUSADO_DEFINITIVAMENTE" && resposta.operacaoId === p.operacaoId) {
          remover(p); sincronizar(p.storeId, p.osId); erro(p.key, resposta.mensagem); return { confirmado: false };
        }
        if ("estado" in resposta && resposta.estado === "INCERTO") {
          if (resposta.pendencia) persistir(resposta.pendencia);
          erro(p.key); return { confirmado: false };
        }
        // Compatibilidade com o contrato positivo anterior (consumidores e testes legados).
        const positivo = "estado" in resposta && resposta.estado === "CONFIRMADO" ? resposta.resultado : resposta as unknown as import("@/lib/operacoes-v3/pdv-servico-actions").ReceberOSResultV3;
        if (!positivo.pagamento || !positivo.recibo) throw new Error("Sem prova positiva.");
        await reconhecer("estado" in resposta && resposta.estado === "CONFIRMADO" ? resposta.prova : undefined);
        if (activeKeyRef.current === p.key) {
          setPagamento(positivo.pagamento); setAPrazo(aPrazoVisivelV3(positivo.os, positivo.pagamento.saldo)); setLoadedKey(p.key);
          setErrorKey(null); setUltimoRecibo(positivo.recibo); setReciboKey(p.key);
        }
        return { confirmado: true };
      }
      const res = await registrarRecebimentoMistoOSV3(p.storeId, p.osId, { ...p.input, confirmacaoClienteV3: true });
      if (!res.ok) {
        if (res.pendencia) persistir(res.pendencia);
        if (res.naoRegistrada) { remover(p); sincronizar(p.storeId, p.osId); }
        erro(p.key, res.naoRegistrada ? res.mensagem : MENSAGEM_CONFIRMACAO_PENDENTE_V3);
        return { confirmado: false, misto: res.naoRegistrada ? { status: "recusado", code: res.code, mensagem: res.mensagem, saldoAtual: res.saldoAtual } : { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 } };
      }
      await reconhecer(res.prova);
      if (activeKeyRef.current === p.key) {
        setPagamento(res.pagamento); setAPrazo(aPrazoVisivelV3({ aPrazoV3: res.aPrazo }, res.pagamento.saldo));
        setLoadedKey(p.key); setErrorKey(null); setUltimoRecibo(res.recibo); setReciboKey(p.key);
      }
      return { confirmado: true, misto: { status: "ok", resultado: res } };
    } catch {
      // Transporte, digest, timeout e autorização não provam rollback/ausência.
      erro(p.key);
      lerPagamentoOSV3(p.storeId, p.osId).then((res) => assimilar(p.storeId, p.osId, res)).catch(() => undefined);
      return { confirmado: false, misto: { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 } };
    } finally {
      emVoo.delete(p.key); sincronizar(p.storeId, p.osId);
      if (p.tipo === "imediato") setRecebendo(false); else setRegistrandoMisto(false);
    }
  }, [assimilar, erro, sincronizar]);

  const receber = useCallback(async (input: ReceberOSInputV3) => {
    if (!sid || !id || !targetKey) return false;
    const anterior = lerLocal(sid, id).pendencia;
    if (bloqueios[targetKey] || (anterior && anterior.tipo !== "imediato")) { erro(targetKey); return false; }
    const enviado: ReceberOSInputV3 = JSON.parse(JSON.stringify({ ...input, confirmacaoClienteV3: true,
      operacaoId: input.operacaoId ?? anterior?.operacaoId ?? gerarOperacaoIdV3(),
      saldoEsperado: input.saldoEsperado ?? (anterior?.tipo === "imediato" ? anterior.input.saldoEsperado : saldoVistoRef.current?.key === targetKey ? saldoVistoRef.current.saldo : undefined),
    }));
    return (await enviar({ versao: 1, key: targetKey, storeId: sid, osId: id, operacaoId: enviado.operacaoId!, tipo: "imediato", input: enviado })).confirmado;
  }, [sid, id, targetKey, bloqueios, enviar, erro]);
  const registrarMisto = useCallback(async (dados: DadosRecebimentoMistoV3): Promise<RegistroMistoResultadoUIV3> => {
    if (!sid || !id || !targetKey) return { status: "recusado", code: "entrada_invalida", mensagem: "Selecione a OS." };
    const anterior = lerLocal(sid, id).pendencia;
    if (bloqueios[targetKey] || (anterior && anterior.tipo !== "misto")) { erro(targetKey); return { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 }; }
    const input: RegistrarRecebimentoMistoInputV3 = JSON.parse(JSON.stringify({ ...dados, confirmacaoClienteV3: true, operacaoId: anterior?.operacaoId ?? gerarOperacaoIdV3() }));
    return (await enviar({ versao: 1, key: targetKey, storeId: sid, osId: id, operacaoId: input.operacaoId, tipo: "misto", input })).misto ?? { status: "incerto", mensagem: MENSAGEM_CONFIRMACAO_PENDENTE_V3 };
  }, [sid, id, targetKey, bloqueios, enviar, erro]);
  const verificarConfirmacao = useCallback(async () => {
    if (!sid || !id) return false;
    const p = lerLocal(sid, id).pendencia;
    return p ? (await enviar(p)).confirmado : false;
  }, [sid, id, enviar]);
  const estornar = useCallback(async (input: EstornarRecebimentoInputV3) => {
    if (!sid || !id || !targetKey) return false;
    const local = lerLocal(sid, id);
    if (local.pendencia || local.bloqueada || bloqueios[targetKey] || emVoo.has(targetKey)) { erro(targetKey); return false; }
    setEstornando(true); setError(null);
    try {
      const res = await estornarRecebimentoOSV3(sid, id, input);
      if (activeKeyRef.current === targetKey) {
        setPagamento(res.pagamento); setAPrazo(aPrazoVisivelV3(res.os, res.pagamento.saldo)); setLoadedKey(targetKey); setErrorKey(null);
      }
      return true;
    } catch (e) { erro(targetKey, e instanceof Error ? e.message : "Não foi possível estornar o recebimento."); return false; }
    finally { setEstornando(false); }
  }, [sid, id, targetKey, bloqueios, erro]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const limparRecibo = useCallback(() => setUltimoRecibo(null), []);
  const leitura = projetarLeituraAtualPdvServicoV3({ targetKey, loadedKey, errorKey, pagamento, sessao, loading, error });
  const p = targetKey ? pendencias[targetKey] ?? null : null;
  return { ...leitura, recebendo, registrandoMisto, estornando, ultimoRecibo: targetKey && reciboKey === targetKey ? ultimoRecibo : null,
    aPrazo: targetKey && loadedKey === targetKey ? aPrazo : null, reload, receber, registrarMisto, estornar, limparRecibo,
    pendenciaConfirmacao: p, pendenciaMisto: p?.tipo === "misto" ? p : null, pendenciaReceber: p?.tipo === "imediato" ? p : null,
    confirmacaoBloqueada: !!p || !!(targetKey && bloqueios[targetKey]), verificarConfirmacao,
  };
}
