"use client"

import { useCreditsHistory } from "@/hooks/useCreditsHistory"
import { cn } from "@/lib/utils"
import { getActionLabel } from "@/src/lib/credits/action-labels"

type Props = {
  className?: string
}

function formatDateLabel(v: string) {
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return String(v || "").trim() || "—"
  return d.toLocaleString("pt-BR")
}

export function CreditsHistory({ className }: Props) {
  const { items, loading, error } = useCreditsHistory()

  return (
    <section className={cn("mt-10", className)}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Histórico de créditos</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background/70 shadow-card backdrop-blur">
        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Carregando histórico...</div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Não foi possível carregar o histórico.</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Nenhum uso de crédito ainda.</div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="grid grid-cols-3 gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 text-[12px] font-medium text-muted-foreground">
              <div>Ação</div>
              <div className="text-center">Créditos</div>
              <div className="text-right">Data</div>
            </div>
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-3 gap-3 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">{getActionLabel(it.action || "—")}</div>
                <div className="text-center tabular-nums text-foreground/90">{it.cost}</div>
                <div className="text-right text-muted-foreground">{formatDateLabel(it.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

