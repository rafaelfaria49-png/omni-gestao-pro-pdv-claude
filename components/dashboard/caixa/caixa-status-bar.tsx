"use client"

import { useEffect, useState } from "react"
import {
  Lock,
  Unlock,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Monitor,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCaixa } from "./caixa-provider"
import { AberturaCaixaModal } from "./abertura-caixa-modal"
import { FechamentoCaixaModal } from "./fechamento-caixa-modal"
import { CaixaDashboard } from "./caixa-dashboard"
import { cn } from "@/lib/utils"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useTerminalAtivo } from "@/lib/pdv-terminal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { appendAuditLog } from "@/lib/audit-log"
import { useOperationsStore } from "@/lib/operations-store"
import { PdvPendingSyncBadge } from "@/components/dashboard/vendas/pdv-pending-sync-badge"

interface CaixaStatusBarProps {
  /** Incrementado por comando de voz para abrir o fluxo de abertura de caixa. */
  openAberturaSignal?: number
  onOpenAberturaSignalConsumed?: () => void
  /** Incrementado pelo PDV (menu Operações) para abrir o fechamento sem passar pelo diálogo genérico. */
  openFechamentoSignal?: number
  onOpenFechamentoSignalConsumed?: () => void
  /** PDV: encosta na largura útil, sem margem inferior nem cantos que “encolhem” a mesa. */
  variant?: "default" | "pdv"
}

