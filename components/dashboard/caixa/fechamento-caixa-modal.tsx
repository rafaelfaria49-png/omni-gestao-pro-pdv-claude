"use client"

import { useState } from "react"
import {
  Lock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calculator,
  CheckCircle,
  AlertTriangle,
  Printer,
  Copy,
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

interface FechamentoCaixaModalProps {
  isOpen: boolean
  onClose: () => void
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

export function FechamentoCaixaModal({ isOpen, onClose }: FechamentoCaixaModalProps) {
  const { caixa, fecharCaixa, getSaldoAtual, sessaoId } = useCaixa()
  const { dailyLedger } = useOperationsStore()
  const { empresaDocumentos, lojaAtivaId } = useLojaAtiva()
  const { toast } = useToast()

  const [valorContado, setValorContado] = useState("")
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)

  const ledger = ensureLedger(dailyLedger)
  const userAudit = (empresaDocumentos.nomeFantasia || "").trim() || "Loja"

  const saldoEsperado = getSaldoAtual()
  const valorContadoNum = parseFloat(valorContado) || 0
  const diferenca = valorContadoNum - saldoEsperado
  const temDiferenca = valorContado !== "" && Math.abs(diferenca) > 0.01

  const buildResumoTexto = () => {
    const lines = [
      "=== FECHAMENTO DE CAIXA ===",
      `Loja: ${userAudit}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      "---",
      `Abertura:       ${fmt(caixa.saldoInicial)}`,
      `Entradas (vendas): ${fmt(caixa.totalEntradas)}`,
      `Saídas (sangrias): ${fmt(caixa.totalSaidas)}`,
      `Saldo esperado: ${fmt(saldoEsperado)}`,
      valorContado ? `Valor contado:  ${fmt(valorContadoNum)}` : "",
      temDiferenca ? `Diferença:      ${fmt(diferenca)}` : "",
      "---",
      `Din: ${fmt(ledger.vendasDinheiro)}  Pix: ${fmt(ledger.vendasPix)}`,
      `Débito: ${fmt(ledger.vendasCartaoDebito)}  Crédito: ${fmt(ledger.vendasCartaoCredito)}`,
      `Carnê: ${fmt(ledger.vendasCarne)}  Vale: ${fmt(ledger.vendasCreditoVale)}`,
      observacao ? `Obs: ${observacao}` : "",
      "==========================",
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
            <div className="space-y-6 pt-4">
              {/* Resumo do Dia */}
              <Card className="bg-secondary border-border">
                <CardContent className="pt-4 pb-4 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    Resumo do Caixa
                  </h3>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Abertura
                      </span>
                      <span className="font-medium">{fmt(caixa.saldoInicial)}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-green-400 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Entradas (Vendas)
                      </span>
                      <span className="font-medium text-green-500">
                        + {fmt(caixa.totalEntradas)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-red-400 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        Saídas (Sangrias)
                      </span>
                      <span className="font-medium text-red-500">
                        - {fmt(caixa.totalSaidas)}
                      </span>
                    </div>

                    <Separator className="bg-border" />

                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground">Saldo Esperado</span>
                      <span className="text-xl font-bold text-primary">{fmt(saldoEsperado)}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2 text-sm">
                    <p className="font-medium text-foreground">Entradas do dia (fechamento cego)</p>
                    <div className="grid grid-cols-1 gap-1.5 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Dinheiro</span>
                        <span className="text-foreground">{fmt(ledger.vendasDinheiro)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pix</span>
                        <span className="text-foreground">{fmt(ledger.vendasPix)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cartão débito</span>
                        <span className="text-foreground">{fmt(ledger.vendasCartaoDebito)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cartão crédito</span>
                        <span className="text-foreground">{fmt(ledger.vendasCartaoCredito)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Carnê</span>
                        <span className="text-foreground">{fmt(ledger.vendasCarne)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Crédito/Vale usado</span>
                        <span className="text-foreground">{fmt(ledger.vendasCreditoVale)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Input de Contagem */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Valor Contado em Caixa</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Digite o valor contado..."
                    value={valorContado}
                    onChange={(e) => setValorContado(e.target.value)}
                    className="pl-12 h-14 text-xl font-bold bg-secondary border-border"
                  />
                </div>
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
