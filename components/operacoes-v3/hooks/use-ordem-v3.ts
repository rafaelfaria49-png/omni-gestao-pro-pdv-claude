"use client";

// ============================================================================
// Operações V3 — Leitura de UMA OS por id (Server Action real, somente leitura)
// ----------------------------------------------------------------------------
// Usa `getOrdem` de @/app/actions/ordens (acessor de leitura nomeado pelo
// blueprint para o Workspace). Retorna null quando não encontrada. Nenhuma
// ação de escrita é importada.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrdem } from "@/app/actions/ordens";
import type { OrdemServico } from "@/types/os";

export interface OrdemV3State {
  ordem: OrdemServico | null;
  loading: boolean;
  error: string | null;
  /** Re-busca a OS atual (após uma ação real ter mudado o payload). */
  reload: () => void;
}

export function useOrdemV3(storeId: string | null, osId: string | null): OrdemV3State {
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
