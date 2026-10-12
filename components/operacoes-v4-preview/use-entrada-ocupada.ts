"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Id = string | null | undefined;
const chave = (lojaId: Id, osId: Id) => JSON.stringify([lojaId?.trim() ?? "", osId?.trim() ?? ""]);

/** Operações pendentes, independentes de sujeira e do remount do workspace. */
export function useEntradaOcupadaV4() {
  const pendentes = useRef(new Map<string, Set<symbol>>());
  const [versao, setVersao] = useState(0);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  const ocupada = useCallback((lojaId: Id, osId: Id) => (pendentes.current.get(chave(lojaId, osId))?.size ?? 0) > 0, []);
  const iniciar = useCallback((lojaId: Id, osId: Id) => {
    if (!lojaId?.trim() || !osId?.trim()) return () => {};
    const alvo = chave(lojaId, osId);
    const token = Symbol();
    const operacoes = pendentes.current.get(alvo) ?? new Set<symbol>();
    operacoes.add(token);
    pendentes.current.set(alvo, operacoes);
    if (montado.current) setVersao((v) => v + 1);
    // Cada resposta remove somente sua operação, inclusive após troca de
    // OS/loja ou erro. Uma resposta antiga não libera um salvamento mais novo.
    return () => {
      if (!operacoes.delete(token)) return;
      if (operacoes.size === 0) pendentes.current.delete(alvo);
      if (montado.current) setVersao((v) => v + 1);
    };
  }, []);
  return useMemo(() => ({ ocupada, iniciar, versao }), [ocupada, iniciar, versao]);
}

export type OcupacaoEntradaV4 = ReturnType<typeof useEntradaOcupadaV4>;
