"use client"

import { Clock, RotateCcw, Trash2, PauseCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { HeldSale } from "@/lib/pdv-hold"

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function saleTotal(sale: HeldSale): number {
  const gross = sale.items.reduce((acc, i) => acc + i.price * i.quantity, 0)
  const discR = sale.discountReais ?? 0
  const discP = sale.discountPercent ?? 0
  const afterPct = gross * (1 - discP / 100)
  return Math.max(0, afterPct - discR)
}

interface VendaEsperaModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  heldSales: HeldSale[]
  cartEmpty: boolean
  onHold: () => void
  onResume: (sale: HeldSale) => void
  onDiscard: (id: string) => void
}

export function VendaEsperaModal({
  open,
  onOpenChange,
  heldSales,
  cartEmpty,
  onHold,
  onResume,
  onDiscard,
}: VendaEsperaModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-primary" />
            Vendas em espera
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!cartEmpty && (
            <Button
              onClick={() => {
                onHold()
                onOpenChange(false)
              }}
              className="w-full"
              variant="default"
            >
              <PauseCircle className="mr-2 h-4 w-4" />
              Colocar venda atual em espera
            </Button>
          )}

          {heldSales.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">Nenhuma venda em espera.</p>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="flex flex-col gap-2 pr-2">
                {heldSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{sale.label}</span>
                        {sale.customer?.name && (
                          <Badge variant="outline" className="text-xs">
                            {sale.customer.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTime(sale.savedAt)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {sale.items.length} {sale.items.length === 1 ? "item" : "itens"}
                      </span>
                      <span className="font-semibold text-foreground">
                        {saleTotal(sale).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => {
                          onResume(sale)
                          onOpenChange(false)
                        }}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Retomar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDiscard(sale.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
