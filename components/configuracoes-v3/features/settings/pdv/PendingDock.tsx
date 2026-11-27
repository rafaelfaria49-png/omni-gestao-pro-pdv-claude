"use client";

/**
 * Barra de ações e feedback das alterações da UNIDADE: quantas há, salvar/descartar tudo e o resultado de cada bloco.
 * Na Fase 2 converge com a `SettingsDirtyDock` da PR #406 (mesma função na Configurações inteira).
 */
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { PDV_BLOCK_LABEL, type PdvBlockId, type PdvFailure } from "./pdv-station-model";
import { PendingDot } from "./pdv-station-controls";

export function PendingDock({
  saving,
  failures,
  partialSaved,
  pendingCount,
  dirtyBlocks,
  canSave,
  onDiscard,
  onSave,
}: {
  saving: PdvBlockId | null;
  failures: PdvFailure[];
  partialSaved: boolean;
  pendingCount: number;
  dirtyBlocks: PdvBlockId[];
  canSave: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="cx-dock" role="region" aria-label="Alterações não salvas" data-tone={failures.length ? "error" : undefined} data-testid="pdv-dock">
      {/* Base de 240px: em telas estreitas os botões descem para a linha de baixo em vez de espremer o texto. */}
      <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
        {saving ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : failures.length ? (
          <TriangleAlert className="cx-accent-ink h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <PendingDot />
        )}
        <div className="min-w-0 text-sm">
          {saving ? (
            <p className="font-medium">Salvando {PDV_BLOCK_LABEL[saving].toLowerCase()}…</p>
          ) : failures.length ? (
            // Único anúncio da falha (as seções repetem o texto só visualmente).
            <div role="alert">
              <p className="font-medium text-foreground">
                {failures.length === 1
                  ? `${PDV_BLOCK_LABEL[failures[0].block]}: não foi salvo`
                  : `Não foram salvos: ${failures.map((f) => PDV_BLOCK_LABEL[f.block]).join(", ")}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {failures[0]?.message}
                {partialSaved ? " As demais alterações já estão em vigor." : ""}
              </p>
            </div>
          ) : (
            <>
              <p className="font-medium text-foreground">
                {pendingCount} {pendingCount > 1 ? "alterações não salvas" : "alteração não salva"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{dirtyBlocks.map((b) => PDV_BLOCK_LABEL[b]).join(" · ")}</p>
            </>
          )}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" className="cx-touch h-9 px-3 text-[0.8rem]" onClick={onDiscard} disabled={saving !== null}>
          Descartar tudo
        </Button>
        <Button
          type="button"
          className="cx-touch h-9 bg-foreground px-4 text-[0.8rem] font-semibold text-background hover:bg-foreground/90"
          onClick={onSave}
          disabled={!canSave}
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
