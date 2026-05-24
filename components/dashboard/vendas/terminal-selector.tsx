"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Monitor,
  Plus,
  Power,
  Check,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  listTerminais,
  criarTerminal,
  setTerminalStatus,
  type PdvTerminalDTO,
} from "@/app/actions/terminais"
import { type TerminalSnapshot } from "@/lib/pdv-terminal"

interface TerminalSelectorProps {
  storeId: string
  /** Chamado quando o operador seleciona um terminal ativo. */
  onSelected: (terminal: TerminalSnapshot) => void
  /**
   * Fallback para não bloquear a operação caso o backend de terminais esteja
   * indisponível (tabela não migrada / sem conexão). Quando ausente, o botão
   * "Continuar sem terminal" não é exibido.
   */
  onSkip?: () => void
  /** Código do terminal já selecionado (destaca o card atual). */
  selectedCode?: string | null
  className?: string
}

export function TerminalSelector({
  storeId,
  onSelected,
  onSkip,
  selectedCode,
  className,
}: TerminalSelectorProps) {
  const { toast } = useToast()
  const [terminais, setTerminais] = useState<PdvTerminalDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const sid = (storeId || "").trim()
    if (!sid) {
      setLoading(false)
      setError(true)
      return
    }
    setLoading(true)
    setError(false)
    try {
      const rows = await listTerminais(sid)
      setTerminais(rows)
      setError(rows.length === 0)
    } catch {
      setTerminais([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const handleSelecionar = (t: PdvTerminalDTO) => {
    onSelected({ id: t.id, code: t.code, name: t.name })
  }

  const handleAdicionar = async () => {
    setAdding(true)
    try {
      const res = await criarTerminal(storeId)
      if (res.ok && res.terminal) {
        toast({ title: "Terminal adicionado", description: `${res.terminal.name} criado.` })
        await carregar()
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível adicionar",
          description: res.error || "Tente novamente.",
        })
      }
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (t: PdvTerminalDTO) => {
    setBusyId(t.id)
    try {
      const next = t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
      const res = await setTerminalStatus(storeId, t.id, next)
      if (res.ok) {
        await carregar()
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível atualizar",
          description: res.error || "Tente novamente.",
        })
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
          <Monitor className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">Selecionar Terminal</h2>
          <p className="text-sm text-muted-foreground">
            Escolha em qual PDV este computador vai operar. Cada terminal tem caixa e
            vendas próprios.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando terminais…
        </div>
      ) : (
        <>
          {error && terminais.length === 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Terminais indisponíveis no momento
                </p>
                <p className="text-muted-foreground">
                  Não foi possível carregar os terminais desta loja. Você pode continuar
                  sem terminal — a operação não fica bloqueada.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {terminais.map((t) => {
              const ativo = t.status === "ACTIVE"
              const atual = selectedCode != null && t.code === selectedCode
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-card p-4 transition-colors min-w-0",
                    ativo ? "border-border" : "border-dashed border-border/70 opacity-70",
                    atual && "border-primary ring-1 ring-primary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Monitor
                      className={cn(
                        "h-5 w-5 shrink-0",
                        ativo ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    {ativo ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                      >
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.code}</p>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {ativo ? (
                      <Button
                        size="sm"
                        className="flex-1 font-semibold"
                        onClick={() => handleSelecionar(t)}
                      >
                        {atual ? (
                          <>
                            <Check className="mr-1 h-4 w-4" /> Atual
                          </>
                        ) : (
                          "Selecionar"
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={busyId === t.id}
                        onClick={() => void handleToggle(t)}
                      >
                        {busyId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Ativar"
                        )}
                      </Button>
                    )}
                    {ativo && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Desativar terminal"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        disabled={busyId === t.id}
                        onClick={() => void handleToggle(t)}
                      >
                        {busyId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => void handleAdicionar()}
              disabled={adding}
              className={cn(
                "flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60",
              )}
            >
              {adding ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Plus className="h-6 w-6" />
              )}
              <span className="text-sm font-medium">Adicionar terminal</span>
            </button>
          </div>

          {onSkip && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onSkip}
              >
                Continuar sem terminal
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
