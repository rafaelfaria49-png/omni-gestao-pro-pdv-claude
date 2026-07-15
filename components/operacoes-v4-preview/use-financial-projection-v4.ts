"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinancialProjectionOSV4 } from "@/lib/operacoes-v4/financial-projection";
import {
  lerProjecaoFinanceiraOSV4,
  lerProjecoesFinanceirasOSV4,
} from "@/lib/operacoes-v4/financial-projection-actions";

export interface FinancialProjectionStateV4 {
  projection: FinancialProjectionOSV4 | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface SelectedState {
  loadedKey: string | null;
  projection: FinancialProjectionOSV4 | null;
  loading: boolean;
  errorKey: string | null;
  error: string | null;
}

export function projectCurrentFinancialProjectionV4(input: SelectedState & { targetKey: string }): Omit<FinancialProjectionStateV4, "reload"> {
  const matches = !!input.targetKey && input.loadedKey === input.targetKey;
  const error = input.errorKey === input.targetKey ? input.error : null;
  return {
    projection: matches ? input.projection : null,
    loading: !!input.targetKey && !matches && !error,
    error,
  };
}

export function useFinancialProjectionV4(
  storeId: string | null | undefined,
  osId: string | null | undefined,
): FinancialProjectionStateV4 {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  const targetKey = sid && id ? `${sid}:${id}` : "";
  const requestId = useRef(0);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<SelectedState>({
    loadedKey: null,
    projection: null,
    loading: false,
    errorKey: null,
    error: null,
  });

  useEffect(() => {
    const currentRequest = ++requestId.current;
    // A troca de loja/OS mascara o dado anterior no mesmo ciclo de efeito.
    setState({ loadedKey: null, projection: null, loading: !!targetKey, errorKey: null, error: null });
    if (!targetKey) return;

    void lerProjecaoFinanceiraOSV4(sid, id)
      .then((projection) => {
        if (requestId.current !== currentRequest) return;
        setState({ loadedKey: targetKey, projection, loading: false, errorKey: null, error: null });
      })
      .catch((error: unknown) => {
        if (requestId.current !== currentRequest) return;
        setState({
          loadedKey: null,
          projection: null,
          loading: false,
          errorKey: targetKey,
          error: error instanceof Error ? error.message : "Não foi possível consultar o financeiro da OS.",
        });
      });
  }, [targetKey, sid, id, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...projectCurrentFinancialProjectionV4({ ...state, targetKey }), reload };
}

export interface FinancialProjectionBatchStateV4 {
  projectionsByOsId: ReadonlyMap<string, FinancialProjectionOSV4>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFinancialProjectionsV4(
  storeId: string | null | undefined,
  osIds: string[],
): FinancialProjectionBatchStateV4 {
  const sid = (storeId ?? "").trim();
  const idsKey = useMemo(
    () => [...new Set(osIds.map((id) => (id ?? "").trim()).filter(Boolean))].sort().join("|"),
    [osIds],
  );
  const targetKey = sid && idsKey ? `${sid}:${idsKey}` : "";
  const requestId = useRef(0);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{
    loadedKey: string | null;
    projections: FinancialProjectionOSV4[];
    loading: boolean;
    errorKey: string | null;
    error: string | null;
  }>({ loadedKey: null, projections: [], loading: false, errorKey: null, error: null });

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setState({ loadedKey: null, projections: [], loading: !!targetKey, errorKey: null, error: null });
    if (!targetKey) return;
    const ids = idsKey.split("|");
    void lerProjecoesFinanceirasOSV4(sid, ids)
      .then((projections) => {
        if (requestId.current !== currentRequest) return;
        setState({ loadedKey: targetKey, projections, loading: false, errorKey: null, error: null });
      })
      .catch((error: unknown) => {
        if (requestId.current !== currentRequest) return;
        setState({
          loadedKey: null,
          projections: [],
          loading: false,
          errorKey: targetKey,
          error: error instanceof Error ? error.message : "Não foi possível consultar os resumos financeiros.",
        });
      });
  }, [targetKey, sid, idsKey, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const projectionsByOsId = useMemo<ReadonlyMap<string, FinancialProjectionOSV4>>(
    () => state.loadedKey === targetKey
      ? new Map(state.projections.map((projection) => [projection.osId, projection]))
      : new Map(),
    [state.loadedKey, state.projections, targetKey],
  );
  const matches = !!targetKey && state.loadedKey === targetKey;
  const error = state.errorKey === targetKey ? state.error : null;
  return {
    projectionsByOsId,
    loading: !!targetKey && !matches && !error,
    error,
    reload,
  };
}
