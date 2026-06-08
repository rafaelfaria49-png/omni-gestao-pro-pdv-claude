"use client";

// ============================================================================
// Operações V3 — SPRINT_3D.1B · Leitura do catálogo oficial (somente leitura)
// ----------------------------------------------------------------------------
// Reusa a Server Action oficial `listProdutos` (busca por nome/SKU/código de
// barras). Nenhuma escrita; nenhum motor de busca paralelo.
// ============================================================================

import { useCallback, useRef, useState } from "react";
import { listProdutos } from "@/app/actions/cadastros";
import { produtoDTOToCatalogoV3, type ProdutoCatalogoV3 } from "@/lib/operacoes-v3/produto-link";

export interface ProdutoCatalogoV3State {
  resultados: ProdutoCatalogoV3[];
  loading: boolean;
  error: string | null;
  /** Busca por nome, SKU ou código de barras (q vazio = recentes). */
  buscar: (q: string) => Promise<void>;
}

export function useProdutoCatalogoV3(storeId: string | null): ProdutoCatalogoV3State {
  const [resultados, setResultados] = useState<ProdutoCatalogoV3[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const buscar = useCallback(
    async (q: string) => {
      const sid = (storeId ?? "").trim();
      if (!sid) {
        setResultados([]);
        setError(null);
        return;
      }
      const reqId = ++reqRef.current;
      setLoading(true);
      setError(null);
      try {
        const rows = await listProdutos(sid, { q: q.trim() || undefined });
        if (reqRef.current !== reqId) return;
        setResultados(rows.map(produtoDTOToCatalogoV3));
      } catch (e) {
        if (reqRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Falha ao buscar produtos no catálogo.");
        setResultados([]);
      } finally {
        if (reqRef.current === reqId) setLoading(false);
      }
    },
    [storeId],
  );

  return { resultados, loading, error, buscar };
}
