"use client";

// ============================================================================
// Operações V3 — Leitura da lista de OS (Server Action real, somente leitura)
// ----------------------------------------------------------------------------
// Usa `listOrdens` de @/app/actions/ordens — que NÃO lança (retorna [] em
// falha de DB) e é multi-loja por storeId. Nenhuma ação de escrita é importada.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { listOrdens } from "@/app/actions/ordens";
import type { OrdemServico } from "@/types/os";

export interface OrdensV3State {
  ordens: OrdemServico[];
  loading: boolean;
  /** true até a primeira resposta chegar (evita "vazio" piscar antes de carregar). */
  primeiraCarga: boolean;
  error: string | null;
  storeId: string | null;
  reload: () => void;
}

export function useOrdensV3(storeId: string | null): OrdensV3State {
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

  return {
    ordens,
    loading,
    primeiraCarga,
    error,
    storeId: (storeId ?? "").trim() || null,
    reload,
  };
}
