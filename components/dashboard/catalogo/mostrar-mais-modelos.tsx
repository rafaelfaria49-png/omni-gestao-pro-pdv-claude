"use client"

/**
 * COMPAT-BUSCA-MODELOS-NATURAL-001 — rodapé da lista de modelos: diz quantos foram mostrados e
 * carrega a próxima página. Nunca some com modelos em silêncio.
 */

import { Loader2 } from "lucide-react"

export function MostrarMaisModelos({
  mostrados,
  total,
  loading,
  onMostrarMais,
}: {
  mostrados: number
  total: number
  loading: boolean
  onMostrarMais: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border px-2 pb-1 pt-1.5">
      <span className="truncate text-xs text-muted-foreground" aria-live="polite">
        {mostrados} de {total} modelos
      </span>
      <button
        type="button"
        // Mantém o foco no campo de busca (o clique não fecha a lista nem perde a digitação).
        onMouseDown={(e) => e.preventDefault()}
        onClick={onMostrarMais}
        disabled={loading}
        className="inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
        {loading ? "Carregando…" : "Mostrar mais"}
      </button>
    </div>
  )
}
