"use client";

// ============================================================================
// Operações V3 — Fase 1C · Ações REAIS de orçamento (cidadão de 1ª classe)
// ----------------------------------------------------------------------------
// Envolve as actions side-effect-free de `lib/operacoes-v3/orcamento-actions`
// com estado de pendência + erro. Em sucesso chama `onSuccess` (recarrega OS).
// Nenhuma ação aqui cria Financeiro/Conta a Receber, estoque ou WhatsApp.
// ============================================================================

import { useCallback, useState } from "react";
import type { OrdemServico } from "@/types/os";
import {
  aprovarOrcamentoV3,
  enviarOrcamentoV3,
  gerarOrcamentoDaOS,
  recusarOrcamentoV3,
  salvarOrcamentoV3,
} from "@/lib/operacoes-v3/orcamento-actions";
import type { SalvarOrcamentoV3Input } from "@/lib/operacoes-v3/orcamento-model";

export type OrcamentoAcaoV3 = "gerar" | "salvar" | "enviar" | "aprovar" | "recusar";

export interface OrcamentoV3Actions {
  pending: OrcamentoAcaoV3 | null;
  error: string | null;
  gerar: () => Promise<boolean>;
  salvar: (input: SalvarOrcamentoV3Input) => Promise<boolean>;
  enviar: () => Promise<boolean>;
  aprovar: () => Promise<boolean>;
  recusar: (motivo?: string) => Promise<boolean>;
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
  const salvar = useCallback(
    (input: SalvarOrcamentoV3Input) => run("salvar", (sid, id) => salvarOrcamentoV3(sid, id, input)),
    [run],
  );
  const enviar = useCallback(() => run("enviar", enviarOrcamentoV3), [run]);
  const aprovar = useCallback(() => run("aprovar", aprovarOrcamentoV3), [run]);
  const recusar = useCallback(
    (motivo?: string) => run("recusar", (sid, id) => recusarOrcamentoV3(sid, id, motivo)),
    [run],
  );

  return { pending, error, gerar, salvar, enviar, aprovar, recusar };
}
