"use client";

// ============================================================================
// Operações V3 — Fase 2A/2B · estado do PDV de Serviço (client)
// ----------------------------------------------------------------------------
// Carrega o pagamento da OS (saldo/status + sessão de caixa) e expõe `receber`
// (com split + intenção), `estornar` (correção do último recebimento) e o
// `ultimoRecibo` para impressão do comprovante. Toda a lógica financeira fica no
// servidor (`pdv-servico-actions`).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estornarRecebimentoOSV3,
  lerPagamentoOSV3,
  receberOSV3,
  type CaixaSessaoV3,
  type EstornarRecebimentoInputV3,
  type ReceberOSInputV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import type { ComprovanteReciboV3, PagamentoV3 } from "@/lib/operacoes-v3/payment-model";

export interface PdvServicoState {
  pagamento: PagamentoV3 | null;
  sessao: CaixaSessaoV3 | null;
  loading: boolean;
  recebendo: boolean;
  estornando: boolean;
  error: string | null;
  ultimoRecibo: ComprovanteReciboV3 | null;
  reload: () => void;
  receber: (input: ReceberOSInputV3) => Promise<boolean>;
  estornar: (input: EstornarRecebimentoInputV3) => Promise<boolean>;
  limparRecibo: () => void;
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

export function usePdvServicoV3(storeId: string | null, osId: string | null): PdvServicoState {
  const sidAtual = (storeId ?? "").trim();
  const osIdAtual = (osId ?? "").trim();
  const targetKey = sidAtual && osIdAtual ? JSON.stringify([sidAtual, osIdAtual]) : null;
  const [pagamento, setPagamento] = useState<PagamentoV3 | null>(null);
  const [sessao, setSessao] = useState<CaixaSessaoV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoRecibo, setUltimoRecibo] = useState<ComprovanteReciboV3 | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const reqRef = useRef(0);
  const activeKeyRef = useRef(targetKey);
  // Atualização síncrona no render: a primeira renderização da OS B já mascara
  // qualquer snapshot que ainda pertença à OS A, antes mesmo de o effect rodar.
  activeKeyRef.current = targetKey;

  useEffect(() => {
    const sid = sidAtual;
    const id = osIdAtual;
    const reqId = ++reqRef.current;
    setPagamento(null);
    setSessao(null);
    setLoadedKey(null);
    setErrorKey(null);
    setError(null);
    if (!sid || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    lerPagamentoOSV3(sid, id)
      .then((res) => {
        if (reqRef.current !== reqId || activeKeyRef.current !== targetKey) return;
        const { sessao: s, ...pag } = res;
        setPagamento(pag);
        setSessao(s);
        setLoadedKey(targetKey);
        setLoading(false);
      })
      .catch((e) => {
        if (reqRef.current !== reqId || activeKeyRef.current !== targetKey) return;
        setPagamento(null);
        setSessao(null);
        setLoadedKey(null);
        setErrorKey(targetKey);
        setError(e instanceof Error ? e.message : "Falha ao carregar o pagamento da OS.");
        setLoading(false);
      });
  }, [sidAtual, osIdAtual, targetKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const limparRecibo = useCallback(() => setUltimoRecibo(null), []);

  const receber = useCallback(
    async (input: ReceberOSInputV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setRecebendo(true);
      setError(null);
      try {
        const res = await receberOSV3(sid, id, input);
        const key = JSON.stringify([sid, id]);
        if (activeKeyRef.current === key) {
          setPagamento(res.pagamento);
          setLoadedKey(key);
          setErrorKey(null);
          setUltimoRecibo(res.recibo);
        }
        return true;
      } catch (e) {
        if (activeKeyRef.current === JSON.stringify([sid, id])) {
          setErrorKey(JSON.stringify([sid, id]));
          setError(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.");
        }
        return false;
      } finally {
        setRecebendo(false);
      }
    },
    [storeId, osId],
  );

  const estornar = useCallback(
    async (input: EstornarRecebimentoInputV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setEstornando(true);
      setError(null);
      try {
        const res = await estornarRecebimentoOSV3(sid, id, input);
        const key = JSON.stringify([sid, id]);
        if (activeKeyRef.current === key) {
          setPagamento(res.pagamento);
          setLoadedKey(key);
          setErrorKey(null);
        }
        return true;
      } catch (e) {
        if (activeKeyRef.current === JSON.stringify([sid, id])) {
          setErrorKey(JSON.stringify([sid, id]));
          setError(e instanceof Error ? e.message : "Não foi possível estornar o recebimento.");
        }
        return false;
      } finally {
        setEstornando(false);
      }
    },
    [storeId, osId],
  );

  const leituraAtual = projetarLeituraAtualPdvServicoV3({ targetKey, loadedKey, errorKey, pagamento, sessao, loading, error });
  return {
    pagamento: leituraAtual.pagamento,
    sessao: leituraAtual.sessao,
    loading: leituraAtual.loading,
    recebendo,
    estornando,
    error: leituraAtual.error,
    ultimoRecibo,
    reload,
    receber,
    estornar,
    limparRecibo,
  };
}
