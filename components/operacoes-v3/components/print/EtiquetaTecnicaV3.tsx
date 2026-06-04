"use client";

// ============================================================================
// Operações V3 — Fase 1E · Etiqueta técnica (estrutura inicial).
// Identificação do aparelho na bancada. Sem impressão térmica ainda — só layout.
// `id="og-print-root"` é o alvo do CSS de impressão.
// ============================================================================

import type { EtiquetaV3 } from "@/lib/operacoes-v3/print-model";
import { formatData } from "../../lib/format";

export function EtiquetaTecnicaV3({ etiqueta }: { etiqueta: EtiquetaV3 }) {
  return (
    <div id="og-print-root" className="mx-auto bg-white p-4 text-black">
      <div className="w-[320px] rounded border-2 border-black p-3">
        <div className="flex items-center justify-between border-b border-black pb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Ordem de Serviço</span>
          <span className="text-[16px] font-extrabold text-black">{etiqueta.numero}</span>
        </div>
        <div className="mt-2 space-y-1">
          <p className="text-[13px] font-semibold text-black">{etiqueta.cliente}</p>
          <p className="text-[12px] text-black">{etiqueta.equipamento}</p>
          <div className="flex items-center justify-between text-[11px] text-zinc-700">
            <span>Status: <strong className="text-black">{etiqueta.statusLabel}</strong></span>
            {etiqueta.tecnico ? <span>Téc.: {etiqueta.tecnico}</span> : null}
          </div>
          {etiqueta.entrada ? <p className="text-[10px] text-zinc-600">Entrada: {formatData(etiqueta.entrada)}</p> : null}
        </div>
      </div>
      <p className="mt-2 w-[320px] text-center text-[9px] text-zinc-400">Etiqueta técnica — impressão térmica em fase futura.</p>
    </div>
  );
}
