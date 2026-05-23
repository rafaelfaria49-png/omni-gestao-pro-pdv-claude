"use client"

import { useMemo, useState } from "react"
import {
  Lock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Printer,
  Copy,
  Layers,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useCaixa } from "./caixa-provider"
import { ensureLedger, useOperationsStore } from "@/lib/operations-store"
import { appendAuditLog } from "@/lib/audit-log"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useToast } from "@/hooks/use-toast"
import { escapeHtml, openThermalHtmlPrint } from "@/lib/thermal-print"
import {
  computeFechamentoResumo,
  filterSalesDaSessao,
  type FechamentoResumo,
} from "@/lib/caixa-fechamento-resumo"

interface FechamentoCaixaModalProps {
  isOpen: boolean
  onClose: () => void
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

export function FechamentoCaixaModal({ isOpen, onClose }: FechamentoCaixaModalProps) {
  const { caixa, fecharCaixa, getSaldoAtual, sessaoId } = useCaixa()
  const { dailyLedger, sales } = useOperationsStore()
  const { empresaDocumentos, lojaAtivaId } = useLojaAtiva()
  const { toast } = useToast()

  const [valorContado, setValorContado] = useState("")
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)

  const ledger = ensureLedger(dailyLedger)
  const userAudit = (empresaDocumentos.nomeFantasia || "").trim() || "Loja"

  // Consolidação ERP a partir das vendas reais da sessão (mesma fonte sincronizada
  // ao banco). sangrias = caixa.totalSaidas; suprimentos = totalEntradas − Σ vendas.
  const resumo: FechamentoResumo = useMemo(() => {
    const sessionSales = filterSalesDaSessao(sales, {
      sessaoId,
      dataAbertura: caixa.dataAbertura,
    })
    const totalLiquidoSessao = sessionSales.reduce((s, v) => s + (v.total ?? 0), 0)
    const sangrias = caixa.totalSaidas
    const suprimentos = Math.max(0, caixa.totalEntradas - totalLiquidoSessao)
    return computeFechamentoResumo({
      sales: sessionSales,
      sangrias,
      suprimentos,
      saldoInicial: caixa.saldoInicial,
    })
  }, [sales, sessaoId, caixa.dataAbertura, caixa.totalSaidas, caixa.totalEntradas, caixa.saldoInicial])

  // Operadores (terminal) que registraram vendas na sessão — identidade local de auditoria.
  const operadoresSessao = useMemo(() => {
    const set = new Set<string>()
    for (const s of filterSalesDaSessao(sales, { sessaoId, dataAbertura: caixa.dataAbertura })) {
      if (s.cashierId) set.add(s.cashierId.slice(0, 8))
    }
    return Array.from(set)
  }, [sales, sessaoId, caixa.dataAbertura])

  // Saldo total movimentado (inclui pix/cartão) — mantém compatibilidade com getSaldoAtual.
  const saldoEsperado = getSaldoAtual()
  // Conferência de gaveta usa o DINHEIRO físico esperado (não inclui pix/cartão).
  const saldoDinheiroEsperado = resumo.saldoDinheiroEsperado
  const valorContadoNum = parseFloat(valorContado) || 0
  const diferenca = valorContadoNum - saldoDinheiroEsperado
  const temDiferenca = valorContado !== "" && Math.abs(diferenca) > 0.01

