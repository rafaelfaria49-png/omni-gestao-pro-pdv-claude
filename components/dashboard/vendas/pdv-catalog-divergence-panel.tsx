"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeDivergence, type CartCatalogDivergence } from "@/lib/pdv/cart-catalog-reconcile"

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

/** Quantidade desta linha que cabe no saldo, descontando as outras linhas do mesmo produto. */
export function stockAdjustTarget(d: Extract<CartCatalogDivergence, { kind: "stock" }>): number {
  return Math.max(0, Math.floor(d.available - (d.inCart - d.lineQuantity)))
}

/**
 * Revisão explícita de itens do carrinho cujo cadastro mudou com a venda aberta
 * (PDV-CADASTROS-SYNC-AUTOMATICO-001). Enquanto houver item listado aqui o pagamento
 * fica bloqueado: preço, saldo e exclusão têm impacto comercial e só o operador decide.
 */
export function PdvCatalogDivergencePanel({
  divergences,
  onApplyCatalogPrice,
  onKeepCartPrice,
  onAdjustQuantity,
  onRemoveLine,
  className,
}: {
  divergences: readonly CartCatalogDivergence[]
  onApplyCatalogPrice: (lineId: string, catalogPrice: number) => void
  onKeepCartPrice: (lineId: string, catalogPrice: number) => void
  onAdjustQuantity: (lineId: string, quantity: number) => void
  onRemoveLine: (lineId: string) => void
  className?: string
}) {
  if (divergences.length === 0) return null
  const button =
    "inline-flex shrink-0 items-center rounded border border-warning/50 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-warning hover:text-warning-foreground"
  return (
    <div
      role="alert"
      data-testid="pdv-catalog-divergences"
      className={cn(
        "mx-2 mt-2 flex min-w-0 flex-col gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="min-w-0">O cadastro mudou com a venda aberta. Revise antes de cobrar.</span>
      </div>
      <ul className="flex min-w-0 flex-col gap-1">
        {divergences.map((d) => (
          <li key={`${d.kind}:${d.lineId}`} data-divergence-kind={d.kind} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 flex-1">{describeDivergence(d, brl)}</span>
            {d.kind === "price" && (
              <>
                <button type="button" className={button} onClick={() => onApplyCatalogPrice(d.lineId, d.catalogPrice)}>
                  Usar {brl(d.catalogPrice)}
                </button>
                <button type="button" className={button} onClick={() => onKeepCartPrice(d.lineId, d.catalogPrice)}>
                  Manter {brl(d.cartPrice)}
                </button>
              </>
            )}
            {d.kind === "stock" && stockAdjustTarget(d) > 0 && (
              <button type="button" className={button} onClick={() => onAdjustQuantity(d.lineId, stockAdjustTarget(d))}>
                Ajustar para {stockAdjustTarget(d)}
              </button>
            )}
            <button type="button" className={button} onClick={() => onRemoveLine(d.lineId)}>
              Remover item
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
