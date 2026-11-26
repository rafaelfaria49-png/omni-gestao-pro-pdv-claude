"use client";

import { Button } from "@/components/configuracoes-v3/components/ui/button";

export interface DirtySectionSummary {
  id: string;
  label: string;
}

export interface SettingsDirtyDockProps {
  dirtySections: DirtySectionSummary[];
  saving?: boolean;
  /** Quando true, não há edições novas locais — apenas confirmação pendente após envio aceito. */
  pendingConfirmationOnly?: boolean;
  onDiscardAll: () => void;
  onSaveAll: () => void;
}

/**
 * Barra flutuante de coordenação de alterações não salvas (Conceito C).
 * Coordena os salvamentos independentes existentes sem criar transação ou atomicidade artificial.
 */
export function SettingsDirtyDock({
  dirtySections,
  saving = false,
  pendingConfirmationOnly = false,
  onDiscardAll,
  onSaveAll,
}: SettingsDirtyDockProps) {
  if (dirtySections.length === 0) return null;

  const summary = dirtySections.map((s) => s.label).join(" e ");
  const multiple = dirtySections.length > 1;
  const actionLabel = saving
    ? pendingConfirmationOnly
      ? "Confirmando…"
      : "Salvando…"
    : pendingConfirmationOnly
      ? "Confirmar estado salvo"
      : multiple
        ? "Salvar pendentes"
        : "Salvar agora";

  return (
    <div
      role="region"
      aria-label="Alterações pendentes"
      className="pointer-events-none sticky bottom-3 z-20 mt-4 flex justify-center px-2"
    >
      <div className="cfg-dirty-dock pointer-events-auto flex max-w-full flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2 font-medium" style={{ color: "var(--cfg-fg)" }}>
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--cfg-warning-dot)" }}
          />
          <span className="truncate">
            {pendingConfirmationOnly ? "Confirmação pendente em " : "Alterações pendentes em "}
            <strong className="font-semibold">{summary}</strong>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={onDiscardAll}
          >
            {multiple ? "Descartar tudo" : "Descartar"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={onSaveAll}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
