"use client"

import { useRef, useState } from "react"
import { CheckCircle2, Printer, FileDown, Hash, Monitor, User, Clock, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { openThermalHtmlPrint } from "@/lib/thermal-print"
import { buildComprovanteFechamentoHtml, type FechamentoPosSnapshot } from "@/lib/caixa-fechamento-resumo"

export interface FechamentoPosFechamentoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshot: FechamentoPosSnapshot | null
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtDt = (iso: string | null) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR")
}

/**
 * Diálogo pós-fechamento de caixa — aberto SOMENTE depois que o backend confirma
 * o fechamento (mesmo padrão de `PdvPostSaleDialog`). Usa o snapshot já calculado
 * pelo `FechamentoCaixaModal`; não busca dados novos, não imprime nada sozinho.
 */
export function FechamentoPosFechamentoDialog({
  open,
  onOpenChange,
  snapshot,
}: FechamentoPosFechamentoDialogProps) {
  const { toast } = useToast()
  const [printing, setPrinting] = useState(false)
  const imprimirRef = useRef<HTMLButtonElement>(null)

  function runPrint(title: string, dica?: string) {
    if (!snapshot) return
    setPrinting(true)
    try {
      const html = buildComprovanteFechamentoHtml(snapshot)
      openThermalHtmlPrint(html, title)
      if (dica) toast({ title: "Impressão aberta", description: dica })
    } finally {
      // openThermalHtmlPrint é síncrono (abre janela + agenda print interno);
      // mantém o guard de Escape por uma janela curta para cobrir esse agendamento.
      window.setTimeout(() => setPrinting(false), 400)
    }
  }

  function handleImprimir() {
    runPrint("Fechamento de caixa")
  }

  function handleSalvarPdf() {
    runPrint(
      "Fechamento de caixa",
      'Na janela de impressão, escolha "Salvar como PDF" no destino.',
    )
  }

  function handleFechar() {
    onOpenChange(false)
  }

  if (!snapshot) return null

  const temDiferenca = snapshot.diferenca != null && Math.abs(snapshot.diferenca) > 0.01

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && printing) return
        onOpenChange(o)
      }}
    >
      <DialogContent
        className="w-[92vw] border-border bg-card sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          imprimirRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-success/25 bg-success/10">
              <CheckCircle2 className="h-4.5 w-4.5 text-success" />
            </span>
            Caixa fechado com sucesso
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Sessão encerrada e registrada no servidor. Imprima ou salve o comprovante antes de fechar.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-border bg-secondary/50">
          <CardContent className="space-y-2 pt-4 pb-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Monitor className="h-3.5 w-3.5" /> Terminal
              </span>
              <span className="font-medium text-foreground">{snapshot.terminalLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Hash className="h-3.5 w-3.5" /> Sessão
              </span>
              <span className="truncate font-medium text-foreground">
                {snapshot.sessaoId ? `${snapshot.sessaoId.slice(0, 10)}…` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Operador
              </span>
              <span className="truncate font-medium text-foreground">
                {snapshot.operadores.length ? snapshot.operadores.join(", ") : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Abertura
              </span>
              <span className="font-medium text-foreground">{fmtDt(snapshot.dataAbertura)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Fechamento
              </span>
              <span className="font-medium text-foreground">{fmtDt(snapshot.fechadaEm)}</span>
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Total de vendas</span>
              <span className="font-semibold text-foreground">{fmt(snapshot.resumo.totalLiquido)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Dinheiro esperado
              </span>
              <span className="font-medium text-foreground">{fmt(snapshot.saldoDinheiroEsperado)}</span>
            </div>
            {snapshot.valorContado != null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Dinheiro contado</span>
                <span className="font-medium text-foreground">{fmt(snapshot.valorContado)}</span>
              </div>
            )}
            {snapshot.diferenca != null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Diferença</span>
                <span className={`font-semibold ${temDiferenca ? "text-warning" : "text-success"}`}>
                  {snapshot.diferenca > 0 ? "+" : ""}
                  {fmt(snapshot.diferenca)}
                </span>
              </div>
            )}

            <Separator className="bg-border" />

            <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
              <PgtoMini label="Dinheiro" value={snapshot.resumo.porPagamento.dinheiro} />
              <PgtoMini label="Pix" value={snapshot.resumo.porPagamento.pix} />
              <PgtoMini label="Débito" value={snapshot.resumo.porPagamento.cartaoDebito} />
              <PgtoMini label="Crédito" value={snapshot.resumo.porPagamento.cartaoCredito} />
              <PgtoMini label="Carnê" value={snapshot.resumo.porPagamento.carne} />
              <PgtoMini label="Vale" value={snapshot.resumo.porPagamento.creditoVale} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            ref={imprimirRef}
            type="button"
            className="h-11 gap-2 font-semibold"
            onClick={handleImprimir}
          >
            <Printer className="h-4 w-4" />
            Imprimir comprovante
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-2 border-border" onClick={handleSalvarPdf}>
            <FileDown className="h-4 w-4" />
            Salvar PDF
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={handleFechar}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PgtoMini({ label, value }: { label: string; value: number }) {
  if (!(value > 0.001)) return null
  return (
    <div className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{fmt(value)}</p>
    </div>
  )
}
