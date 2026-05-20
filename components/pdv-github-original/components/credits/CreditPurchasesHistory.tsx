"use client"

import { useCreditPurchasesHistory } from "@/hooks/useCreditPurchasesHistory"
import { cn } from "@/lib/utils"

type Props = { className?: string }

function formatDateLabel(v: string) {
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return String(v || "").trim() || "—"
  return d.toLocaleString("pt-BR")
}

function formatBRLFromCents(cents: number) {
  const value = Number.isFinite(cents) ? cents : 0
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100)
}

export function CreditPurchasesHistory({ className }: Props) {
  const { items, loading, error } = useCreditPurchasesHistory()

  return (
    <section className={cn("mt-10", className)}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Histórico de compras</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background/70 shadow-card backdrop-blur">
        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Carregando histórico...</div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Não foi possível carregar o histórico.</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Nenhuma compra de créditos ainda.</div>
        ) : (
          <div className="divide-y divide-border/50">
            <div className="grid grid-cols-4 gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 text-[12px] font-medium text-muted-foreground">
              <div>Créditos</div>
              <div>Valor</div>
              <div>Status</div>
              <div className="text-right">Data</div>
            </div>
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-4 gap-3 px-4 py-3 text-sm">
                <div className="font-medium tabular-nums text-foreground">
                  +{Number(it.credits ?? 0).toLocaleString("pt-BR")}
                </div>
                <div className="tabular-nums text-foreground/90">{formatBRLFromCents(Number(it.amount ?? 0))}</div>
                <div className="text-muted-foreground">{String(it.status || "—")}</div>
                <div className="text-right text-muted-foreground">{formatDateLabel(it.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

