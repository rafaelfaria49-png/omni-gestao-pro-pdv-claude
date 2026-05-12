"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCaixa } from "./caixa-provider"
import { ensureLedger, useOperationsStore } from "@/lib/operations-store"
import { cn } from "@/lib/utils"

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export function CaixaDashboard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { caixa, getSaldoAtual, sessaoId } = useCaixa()
  const { dailyLedger, devolucoes } = useOperationsStore()
  const ledger = ensureLedger(dailyLedger)
  const today = new Date().toISOString().split("T")[0]

  const devolucoesHoje = useMemo(
    () => devolucoes.filter((d) => String(d.at).startsWith(today)),
    [devolucoes, today]
  )
  const totalCreditoDevolucao = devolucoesHoje.reduce((s, d) => s + (d.creditIssued ?? 0), 0)

  return (
    <div className={cn("border-b border-border bg-muted/15", className)}>
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-between gap-2 rounded-none px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Resumo do caixa (vendas do dia)</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </Button>
      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2 text-xs text-foreground">
          {sessaoId && (
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Sessão:</span>{" "}
              <span className="font-mono break-all">{sessaoId}</span>
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Abertura</p>
              <p className="text-sm font-semibold">{fmt(caixa.saldoInicial)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Saldo esperado (caixa)</p>
              <p className="text-sm font-semibold text-primary">{fmt(getSaldoAtual())}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Entradas (vendas + suprimentos)</p>
              <p className="text-sm font-semibold text-primary">{fmt(caixa.totalEntradas)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Saídas (sangrias)</p>
              <p className="text-sm font-semibold text-destructive">{fmt(caixa.totalSaidas)}</p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/80 p-2 space-y-1.5">
            <p className="font-semibold text-foreground">Formas de pagamento (hoje)</p>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Dinheiro</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasDinheiro)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Pix</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasPix)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cartão débito</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasCartaoDebito)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cartão crédito</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasCartaoCredito)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Carnê / a prazo</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasCarne)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Crédito / vale</span>
              <span className="font-medium tabular-nums">{fmt(ledger.vendasCreditoVale)}</span>
            </div>
            <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
              <span>Total vendas (dia)</span>
              <span className="tabular-nums">{fmt(ledger.totalVendas)}</span>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/80 p-2">
            <p className="font-semibold text-foreground">Devoluções hoje</p>
            <p className="text-muted-foreground">
              {devolucoesHoje.length} registro(s) · crédito emitido {fmt(totalCreditoDevolucao)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
