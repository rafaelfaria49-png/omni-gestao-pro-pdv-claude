"use client"

import { useMemo } from "react"
import { Printer, Copy, TrendingUp, TrendingDown, DollarSign, RotateCcw, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useCaixa } from "./caixa-provider"
import { ensureLedger, useOperationsStore } from "@/lib/operations-store"
import { useToast } from "@/hooks/use-toast"
import { computeFechamentoResumo } from "@/lib/caixa-fechamento-resumo"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtDt = (d: Date | null) =>
  d
    ? d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

interface Props {
  /** Nome da loja para impressão */
  nomeLoja?: string
  /** Operador da sessão */
  operador?: string
}

export function CaixaRelatorio({ nomeLoja = "Loja", operador = "" }: Props) {
  const { caixa, getSaldoAtual, sessaoId } = useCaixa()
  const { dailyLedger, sales, devolucoes } = useOperationsStore()
  const { toast } = useToast()
  const ledger = ensureLedger(dailyLedger)

  const today = new Date().toISOString().split("T")[0]

  const vendasHoje = useMemo(
    () => sales.filter((s) => String(s.at).startsWith(today)),
    [sales, today]
  )
  const devolucoesHoje = useMemo(
    () => devolucoes.filter((d) => String(d.at).startsWith(today)),
    [devolucoes, today]
  )

  // Resumo por origem (PDV/Balcão, Item Avulso, O.S.) reutilizando o helper de
  // fechamento — só consumimos `porOrigem` aqui (sem duplicar cálculo de saldo).
  const porOrigem = useMemo(
    () =>
      computeFechamentoResumo({ sales: vendasHoje, sangrias: 0, suprimentos: 0, saldoInicial: 0 })
        .porOrigem,
    [vendasHoje]
  )

  const totalBruto = vendasHoje.reduce((s, v) => s + (v.total ?? 0), 0)
  const totalDescontos = vendasHoje.reduce(
    (s, v) => s + (v.discountTotal ?? 0),
    0
  )
  const totalDevolvido = devolucoesHoje.reduce((s, d) => s + (d.creditIssued ?? 0), 0)
  const totalLiquido = totalBruto - totalDescontos - totalDevolvido
  const ticketMedio = vendasHoje.length > 0 ? totalBruto / vendasHoje.length : 0
  const saldoEsperado = getSaldoAtual()

  const formasPgto = [
    { label: "Dinheiro", value: ledger.vendasDinheiro },
    { label: "Pix", value: ledger.vendasPix },
    { label: "Cartão Débito", value: ledger.vendasCartaoDebito },
    { label: "Cartão Crédito", value: ledger.vendasCartaoCredito },
    { label: "Carnê / A Prazo", value: ledger.vendasCarne },
    { label: "Crédito/Vale", value: ledger.vendasCreditoVale },
  ]

  const buildTexto = () => {
    const lines = [
      `==== RELATÓRIO DE CAIXA ====`,
      `Loja: ${nomeLoja}`,
      operador ? `Operador: ${operador}` : "",
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      sessaoId ? `Sessão: ${sessaoId}` : "",
      `Abertura: ${fmtDt(caixa.dataAbertura)}`,
      "---",
      `Vendas (qtd): ${vendasHoje.length}`,
      `Total bruto:  ${fmt(totalBruto)}`,
      `Descontos:    ${fmt(totalDescontos)}`,
      `Devoluções:   ${fmt(totalDevolvido)}`,
      `Total líquido:${fmt(totalLiquido)}`,
      `Ticket médio: ${fmt(ticketMedio)}`,
      "---",
      `Dinheiro:     ${fmt(ledger.vendasDinheiro)}`,
      `Pix:          ${fmt(ledger.vendasPix)}`,
      `Débito:       ${fmt(ledger.vendasCartaoDebito)}`,
      `Crédito:      ${fmt(ledger.vendasCartaoCredito)}`,
      `Carnê:        ${fmt(ledger.vendasCarne)}`,
      `Vale:         ${fmt(ledger.vendasCreditoVale)}`,
      "---",
      `Sangrias:     ${fmt(caixa.totalSaidas)}`,
      `Suprimentos:  ${fmt(caixa.totalEntradas - totalBruto > 0 ? caixa.totalEntradas - totalBruto : 0)}`,
      `Saldo inicial:${fmt(caixa.saldoInicial)}`,
      `Saldo esperado:${fmt(saldoEsperado)}`,
      "===========================",
    ]
      .filter(Boolean)
      .join("\n")
    return lines
  }

  const handleImprimir = () => {
    const html = `<html><head><title>Relatório de Caixa</title>
    <style>body{font-family:monospace;font-size:12px;margin:16px;white-space:pre}</style>
    </head><body><pre>${buildTexto()}</pre></body></html>`
    const w = window.open("", "_blank", "width=450,height=700")
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(buildTexto())
      toast({ title: "Copiado!", description: "Relatório copiado para a área de transferência." })
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Relatório de Caixa
          </p>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("pt-BR")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopiar}>
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleImprimir}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiMini label="Vendas" value={String(vendasHoje.length)} sub="quantidade" color="text-foreground" />
        <KpiMini label="Total bruto" value={fmt(totalBruto)} color="text-emerald-500" />
        <KpiMini label="Total líquido" value={fmt(totalLiquido)} color="text-primary" />
        <KpiMini label="Ticket médio" value={fmt(ticketMedio)} color="text-sky-500" />
      </div>

      {/* Descontos / Devoluções */}
      {(totalDescontos > 0 || totalDevolvido > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {totalDescontos > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <TrendingDown className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Descontos</p>
                <p className="text-sm font-semibold text-amber-500">- {fmt(totalDescontos)}</p>
              </div>
            </div>
          )}
          {totalDevolvido > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <RotateCcw className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Devoluções</p>
                <p className="text-sm font-semibold text-red-500">- {fmt(totalDevolvido)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formas de pagamento */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-primary" />
            Formas de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-2">
            {formasPgto.map((f) => (
              <div key={f.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{f.label}</span>
                <span className={`font-medium ${f.value > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {fmt(f.value)}
                </span>
              </div>
            ))}
            <Separator className="bg-border" />
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="text-primary">{fmt(ledger.totalVendas)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendas por origem */}
      {porOrigem.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-primary" />
              Vendas por origem
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-2">
              {porOrigem.map((o) => (
                <div key={o.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {o.label}
                    <span className="ml-1 text-xs text-muted-foreground/70">({o.qtdItens})</span>
                  </span>
                  <span className="font-medium text-foreground">{fmt(o.valorBruto)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saldo do caixa */}
      <Card className="border-border bg-card">
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Saldo inicial
            </span>
            <span className="font-medium">{fmt(caixa.saldoInicial)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Entradas totais
            </span>
            <span className="font-medium text-emerald-500">+ {fmt(caixa.totalEntradas)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-red-400 flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Saídas (sangrias)
            </span>
            <span className="font-medium text-red-500">- {fmt(caixa.totalSaidas)}</span>
          </div>
          <Separator className="bg-border" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Saldo esperado em caixa</span>
            <span className="text-primary text-base">{fmt(saldoEsperado)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Devoluções do dia */}
      {devolucoesHoje.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-muted-foreground">
            Devoluções do dia ({devolucoesHoje.length})
          </p>
          <div className="mt-1.5 space-y-1">
            {devolucoesHoje.map((d) => (
              <div key={d.id} className="flex justify-between text-xs">
                <span className="font-mono text-muted-foreground">{d.id}</span>
                <Badge variant="outline" className="h-4 py-0 text-[10px]">
                  {fmt(d.creditIssued ?? 0)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiMini({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
