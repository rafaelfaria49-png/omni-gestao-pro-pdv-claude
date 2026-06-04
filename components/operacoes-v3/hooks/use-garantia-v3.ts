"use client";

// ============================================================================
// Operações V3 — Fase 1E · ações de garantia (client)
// ----------------------------------------------------------------------------
// Envolve `salvarGarantiaOSV3` / `registrarImpressaoDocumentoV3` com pendência +
// erro. `registrarImpressao` é best-effort (não bloqueia o print em caso de erro).
// ============================================================================

import { useCallback, useState } from "react";
import type { OrdemServico } from "@/types/os";
import { registrarImpressaoDocumentoV3, salvarGarantiaOSV3 } from "@/lib/operacoes-v3/garantia-actions";
import type { DocumentoTipoV3 } from "@/lib/operacoes-v3/documentos";

export interface GarantiaV3Actions {
  pending: boolean;
  error: string | null;
  salvarGarantia: (input: { modeloId: string; prazoDias?: number; termoCustom?: string }) => Promise<boolean>;
  registrarImpressao: (tipo: DocumentoTipoV3) => Promise<void>;
}

export function useGarantiaV3(
  storeId: string | null,
  osId: string | null,
  onSuccess?: (os: OrdemServico) => void,
): GarantiaV3Actions {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salvarGarantia = useCallback(
    async (input: { modeloId: string; prazoDias?: number; termoCustom?: string }) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setPending(true);
      setError(null);
      try {
        const updated = await salvarGarantiaOSV3(sid, id, input);
        onSuccess?.(updated);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível salvar a garantia.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [storeId, osId, onSuccess],
  );

  const registrarImpressao = useCallback(
    async (tipo: DocumentoTipoV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return;
      try {
        await registrarImpressaoDocumentoV3(sid, id, tipo);
      } catch {
        /* auditoria best-effort — não interrompe a impressão */
      }
    },
    [storeId, osId],
  );

  return { pending, error, salvarGarantia, registrarImpressao };
}
