"use client";

// ============================================================================
// Operações V4 Preview — leitura REAL de Ordens de Serviço (somente leitura).
// ----------------------------------------------------------------------------
// Consome a MESMA fonte de dados da Operações V3 (Server Actions `listOrdens` /
// `getOrdem` de @/app/actions/ordens), sem importar nenhum componente da V3.
// As actions NÃO lançam (retornam []/null em falha) e são multi-loja por storeId.
// Nenhuma ação de escrita é importada — o Preview permanece somente-leitura.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { listOrdens, getOrdem } from "@/app/actions/ordens";
import type { OrdemServico } from "@/types/os";

export interface OrdensV4State {
  ordens: OrdemServico[];
  loading: boolean;
  /** true até a primeira resposta chegar (evita "vazio" piscar antes de carregar). */
  primeiraCarga: boolean;
  error: string | null;
  reload: () => void;
}

/** Lista de OS reais da loja ativa (somente leitura). */
export function useOrdensV4(storeId: string | null): OrdensV4State {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    const sid = (storeId ?? "").trim();
    if (!sid) {
      setOrdens([]);
      setLoading(false);
      setError(null);
      setPrimeiraCarga(false);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    listOrdens(sid)
      .then((rows) => {
        if (reqRef.current !== reqId) return;
        setOrdens(rows as OrdemServico[]);
        setLoading(false);
        setPrimeiraCarga(false);
      })
      .catch((e) => {
        if (reqRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar ordens de serviço.");
        setLoading(false);
        setPrimeiraCarga(false);
      });
  }, [storeId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ordens, loading, primeiraCarga, error, reload };
}

export interface OrdemV4State {
  ordem: OrdemServico | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Detalhe completo (hidratado) de UMA OS real por id — somente leitura. */
export function useOrdemV4(storeId: string | null, osId: string | null): OrdemV4State {
  const [ordem, setOrdem] = useState<OrdemServico | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqRef = useRef(0);

  useEffect(() => {
    const sid = (storeId ?? "").trim();
    const id = (osId ?? "").trim();
    if (!sid || !id) {
      setOrdem(null);
      setLoading(false);
      setError(null);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    getOrdem(sid, id)
      .then((row) => {
        if (reqRef.current !== reqId) return;
        setOrdem((row ?? null) as OrdemServico | null);
        setLoading(false);
      })
      .catch((e) => {
        if (reqRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar a OS.");
        setLoading(false);
      });
  }, [storeId, osId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ordem, loading, error, reload };
}
