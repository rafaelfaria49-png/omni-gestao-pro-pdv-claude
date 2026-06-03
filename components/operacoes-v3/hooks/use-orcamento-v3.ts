"use client";

// ============================================================================
// Operações V3 — Fase 1A · Ações REAIS de orçamento (gerar / enviar)
// ----------------------------------------------------------------------------
// Envolve as actions seguras de `lib/operacoes-v3/orcamento-actions` com estado
// de pendência + erro. Em sucesso, chama `onSuccess` (recarrega a OS/lista).
// Aprovar/Reprovar NÃO vivem aqui: têm efeito financeiro e ficam como
// placeholder honesto no Workspace nesta fase.
// ============================================================================

import { useCallback, useState } from "react";
import type { OrdemServico } from "@/types/os";
import { gerarOrcamentoDaOS, enviarOrcamentoAoCliente } from "@/lib/operacoes-v3/orcamento-actions";

export type OrcamentoAcaoV3 = "gerar" | "enviar";

export interface OrcamentoV3Actions {
  /** Ação em execução (para desabilitar/indicar loading), ou null. */
  pending: OrcamentoAcaoV3 | null;
  error: string | null;
  gerar: () => Promise<boolean>;
  enviar: () => Promise<boolean>;
}

export function useOrcamentoV3(
  storeId: string | null,
  osId: string | null,
  onSuccess?: (os: OrdemServico) => void,
): OrcamentoV3Actions {
  const [pending, setPending] = useState<OrcamentoAcaoV3 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (acao: OrcamentoAcaoV3, fn: (sid: string, id: string) => Promise<OrdemServico>) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setPending(acao);
      setError(null);
      try {
        const updated = await fn(sid, id);
        onSuccess?.(updated);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir a ação do orçamento.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [storeId, osId, onSuccess],
  );

  const gerar = useCallback(() => run("gerar", gerarOrcamentoDaOS), [run]);
  const enviar = useCallback(() => run("enviar", enviarOrcamentoAoCliente), [run]);

  return { pending, error, gerar, enviar };
}
