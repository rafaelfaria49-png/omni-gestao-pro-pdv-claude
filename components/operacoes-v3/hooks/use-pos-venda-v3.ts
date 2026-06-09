"use client";

// ============================================================================
// Operações V3 — Fase 3A · estado das ações de PÓS-VENDA (client)
// ----------------------------------------------------------------------------
// Expõe entregar / abrirRetorno / finalizarRetorno. Toda a lógica fica no
// servidor (entrega-actions / retorno-actions). Recarrega via `onChanged`.
// ============================================================================

import { useCallback, useState } from "react";
import { registrarEntregaV3, salvarAssinaturaRetiradaV3, type RegistrarEntregaInputV3 } from "@/lib/operacoes-v3/entrega-actions";
import { abrirRetornoV3, finalizarRetornoV3 } from "@/lib/operacoes-v3/retorno-actions";

export type PosVendaPending = "entrega" | "retorno" | "finalizar" | "assinatura" | null;

export interface PosVendaState {
  pending: PosVendaPending;
  error: string | null;
  entregar: (input: RegistrarEntregaInputV3) => Promise<boolean>;
  abrirRetorno: (motivo: string) => Promise<boolean>;
  finalizarRetorno: (retornoId: string, observacao?: string) => Promise<boolean>;
  salvarAssinaturaRetirada: (dataUrl: string, por?: string) => Promise<boolean>;
}

export function usePosVendaV3(storeId: string | null, osId: string | null, onChanged?: () => void): PosVendaState {
  const [pending, setPending] = useState<PosVendaPending>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (kind: Exclude<PosVendaPending, null>, fn: (sid: string, id: string) => Promise<unknown>): Promise<boolean> => {
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

  const entregar = useCallback(
    (input: RegistrarEntregaInputV3) => run("entrega", (sid, id) => registrarEntregaV3(sid, id, input)),
    [run],
  );
  const abrirRetorno = useCallback((motivo: string) => run("retorno", (sid, id) => abrirRetornoV3(sid, id, { motivo })), [run]);
  const finalizarRetorno = useCallback(
    (retornoId: string, observacao?: string) => run("finalizar", (sid, id) => finalizarRetornoV3(sid, id, retornoId, { observacao })),
    [run],
  );
  const salvarAssinaturaRetirada = useCallback(
    (dataUrl: string, por?: string) => run("assinatura", (sid, id) => salvarAssinaturaRetiradaV3(sid, id, dataUrl, por)),
    [run],
  );

  return { pending, error, entregar, abrirRetorno, finalizarRetorno, salvarAssinaturaRetirada };
}
