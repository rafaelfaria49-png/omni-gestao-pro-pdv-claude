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

export function usePdvServicoV3(storeId: string | null, osId: string | null): PdvServicoState {
  const [pagamento, setPagamento] = useState<PagamentoV3 | null>(null);
  const [sessao, setSessao] = useState<CaixaSessaoV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoRecibo, setUltimoRecibo] = useState<ComprovanteReciboV3 | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    const sid = (storeId ?? "").trim();
    const id = (osId ?? "").trim();
    if (!sid || !id) {
      setPagamento(null);
      setSessao(null);
      setError(null);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    lerPagamentoOSV3(sid, id)
      .then((res) => {
        if (reqRef.current !== reqId) return;
        const { sessao: s, ...pag } = res;
        setPagamento(pag);
        setSessao(s);
        setLoading(false);
      })
      .catch((e) => {
        if (reqRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar o pagamento da OS.");
        setLoading(false);
      });
  }, [storeId, osId, nonce]);

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
        setPagamento(res.pagamento);
        setUltimoRecibo(res.recibo);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.");
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
        setPagamento(res.pagamento);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível estornar o recebimento.");
        return false;
      } finally {
        setEstornando(false);
      }
    },
    [storeId, osId],
  );

  return { pagamento, sessao, loading, recebendo, estornando, error, ultimoRecibo, reload, receber, estornar, limparRecibo };
}