export function CaixaStatusBar({
  openAberturaSignal = 0,
  onOpenAberturaSignalConsumed,
  openFechamentoSignal = 0,
  onOpenFechamentoSignalConsumed,
  variant = "default",
}: CaixaStatusBarProps) {
  const { caixa, getSaldoAtual, sessaoId } = useCaixa()
  const { registrarOperacaoCaixa } = useOperationsStore()
  const { lojaAtivaId } = useLojaAtiva()
  const { terminal, clear: clearTerminal } = useTerminalAtivo(lojaAtivaId)
  const { toast } = useToast()
  const [showAbertura, setShowAbertura] = useState(false)
  const [showFechamento, setShowFechamento] = useState(false)

  // Sangria/Suprimento acessível em TODOS os PDVs — a barra é compartilhada
  // (Clássico, Rápido/Supermercado, Assistência, Venda Completa). Reusa o mesmo
  // endpoint idempotente com retry (`registrarOperacaoCaixaServer`).
  const [operationType, setOperationType] = useState<"sangria" | "suprimento" | null>(null)
  const [opValor, setOpValor] = useState("")
  const [opMotivo, setOpMotivo] = useState("")
  const [opSaving, setOpSaving] = useState(false)
  const opLabel = operationType === "sangria" ? "Sangria" : "Suprimento"

  const closeOp = () => {
    setOperationType(null)
    setOpValor("")
    setOpMotivo("")
  }

  const confirmOp = async () => {
    const tipo = operationType
    if (!tipo) return
    const valor = parseFloat(opValor.replace(",", ".")) || 0
    const motivo = opMotivo.trim()
    if (valor <= 0) {
      toast({ variant: "destructive", title: "Valor inválido", description: "Informe um valor maior que zero." })
      return
    }
    if (!motivo) {
      toast({ variant: "destructive", title: "Motivo obrigatório", description: "Descreva o motivo da operação." })
      return
    }
    const label = tipo === "sangria" ? "Sangria" : "Suprimento"
    setOpSaving(true)
    appendAuditLog({
      action: tipo === "sangria" ? "sangria_caixa" : "suprimento_caixa",
      userLabel: terminal?.code || "Caixa",
      detail: `R$ ${valor.toFixed(2)} — ${motivo}`,
    })
    try {
      if (lojaAtivaId && sessaoId) {
        const localId = `caixaop:${sessaoId}:${tipo}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
        const r = await registrarOperacaoCaixa({
          sessaoId,
          tipo,
          valor,
          motivo,
          localId,
          operador: terminal?.code || "",
        })
        if (r.ok) {
          toast({
            title: tipo === "sangria" ? "Sangria registrada" : "Suprimento registrado",
            description: `R$ ${valor.toFixed(2)} — ${motivo}`,
          })
        } else {
          toast({
            variant: "destructive",
            title: `${label} não confirmada no servidor`,
            description:
              r.reason === "client_error"
                ? "Aplicada apenas no caixa local. Verifique antes de fechar o caixa."
                : "Sem sucesso após várias tentativas. Só no caixa local — reenvie antes de fechar.",
          })
        }
      } else {
        // Sem sessão confirmada no servidor: não silenciar (mesma regra do Clássico).
        toast({
          variant: "destructive",
          title: `${label} só no caixa local`,
          description: "Caixa sem sessão confirmada no servidor. Reabra o caixa para registrar com segurança.",
        })
      }
    } finally {
      setOpSaving(false)
      closeOp()
    }
  }

  const terminalPill = terminal ? (
    <Badge variant="outline" className="shrink-0 text-xs">
      <Monitor className="mr-1 h-3 w-3" />
      {terminal.code || terminal.name}
    </Badge>
  ) : null

  useEffect(() => {
    if (!openAberturaSignal) return
    if (!caixa.isOpen) {
      setShowAbertura(true)
    }
    onOpenAberturaSignalConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sinal é um contador; callback opcional
  }, [openAberturaSignal, caixa.isOpen])

  useEffect(() => {
    if (!openFechamentoSignal) return
    if (caixa.isOpen) {
      setShowFechamento(true)
    }
    onOpenFechamentoSignalConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFechamentoSignal, caixa.isOpen])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  const formatTime = (date: Date | null) => {
    if (!date) return "--:--"
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  }

  if (!caixa.isOpen) {
    return (
      <>
        <PdvPendingSyncBadge className={cn("mb-2", variant === "pdv" && "mx-2 mt-2")} />
        <div
          className={cn(
            "bg-warning/10 border border-warning/30 rounded-lg p-4 mb-4",
            variant === "pdv" && "rounded-none border-x-0 border-t-0 mb-0 px-2 py-2.5 sm:px-3"
          )}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-warning">Caixa Fechado</span>
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  {terminalPill}
                  {terminal && (
                    <button
                      type="button"
                      onClick={() => clearTerminal()}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Trocar
                    </button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">Abra o caixa para realizar vendas</p>
              </div>
            </div>
            <Button onClick={() => setShowAbertura(true)} className="bg-primary hover:bg-primary/90 font-semibold">
              <Unlock className="w-4 h-4 mr-2" />
              Abrir Caixa
            </Button>
          </div>
        </div>

        <AberturaCaixaModal isOpen={showAbertura} onClose={() => setShowAbertura(false)} />
      </>
    )
  }

  return (
    <>
      <PdvPendingSyncBadge className={cn("mb-2", variant === "pdv" && "mx-2 mt-2")} />
      <div
        className={cn(
          "bg-success/10 border border-success/30 rounded-lg mb-4 overflow-hidden",
          variant === "pdv" && "rounded-none border-x-0 border-t-0 mb-0"
        )}
      >
        <CaixaDashboard />
        <div
          className={cn(
            "flex flex-col lg:flex-row items-center justify-between gap-4 p-4",
            variant === "pdv" && "px-2 py-2.5 sm:px-3"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center shrink-0">
              <Unlock className="w-5 h-5 text-success" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-success">Caixa Aberto</span>
                <Badge variant="outline" className="text-xs border-success/30 bg-success/5 text-success shrink-0">
                  <Clock className="w-3 h-3 mr-1" />
                  Desde {formatTime(caixa.dataAbertura)}
                </Badge>
                {terminalPill}
              </div>
              <p className="text-sm text-muted-foreground">Pronto para vendas</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg min-w-0">
              <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-muted-foreground">Abertura</p>
                <p className="font-semibold text-sm truncate">{formatCurrency(caixa.saldoInicial)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-success/10 rounded-lg min-w-0">
              <TrendingUp className="w-4 h-4 text-success shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-success/80 dark:text-success/70">Entradas</p>
                <p className="font-semibold text-sm text-success truncate">{formatCurrency(caixa.totalEntradas)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-lg min-w-0">
              <TrendingDown className="w-4 h-4 text-destructive shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-destructive/80 dark:text-destructive/70">Saídas</p>
                <p className="font-semibold text-sm text-destructive truncate">{formatCurrency(caixa.totalSaidas)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-success/15 border border-success/30 rounded-lg min-w-0">
              <div className="text-right min-w-0">
                <p className="text-xs text-success/90 dark:text-success">Saldo Atual</p>
                <p className="font-bold text-lg text-success truncate">{formatCurrency(getSaldoAtual())}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOperationType("sangria")}
              disabled={opSaving || showFechamento}
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <TrendingDown className="w-4 h-4 mr-1.5" />
              Sangria
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOperationType("suprimento")}
              disabled={opSaving || showFechamento}
              className="border-success/40 text-success hover:bg-success hover:text-success-foreground transition-colors"
            >
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Suprimento
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFechamento(true)}
              disabled={opSaving || showFechamento}
              className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <Lock className="w-4 h-4 mr-2" />
              Fechar Caixa
            </Button>
          </div>
        </div>
      </div>

      <FechamentoCaixaModal isOpen={showFechamento} onClose={() => setShowFechamento(false)} />

      {/* Sangria / Suprimento — disponível em todos os PDVs via barra compartilhada */}
      <Dialog open={operationType !== null} onOpenChange={(open) => { if (!open) closeOp() }}>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>{opLabel} de Caixa</DialogTitle>
            <DialogDescription>
              {operationType === "sangria"
                ? "Retirada de dinheiro do caixa."
                : "Entrada de dinheiro (reforço) no caixa."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Valor</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={opValor}
                onChange={(e) => setOpValor(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Motivo</Label>
              <Input
                placeholder={operationType === "sangria" ? "Ex.: retirada para o banco" : "Ex.: troco / reforço"}
                value={opMotivo}
                onChange={(e) => setOpMotivo(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeOp} disabled={opSaving}>
                Cancelar
              </Button>
              <Button onClick={() => void confirmOp()} disabled={opSaving}>
                {opSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando…
                  </>
                ) : (
                  `Confirmar ${opLabel}`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