  const buildResumoTexto = () => {
    const pg = resumo.porPagamento
    const lines = [
      "==== FECHAMENTO DE CAIXA ====",
      `Loja: ${userAudit}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      sessaoId ? `Sessão: ${sessaoId}` : "",
      operadoresSessao.length ? `Operador(es): ${operadoresSessao.join(", ")}` : "",
      "--- VENDAS POR ORIGEM ---",
      ...resumo.porOrigem.map((o) => `${o.label.padEnd(20)} ${fmt(o.valorBruto)} (${o.qtdItens} itens)`),
      "--- FORMAS DE PAGAMENTO ---",
      `Dinheiro:   ${fmt(pg.dinheiro)}`,
      `Pix:        ${fmt(pg.pix)}`,
      `Débito:     ${fmt(pg.cartaoDebito)}`,
      `Crédito:    ${fmt(pg.cartaoCredito)}`,
      `Carnê:      ${fmt(pg.carne)}`,
      `A prazo:    ${fmt(pg.aPrazo)}`,
      `Vale/Créd.: ${fmt(pg.creditoVale)}`,
      "--- CONSOLIDAÇÃO ---",
      `Vendas (qtd):     ${resumo.qtdVendas}`,
      `Subtotal bruto:   ${fmt(resumo.subtotalBruto)}`,
      `Descontos:       -${fmt(resumo.descontos)}`,
      `Total líquido:    ${fmt(resumo.totalLiquido)}`,
      `Total recebido:   ${fmt(resumo.totalRecebido)}`,
      `A prazo (fiado):  ${fmt(resumo.aPrazo)}`,
      `Ticket médio:     ${fmt(resumo.ticketMedio)}`,
      "--- CAIXA (GAVETA) ---",
      `Abertura:         ${fmt(resumo.saldoInicial)}`,
      `(+) Dinheiro:     ${fmt(pg.dinheiro)}`,
      `(+) Suprimentos:  ${fmt(resumo.suprimentos)}`,
      `(-) Sangrias:     ${fmt(resumo.sangrias)}`,
      `= Saldo dinheiro: ${fmt(saldoDinheiroEsperado)}`,
      valorContado ? `Valor contado:    ${fmt(valorContadoNum)}` : "",
      temDiferenca ? `Diferença:        ${fmt(diferenca)}` : "",
      observacao ? `Obs: ${observacao}` : "",
      "=============================",
    ]
      .filter(Boolean)
      .join("\n")
    return lines
  }

  const handleImprimirRelatorio = () => {
    const inner = `
      <div style="text-align:center;font-weight:700">FECHAMENTO DE CAIXA</div>
      <div style="font-size:10px;text-align:center;margin:4px 0">${escapeHtml(userAudit)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:11px;margin:0">${escapeHtml(buildResumoTexto())}</pre>
    `
    openThermalHtmlPrint(inner, "Fechamento de caixa")
  }

  const handleCopiarRelatorio = async () => {
    try {
      await navigator.clipboard.writeText(buildResumoTexto())
      toast({ title: "Copiado", description: "Resumo do fechamento na área de transferência." })
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" })
    }
  }

  const handleFecharCaixa = async () => {
    // sid é mutável: pode ser atualizado pela criação retroativa abaixo
    let sid = sessaoId

    if (valorContado !== "" && temDiferenca) {
      appendAuditLog({
        action: "quebra_caixa",
        userLabel: `${userAudit} (fechamento)`,
        detail: `Esperado ${fmt(saldoEsperado)} | Contado ${fmt(valorContadoNum)} | Diferença ${fmt(diferenca)} | Dia: Din ${fmt(ledger.vendasDinheiro)} Pix ${fmt(ledger.vendasPix)} Déb ${fmt(ledger.vendasCartaoDebito)} Créd ${fmt(ledger.vendasCartaoCredito)} Carnê ${fmt(ledger.vendasCarne)} Vale ${fmt(ledger.vendasCreditoVale)}`,
      })
    }
    if (observacao.trim()) {
      appendAuditLog({
        action: "quebra_caixa",
        userLabel: `${userAudit} (fechamento)`,
        detail: `Obs: ${observacao.trim()}`,
      })
    }

    setSalvando(true)
    let serverPersisted = false

    try {
      // Se a abertura não criou sessão no servidor (ex.: estava offline),
      // tenta criar retroativamente para que o fechamento tenha um registro recuperável.
      if (!sid && lojaAtivaId) {
        try {
          const abrirRes = await fetch("/api/ops/caixa/abrir", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaAtivaId },
            body: JSON.stringify({
              saldoInicial: caixa.saldoInicial,
              observacao: "Sessão retroativa — abertura não foi registrada no servidor",
            }),
          })
          if (abrirRes.ok) {
            const abrirData = (await abrirRes.json()) as { sessaoId?: string }
            if (abrirData.sessaoId) sid = abrirData.sessaoId
          }
        } catch (err: unknown) {
          console.error("[caixa/fechar] criação retroativa falhou:", err)
        }
      }

      if (sid && lojaAtivaId) {
        const res = await fetch("/api/ops/caixa/fechar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaAtivaId },
          body: JSON.stringify({
            sessaoId: sid,
            saldoFinal: saldoEsperado,
            saldoContado: valorContado !== "" ? valorContadoNum : undefined,
            observacao: observacao.trim(),
            payload: {
              ledger,
              saldoInicial: caixa.saldoInicial,
              totalEntradas: caixa.totalEntradas,
              totalSaidas: caixa.totalSaidas,
              dataAberturaReal: caixa.dataAbertura?.toISOString() ?? null,
              // Consolidação ERP (por origem + por pagamento + totais) para o
              // comprovante de fechamento e futura impressão térmica. JSONB — sem schema novo.
              resumoFechamento: resumo,
              saldoDinheiroEsperado,
              operadores: operadoresSessao,
            },
          }),
        })
        if (res.ok) {
          serverPersisted = true
        } else {
          const errData = await res.json().catch(() => null) as { error?: string } | null
          console.error("[caixa/fechar] HTTP", res.status, errData?.error)
        }
      }
    } catch (err: unknown) {
      console.error("[caixa/fechar] rede:", err)
    } finally {
      setSalvando(false)
    }

    fecharCaixa()
    setValorContado("")
    setObservacao("")
    onClose()

    if (serverPersisted || !lojaAtivaId) {
      toast({ title: "Caixa fechado", description: "Sessão encerrada e registrada com sucesso." })
    } else {
      toast({
        variant: "destructive",
        title: "Caixa fechado localmente",
        description: "Sessão encerrada, mas não confirmada no servidor. Verifique a conexão.",
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-border bg-card p-0">
        <div className="flex max-h-[90vh] flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Lock className="h-6 w-6 text-red-500" />
              Fechamento de Caixa
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confira os valores e conte o dinheiro em caixa antes de fechar.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-4 pt-4">
              {/* Cabeçalho da sessão (operador / sessão / data) */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {sessaoId ? `Sessão ${sessaoId.slice(0, 12)}…` : "Sessão não registrada"}
                </span>
                <span className="truncate">
                  {operadoresSessao.length
                    ? `Operador: ${operadoresSessao.join(", ")}`
                    : "Operador: —"}
                </span>
              </div>

              {/* KPIs operacionais */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiMini label="Vendas" value={String(resumo.qtdVendas)} sub="quantidade" />
                <KpiMini label="Total líquido" value={fmt(resumo.totalLiquido)} accent="text-primary" />
                <KpiMini label="Recebido" value={fmt(resumo.totalRecebido)} accent="text-emerald-500" />
                <KpiMini label="Ticket médio" value={fmt(resumo.ticketMedio)} accent="text-sky-500" />
              </div>

              {/* Vendas por origem */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-2 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Layers className="h-4 w-4 text-primary" />
                    Vendas por origem
                  </h3>
                  {resumo.porOrigem.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma venda nesta sessão.</p>
                  ) : (
                    <div className="space-y-1.5 text-sm">
                      {resumo.porOrigem.map((o) => (
                        <div key={o.key} className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {o.label}
                            <span className="ml-1 text-xs text-muted-foreground/70">({o.qtdItens})</span>
                          </span>
                          <span className="font-medium text-foreground">{fmt(o.valorBruto)}</span>
                        </div>
                      ))}
                      <Separator className="bg-border" />
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>Subtotal bruto</span>
                        <span className="text-foreground">{fmt(resumo.subtotalBruto)}</span>
                      </div>
                      {resumo.descontos > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-amber-500">Descontos</span>
                          <span className="font-medium text-amber-500">- {fmt(resumo.descontos)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Formas de pagamento */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-2 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Formas de pagamento
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                    <PgtoRow label="Dinheiro" value={resumo.porPagamento.dinheiro} />
                    <PgtoRow label="Pix" value={resumo.porPagamento.pix} />
                    <PgtoRow label="Cartão débito" value={resumo.porPagamento.cartaoDebito} />
                    <PgtoRow label="Cartão crédito" value={resumo.porPagamento.cartaoCredito} />
                    <PgtoRow label="Carnê" value={resumo.porPagamento.carne} />
                    <PgtoRow label="A prazo (fiado)" value={resumo.porPagamento.aPrazo} />
                    <PgtoRow label="Crédito/Vale" value={resumo.porPagamento.creditoVale} />
                  </div>
                  <Separator className="bg-border" />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total das vendas</span>
                    <span className="text-primary">{fmt(resumo.porPagamento.total)}</span>
                  </div>
                  {resumo.qtdVendasMultiplas > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {resumo.qtdVendasMultiplas} venda(s) com múltiplas formas de pagamento.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Caixa (gaveta) — conferência de dinheiro físico */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-3 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Wallet className="h-4 w-4 text-primary" />
                    Caixa (gaveta) — dinheiro físico
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Abertura</span>
                      <span className="font-medium text-foreground">{fmt(resumo.saldoInicial)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-500">+ Dinheiro (vendas)</span>
                      <span className="font-medium text-emerald-500">+ {fmt(resumo.porPagamento.dinheiro)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-500 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />+ Suprimentos
                      </span>
                      <span className="font-medium text-emerald-500">+ {fmt(resumo.suprimentos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rose-500 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" />- Sangrias
                      </span>
                      <span className="font-medium text-rose-500">- {fmt(resumo.sangrias)}</span>
                    </div>
                    <Separator className="bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Saldo esperado em dinheiro</span>
                      <span className="text-xl font-bold text-primary">{fmt(saldoDinheiroEsperado)}</span>
                    </div>
                  </div>
                  <p className="rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    Saldo total movimentado (inclui pix/cartão): {fmt(saldoEsperado)}
                  </p>
                </CardContent>
              </Card>

              {/* Input de Contagem */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Dinheiro contado na gaveta</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Digite o dinheiro contado..."
                    value={valorContado}
                    onChange={(e) => setValorContado(e.target.value)}
                    className="pl-12 h-14 text-xl font-bold bg-secondary border-border"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Conferência contra o saldo esperado em dinheiro ({fmt(saldoDinheiroEsperado)}). Pix/cartão não entram na gaveta.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Observação (opcional)</Label>
                <Input
                  placeholder="Ex.: Conferido por supervisor, sangria realizada..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="h-11 bg-secondary border-border"
                />
              </div>

              {/* Status da Conferência */}
              {valorContado !== "" && (
                <Card
                  className={`border ${temDiferenca ? "bg-amber-500/10 border-amber-500/30" : "bg-green-500/10 border-green-500/30"}`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {temDiferenca ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        <span className={temDiferenca ? "text-amber-500" : "text-green-500"}>
                          {temDiferenca ? "Diferença Encontrada" : "Conferência OK"}
                        </span>
                      </div>
                      {temDiferenca && (
                        <span
                          className={`font-bold ${diferenca > 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {diferenca > 0 ? "+" : ""}
                          {fmt(diferenca)}
                        </span>
                      )}
                    </div>
                    {temDiferenca && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {diferenca > 0
                          ? "Há dinheiro a mais no caixa. Verifique se houve entrada não registrada."
                          : "Há dinheiro faltando no caixa. Verifique se houve saída não registrada."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 shrink-0 border-t border-border bg-card px-6 py-4">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="h-12 flex-1 border-border gap-2"
                  onClick={handleImprimirRelatorio}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir relatório
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex-1 border-border gap-2"
                  onClick={() => void handleCopiarRelatorio()}
                >
                  <Copy className="h-4 w-4" />
                  Copiar resumo
                </Button>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 flex-1 border-border"
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleFecharCaixa}
                  disabled={salvando}
                  className="h-12 flex-1 bg-red-500 font-semibold hover:bg-red-600"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  {salvando ? "Salvando..." : "Confirmar Fechamento"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KpiMini({
  label,
  value,
  sub,
  accent = "text-foreground",
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PgtoRow({ label, value }: { label: string; value: number }) {
  const fmtRow = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={value > 0 ? "font-medium text-foreground" : "text-muted-foreground/50"}>
        {fmtRow}
      </span>
    </div>
  )
}
