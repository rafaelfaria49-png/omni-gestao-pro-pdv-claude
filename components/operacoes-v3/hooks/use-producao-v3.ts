"use client";

// ============================================================================
// Operações V3 — Fase 3B · ações de PRODUÇÃO (técnico + prioridade)
// ----------------------------------------------------------------------------
// Atribuir/alterar/remover técnico e definir prioridade. Lógica no servidor
// (producao-actions). Mudança de status continua pela máquina única (contexto).
// ============================================================================

import { useCallback, useState } from "react";
import { atribuirTecnicoV3, definirPrioridadeV3 } from "@/lib/operacoes-v3/producao-actions";
import type { PrioridadeV3 } from "@/lib/operacoes-v3/producao-model";

export type ProducaoPending = "tecnico" | "prioridade" | null;

export interface ProducaoState {
  pending: ProducaoPending;
  error: string | null;
  atribuirTecnico: (nome: string, id?: string) => Promise<boolean>;
  removerTecnico: () => Promise<boolean>;
  definirPrioridade: (prioridade: PrioridadeV3) => Promise<boolean>;
}

export function useProducaoV3(storeId: string | null, osId: string | null, onChanged?: () => void): ProducaoState {
  const [pending, setPending] = useState<ProducaoPending>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (kind: Exclude<ProducaoPending, null>, fn: (sid: string, id: string) => Promise<unknown>): Promise<boolean> => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setPending(kind);
      setError(null);
      try {
        await fn(sid, id);
        onChanged?.();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [storeId, osId, onChanged],
  );

  const atribuirTecnico = useCallback((nome: string, id?: string) => run("tecnico", (sid, osid) => atribuirTecnicoV3(sid, osid, { nome, id })), [run]);
  const removerTecnico = useCallback(() => run("tecnico", (sid, osid) => atribuirTecnicoV3(sid, osid, null)), [run]);
  const definirPrioridade = useCallback((prioridade: PrioridadeV3) => run("prioridade", (sid, osid) => definirPrioridadeV3(sid, osid, prioridade)), [run]);

  return { pending, error, atribuirTecnico, removerTecnico, definirPrioridade };
}
