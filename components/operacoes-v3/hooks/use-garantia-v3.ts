"use client";

// ============================================================================
// Operações V3 — Fase 1E · ações de garantia (client)
// ----------------------------------------------------------------------------
// Envolve `salvarGarantiaOSV3` / `registrarImpressaoDocumentoV3` com pendência +
// erro. `registrarImpressao` é best-effort (não bloqueia o print em caso de erro).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrdemServico } from "@/types/os";
import { registrarImpressaoDocumentoV3, salvarGarantiaOSV3, type SalvarGarantiaInputV3 } from "@/lib/operacoes-v3/garantia-actions";
import type { DocumentoTipoV3 } from "@/lib/operacoes-v3/documentos";

export interface GarantiaV3Actions {
  pending: boolean;
  error: string | null;
  salvarGarantia: (input: SalvarGarantiaInputV3) => Promise<boolean>;
  registrarImpressao: (tipo: DocumentoTipoV3, versao?: number) => Promise<void>;
}

export function useGarantiaV3(
  storeId: string | null,
  osId: string | null,
  onSuccess?: (os: OrdemServico) => void,
): GarantiaV3Actions {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alvo = `${storeId}:${osId}`;
  const alvoAtual = useRef({ alvo, geracao: 0 });
  if (alvoAtual.current.alvo !== alvo) alvoAtual.current = { alvo, geracao: alvoAtual.current.geracao + 1 };
  useEffect(() => { setPending(false); setError(null); }, [alvo]);

  const salvarGarantia = useCallback(
    async (input: SalvarGarantiaInputV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      const geracao = alvoAtual.current.geracao;
      const vigente = () => alvoAtual.current.alvo === `${sid}:${id}` && alvoAtual.current.geracao === geracao;
      setPending(true);
      setError(null);
      try {
        const updated = await salvarGarantiaOSV3(sid, id, input);
        if (!vigente()) return false;
        onSuccess?.(updated);
        return true;
      } catch (e) {
        if (vigente()) setError(e instanceof Error ? e.message : "Não foi possível salvar a garantia.");
        return false;
      } finally {
        if (vigente()) setPending(false);
      }
    },
    [storeId, osId, onSuccess],
  );

  const registrarImpressao = useCallback(
    async (tipo: DocumentoTipoV3, versao?: number) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return;
      try {
        await registrarImpressaoDocumentoV3(sid, id, tipo, versao);
      } catch {
        /* auditoria best-effort — não interrompe a impressão */
      }
    },
    [storeId, osId],
  );

  return { pending, error, salvarGarantia, registrarImpressao };
}
