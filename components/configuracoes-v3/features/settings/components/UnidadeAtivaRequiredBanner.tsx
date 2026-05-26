"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  /** Texto curto abaixo do aviso (opcional). */
  hint?: string;
};

/** Bloqueio explícito quando nenhuma unidade está selecionada na Config V3. */
export function UnidadeAtivaRequiredBanner({ hint }: Props) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">Nenhuma unidade ativa</p>
        <p className="text-muted-foreground">
          Abra a seção{" "}
          <span className="font-medium text-foreground">Lojas</span> e selecione a unidade cujas configurações
          deseja editar. Preferências não são compartilhadas entre unidades.
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
