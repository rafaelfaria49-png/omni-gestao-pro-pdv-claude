"use client";

import { useEffect, useMemo, useState } from "react";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { MIN_QUERY_CATALOGO_V4 } from "@/lib/operacoes-v4/servicos-autorizados-form";

export interface ServicoCatalogoV4 {
  id: string;
  nome: string;
  preco: number;
  custo: number;
  garantia: number;
  tempo: string;
  termo: string;
  active: boolean;
}

/** Atraso do debounce client-side da busca (ms). Sem dependência nova. */
export const DEBOUNCE_CATALOGO_V4_MS = 250;

/**
 * Filtro PURO do catálogo (GOAL OPS-V4-MULTI-SERVICOS-UI-003).
 * Query vazia/curta (< MIN_QUERY_CATALOGO_V4) → [] (a lista NUNCA fica
 * permanentemente aberta). Somente itens ativos com nome.
 */
export function filtrarServicosCatalogoV4(
  items: ServicoCatalogoV4[],
  query: string,
  limite = 12,
): ServicoCatalogoV4[] {
  const lista = Array.isArray(items) ? items : [];
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_CATALOGO_V4) return [];
  return lista
    .filter((s) => s.active !== false && s.nome?.trim())
    .filter((s) => s.nome.toLowerCase().includes(q))
    .slice(0, Math.max(1, limite));
}

export function useServicosV4(storeId: string | null) {
  const [items, setItems] = useState<ServicoCatalogoV4[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const sid = (storeId ?? "").trim();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_CATALOGO_V4_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!sid) {
      setItems([]);
      return;
    }
    let vivo = true;
    setLoading(true);
    setError(null);
    fetch("/api/ops/servicos", {
      credentials: "include",
      cache: "no-store",
      headers: { [ASSISTEC_LOJA_HEADER]: sid },
    })
      .then(async (r) => {
        const data = (await r.json()) as { items?: ServicoCatalogoV4[]; error?: string };
        if (!r.ok) throw new Error(data.error || "Falha ao carregar serviços.");
        return data.items ?? [];
      })
      .then((rows) => {
        if (vivo) setItems(rows.filter((s) => s.active !== false && s.nome?.trim()));
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : "Falha ao carregar serviços.");
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [sid]);

  const filtrados = useMemo(
    () => filtrarServicosCatalogoV4(items, debouncedQuery),
    [items, debouncedQuery],
  );

  return { items, filtrados, loading, error, query, setQuery, debouncedQuery, semLoja: !sid };
}
