"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MoreHorizontal, Wand2, XCircle } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import {
  acaoPrimariaV3,
  LABEL_TRANSICAO_V3,
  proximasTransicoesV3,
  statusMetaV3,
  statusV3FromOS,
  type OperacaoStatusV3,
} from "@/lib/operacoes-v3/status-machine";
import { ButtonV3 } from "./UiV3";

/**
 * Barra de comando da OS — dirige a MÁQUINA ÚNICA de status (write real).
 * Mostra a ação primária recomendada + transições válidas + cancelar, todas
 * derivadas de `proximasTransicoesV3`/`acaoPrimariaV3`. Caminhos inválidos não
 * são oferecidos (a engine é a única fonte). "Mais ações" segue placeholder.
 */
export function OSCommandBarV3({
  os,
  onMudarStatus,
  onAcao,
}: {
  os: OrdemServico;
  onMudarStatus: (to: OperacaoStatusV3) => Promise<boolean>;
  onAcao: (label: string) => void;
}) {
  const [pendingTo, setPendingTo] = useState<OperacaoStatusV3 | null>(null);

  const from = statusV3FromOS(os);
  const meta = statusMetaV3(from);
  const primaria = acaoPrimariaV3(from);
  const destinos = proximasTransicoesV3(from);
  const secundarias = destinos.filter((t) => t !== primaria?.to && t !== "cancelada");
  const podeCancelar = destinos.includes("cancelada");

  const handle = async (to: OperacaoStatusV3) => {
    if (pendingTo) return;
    setPendingTo(to);
    try {
      await onMudarStatus(to);
    } finally {
      setPendingTo(null);
    }
  };

  const busy = pendingTo !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      {primaria ? (
        <ButtonV3 variant="primary" disabled={busy} onClick={() => handle(primaria.to)}>
          {pendingTo === primaria.to ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {primaria.label}
        </ButtonV3>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {meta.label} — fluxo de status concluído
        </span>
      )}

      {secundarias.map((to) => (
        <ButtonV3 key={to} variant="outline" disabled={busy} onClick={() => handle(to)}>
          {pendingTo === to ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {LABEL_TRANSICAO_V3[to]}
        </ButtonV3>
      ))}

      {podeCancelar ? (
        <ButtonV3 variant="danger" disabled={busy} onClick={() => handle("cancelada")}>
          {pendingTo === "cancelada" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Cancelar OS
        </ButtonV3>
      ) : null}

      <ButtonV3 variant="ghost" disabled={busy} onClick={() => onAcao("Mais ações")}>
        <MoreHorizontal className="h-4 w-4" />
        Mais ações
      </ButtonV3>

      <span className="ml-auto text-xs text-muted-foreground">
        Transições validadas pela máquina única da V3.
      </span>
    </div>
  );
}
