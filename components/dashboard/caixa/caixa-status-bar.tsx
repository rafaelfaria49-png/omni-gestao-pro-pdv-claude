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
        <div
          className={cn(
            "bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4",
            variant === "pdv" && "rounded-none border-x-0 border-t-0 mb-0 px-2 py-2.5 sm:px-3"
          )}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-amber-500">Caixa Fechado</span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
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
      <div
        className={cn(
          "bg-green-500/10 border border-green-500/30 rounded-lg mb-4 overflow-hidden",
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
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
              <Unlock className="w-5 h-5 text-green-500" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-green-500">Caixa Aberto</span>
                <Badge variant="outline" className="text-xs border-green-500/50 text-green-500 shrink-0">
                  <Clock className="w-3 h-3 mr-1" />
                  Desde {formatTime(caixa.dataAbertura)}
                </Badge>
                {terminalPill}
              </div>
              <p className="text-sm text-muted-foreground">Pronto para vendas</p>
            </div>
          </div>

          <div className="flex flex-wrap items-stretch justify-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg min-w-0">
              <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-muted-foreground">Abertura</p>
                <p className="font-semibold text-sm truncate">{formatCurrency(caixa.saldoInicial)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg min-w-0">
              <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-green-400">Entradas</p>
                <p className="font-semibold text-sm text-green-500 truncate">{formatCurrency(caixa.totalEntradas)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg min-w-0">
              <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
              <div className="text-right min-w-0">
                <p className="text-xs text-red-400">Saidas</p>
                <p className="font-semibold text-sm text-red-500 truncate">{formatCurrency(caixa.totalSaidas)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg min-w-0">
              <div className="text-right min-w-0">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Saldo Atual</p>
                <p className="font-bold text-lg text-emerald-500 truncate">{formatCurrency(getSaldoAtual())}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOperationType("sangria")}
              className="border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white"
            >
              <TrendingDown className="w-4 h-4 mr-1.5" />
              Sangria
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOperationType("suprimento")}
              className="border-green-500/40 text-green-600 hover:bg-green-500 hover:text-white dark:text-green-400"
            >
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Suprimento
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFechamento(true)}
              className="border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white"
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
                {opSaving ? "Registrando…" : `Confirmar ${opLabel}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
