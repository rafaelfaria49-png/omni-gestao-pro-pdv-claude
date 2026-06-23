"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCaixa } from "./caixa-provider"
import { useOperationsStore } from "@/lib/operations-store"
import { useCaixaResumo } from "./use-caixa-resumo"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import { cn } from "@/lib/utils"

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

/** Rótulo curto da forma de pagamento de uma venda (derivado do breakdown). */
function metodoLabel(pb: PaymentBreakdownFull): string {
  const entries: Array<[string, number]> = [
    ["Dinheiro", pb.dinheiro],
    ["Pix", pb.pix],
    ["Débito", pb.cartaoDebito],
    ["Crédito", pb.cartaoCredito],
    ["Carnê", pb.carne],
    ["A prazo", pb.aPrazo],
    ["Vale", pb.creditoVale],
  ]
  const nonZero = entries.filter(([, v]) => v > 0.009)
  if (nonZero.length === 0) return "—"
  if (nonZero.length === 1) return nonZero[0]![0]
  return "Múltiplo"
}

/** HH:mm a partir do timestamp ISO da venda. */
function horaCurta(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return "--:--"
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export function CaixaDashboard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { sessaoId } = useCaixa()
  const { devolucoes, sales } = useOperationsStore()
  // Fonte ÚNICA e autoritativa (mesma do fechamento): vendas canceladas NUNCA contam.
  const { resumo, entradas, saidas, saldoEsperado, qtdCanceladas, totalCanceladas } =
    useCaixaResumo(open)
  const today = new Date().toISOString().split("T")[0]

  const devolucoesHoje = useMemo(
    () => devolucoes.filter((d) => String(d.at).startsWith(today)),
    [devolucoes, today]
  )
  const totalCreditoDevolucao = devolucoesHoje.reduce((s, d) => s + (d.creditIssued ?? 0), 0)

  // Últimas vendas do dia — inclui canceladas (riscadas, com selo) para auditoria visual.
  // Os totais acima NUNCA somam venda cancelada (vêm do resumo autoritativo).
  const recentSales = useMemo(
    () =>
      sales
        .filter((s) => String(s.at).startsWith(today))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 6),
    [sales, today]
  )

  const pg = resumo.porPagamento
  const formasPagamento: Array<[string, number]> = [
    ["Dinheiro", pg.dinheiro],
    ["Pix", pg.pix],
    ["Cartão débito", pg.cartaoDebito],
    ["Cartão crédito", pg.cartaoCredito],
    ["Carnê", pg.carne],
    ["A prazo (fiado)", pg.aPrazo],
    ["Crédito / vale", pg.creditoVale],
  ]

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
        <div className="border-t border-border/60 px-3 pb-3 pt-2 text-xs text-foreground">
          {sessaoId && (
            <p className="mb-2 text-muted-foreground">
              <span className="font-semibold text-foreground">Sessão:</span>{" "}
              <span className="font-mono break-all">{sessaoId}</span>
            </p>
          )}

          {/* Métricas do caixa — linha única no desktop (compacto). Autoritativo. */}
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Abertura</p>
              <p className="text-sm font-semibold">{fmt(resumo.saldoInicial)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Saldo esperado (caixa)</p>
              <p className="text-sm font-semibold text-primary">{fmt(saldoEsperado)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Entradas (vendas + supr.)</p>
              <p className="text-sm font-semibold text-primary">{fmt(entradas)}</p>
            </div>
            <div className="rounded-md border border-border bg-background/80 p-2">
              <p className="text-muted-foreground">Saídas (sangrias)</p>
              <p className="text-sm font-semibold text-destructive">{fmt(saidas)}</p>
            </div>
          </div>

          {/* Duas colunas no desktop: formas de pagamento (esq.) × últimas vendas (dir.) */}
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Esquerda: formas de pagamento + total (sem vendas canceladas) */}
            <div className="space-y-1.5 rounded-md border border-border bg-background/80 p-2">
              <p className="font-semibold text-foreground">Formas de pagamento (hoje)</p>
              {formasPagamento.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{fmt(value)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-semibold">
                <span>Total vendas (dia)</span>
                <span className="tabular-nums">{fmt(pg.total)}</span>
              </div>
            </div>

            {/* Direita: últimas vendas do dia */}
            <div className="rounded-md border border-border bg-background/80 p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">Últimas vendas (dia)</p>
                {recentSales.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{recentSales.length} recente(s)</span>
                )}
              </div>
              {recentSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
                  <p className="text-muted-foreground">Nenhuma venda recente encontrada</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    As vendas do dia aparecem aqui automaticamente.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recentSales.map((s) => {
                    const cancelada = s.status === "cancelada"
                    const nItens = s.lines.reduce((acc, l) => acc + (l.quantity || 0), 0)
                    const nItensLabel =
                      nItens % 1 === 0 ? String(nItens) : nItens.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                cancelada && "text-muted-foreground line-through"
                              )}
                            >
                              {fmt(s.total)}
                            </span>
                            <span className="text-muted-foreground">· {metodoLabel(s.paymentBreakdown)}</span>
                            {cancelada && (
                              <span className="shrink-0 rounded bg-destructive/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-destructive">
                                Cancelada
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {horaCurta(s.at)} · {nItensLabel} {nItens === 1 ? "item" : "itens"}
                            {s.customerName ? ` · ${s.customerName}` : ""}
                          </div>
                        </div>
                        {s.syncPending && !cancelada && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[9px] font-medium text-amber-600 dark:text-amber-300">
                            sincronizando
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Cancelamentos — informativo, fora dos totais (fonte real: vendas canceladas) */}
          {qtdCanceladas > 0 && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
              <p className="font-semibold text-destructive">Cancelamentos (sessão)</p>
              <p className="text-muted-foreground">
                {qtdCanceladas} venda(s) · {fmt(totalCanceladas)} estornado(s) — não entram nas entradas,
                saldo nem formas de pagamento.
              </p>
            </div>
          )}

          {/* Devoluções — rodapé compacto */}
          <div className="mt-3 rounded-md border border-border bg-background/80 p-2">
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
