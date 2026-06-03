"use client";

// ============================================================================
// Operações V3 — OS Workspace Enterprise · ações do prontuário (client)
// ----------------------------------------------------------------------------
// Envolve as actions side-effect-free de `lib/operacoes-v3/workspace-actions`
// com estado de pendência + erro. Em sucesso chama `onSuccess` (recarrega OS).
// ============================================================================

import { useCallback, useState } from "react";
import type { OrdemServico } from "@/types/os";
import {
  salvarChecklistEntradaV3,
  salvarDiagnosticoV3,
  salvarSenhaAcessoriosV3,
} from "@/lib/operacoes-v3/workspace-actions";
import type { ChecklistEntradaItemV3, SenhaTipoV3 } from "@/lib/operacoes-v3/workspace-model";

export type WorkspaceAcaoV3 = "checklist" | "senha" | "diagnostico";

export interface WorkspaceV3Actions {
  pending: WorkspaceAcaoV3 | null;
  error: string | null;
  salvarChecklist: (itens: ChecklistEntradaItemV3[]) => Promise<boolean>;
  salvarSenhaAcessorios: (input: { senha: string; senhaTipo: SenhaTipoV3; acessorios: string[] }) => Promise<boolean>;
  salvarDiagnostico: (input: { inicial: string; final: string; causa: string; solucao: string }) => Promise<boolean>;
}

export function useWorkspaceV3(
  storeId: string | null,
  osId: string | null,
  onSuccess?: (os: OrdemServico) => void,
): WorkspaceV3Actions {
  const [pending, setPending] = useState<WorkspaceAcaoV3 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (acao: WorkspaceAcaoV3, fn: (sid: string, id: string) => Promise<OrdemServico>) => {
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
        setError(e instanceof Error ? e.message : "Não foi possível salvar.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [storeId, osId, onSuccess],
  );

  const salvarChecklist = useCallback(
    (itens: ChecklistEntradaItemV3[]) => run("checklist", (sid, id) => salvarChecklistEntradaV3(sid, id, itens)),
    [run],
  );
  const salvarSenhaAcessorios = useCallback(
    (input: { senha: string; senhaTipo: SenhaTipoV3; acessorios: string[] }) => run("senha", (sid, id) => salvarSenhaAcessoriosV3(sid, id, input)),
    [run],
  );
  const salvarDiagnostico = useCallback(
    (input: { inicial: string; final: string; causa: string; solucao: string }) => run("diagnostico", (sid, id) => salvarDiagnosticoV3(sid, id, input)),
    [run],
  );

  return { pending, error, salvarChecklist, salvarSenhaAcessorios, salvarDiagnostico };
}
