"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { OmniAgentCommandDTO } from "@/app/actions/omni-agent"
import { canalDisplayLabel } from "@/lib/omni-agent/hub-display"
import {
  confirmOmniAgentCommand,
  listOmniAgentCommands,
  rejectOmniAgentCommand,
} from "@/app/actions/omni-agent"
import { Check, X, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, Inbox } from "lucide-react"

type Props = {
  storeId: string
  logAudit: (m: string) => void
  onPendingChange?: (n: number) => void
  /** Chamado após carregar / confirmar / recusar — para sincronizar feed e stats no Hub. */
  onCommandsChanged?: () => void
}

const STATUS_META = {
  PENDENTE: {
    label: "Pendente",
    badgeVariant: "secondary" as const,
    borderClass: "border-l-amber-500",
    icon: Clock,
    iconClass: "text-amber-500 dark:text-amber-400",
  },
  AGUARDANDO_CONFIRMACAO: {
    label: "Ag. confirmação",
    badgeVariant: "secondary" as const,
    borderClass: "border-l-blue-500",
    icon: AlertTriangle,
    iconClass: "text-blue-500 dark:text-blue-400",
  },
  EXECUTADO: {
    label: "Executado",
    badgeVariant: "default" as const,
    borderClass: "border-l-emerald-500",
    icon: CheckCircle2,
    iconClass: "text-emerald-500 dark:text-emerald-400",
  },
  ERRO: {
    label: "Erro",
    badgeVariant: "destructive" as const,
    borderClass: "border-l-destructive",
    icon: XCircle,
    iconClass: "text-destructive",
  },
} as const

function InboxSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="border-l-4 border-l-muted p-4">
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-20 rounded bg-muted animate-pulse" />
              <div className="h-5 w-12 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function OmniAgentInboxReal({ storeId, logAudit, onPendingChange, onCommandsChanged }: Props) {
  const [items, setItems] = useState<OmniAgentCommandDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | OmniAgentCommandDTO["status"]>("all")
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const rows = await listOmniAgentCommands(storeId)
      setItems(rows)
      onPendingChange?.(rows.filter((r) => r.status === "PENDENTE" || r.status === "AGUARDANDO_CONFIRMACAO").length)
      onCommandsChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar inbox")
    } finally {
      setLoading(false)
    }
  }, [storeId, onPendingChange, onCommandsChanged])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onConfirm(id: string, clienteId?: string) {
    setBusy(id)
    try {
      const row = await confirmOmniAgentCommand(id, storeId, clienteId ? { clienteId } : undefined)
      setItems((prev) => prev.map((x) => (x.id === id ? row : x)))
      logAudit(`Omni Agent executado: ${id}`)
      toast.success(
        row.status === "EXECUTADO"
          ? row.interpretacao.intent === "EXPENSE_CREATE"
            ? "Despesa lançada no financeiro."
            : "Executado"
          : row.status === "AGUARDANDO_CONFIRMACAO"
            ? "Escolha o cliente"
            : "Concluído com aviso",
      )
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar")
    } finally {
      setBusy(null)
    }
  }

  async function onReject(id: string) {
    setBusy(id)
    try {
      const row = await rejectOmniAgentCommand(id, storeId)
      setItems((prev) => prev.map((x) => (x.id === id ? row : x)))
      logAudit(`Omni Agent recusado: ${id}`)
      toast.success("Recusado")
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recusar")
    } finally {
      setBusy(null)
    }
  }

  const counts = {
    PENDENTE: items.filter((i) => i.status === "PENDENTE").length,
    AGUARDANDO_CONFIRMACAO: items.filter((i) => i.status === "AGUARDANDO_CONFIRMACAO").length,
    EXECUTADO: items.filter((i) => i.status === "EXECUTADO").length,
    ERRO: items.filter((i) => i.status === "ERRO").length,
  }

  let visible = filter === "all" ? items : items.filter((i) => i.status === filter)
  visible = [...visible].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const ambiguous = (row: OmniAgentCommandDTO) => {
    const amb = row.resultado?.ambiguousClientes
    return Array.isArray(amb) ? (amb as { id: string; nome: string; telefone: string }[]) : null
  }

  const FILTERS = [
    { key: "all" as const, label: "Todos", count: items.length },
    { key: "PENDENTE" as const, label: "Pendentes", count: counts.PENDENTE },
    { key: "AGUARDANDO_CONFIRMACAO" as const, label: "Aguardando", count: counts.AGUARDANDO_CONFIRMACAO },
    { key: "EXECUTADO" as const, label: "Executados", count: counts.EXECUTADO },
    { key: "ERRO" as const, label: "Erros", count: counts.ERRO },
  ]

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {f.label}
              {f.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    filter === f.key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-8 gap-1.5"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline text-xs">Atualizar</span>
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <InboxSkeleton />
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-muted p-3">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {filter === "all"
                ? "Inbox vazia"
                : `Nenhum item "${FILTERS.find((f) => f.key === filter)?.label}"`}
            </div>
            <div className="text-xs text-muted-foreground">
              {filter === "all"
                ? 'Use "Novo" ou os exemplos de teste para criar comandos.'
                : "Tente outro filtro."}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((i) => {
            const meta = STATUS_META[i.status] ?? STATUS_META.PENDENTE
            const StatusIcon = meta.icon
            const isBusy = busy === i.id
            return (
              <Card key={i.id} className={cn("border-l-4 p-4 transition-all", meta.borderClass)}>
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClass)} />
                      <div className="min-w-0">
                        <div className="font-medium leading-snug break-words">{i.interpretacao.action}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          &quot;{i.comandoOriginal}&quot;
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {canalDisplayLabel(i.canal)}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {i.interpretacao.intent}
                      </Badge>
                      <Badge variant="secondary" className="tabular-nums text-[10px]">
                        {Math.round(i.interpretacao.confidence * 100)}%
                      </Badge>
                      <span className="self-center text-muted-foreground">
                        {new Date(i.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  {(i.status === "PENDENTE" || i.status === "AGUARDANDO_CONFIRMACAO") && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void onConfirm(i.id)}
                        disabled={isBusy}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {i.status === "PENDENTE" ? "Executar" : "Confirmar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => void onReject(i.id)}
                        disabled={isBusy}
                      >
                        <X className="h-3.5 w-3.5" />
                        Recusar
                      </Button>
                    </div>
                  )}
                </div>

                {ambiguous(i) && i.status === "AGUARDANDO_CONFIRMACAO" && (
                  <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Confirme o cliente:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ambiguous(i)!.map((c) => (
                        <Button
                          key={c.id}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={isBusy}
                          onClick={() => void onConfirm(i.id, c.id)}
                        >
                          {c.nome} · {c.telefone}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {i.interpretacao.intent === "EXPENSE_CREATE" && (
                  <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-xs">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
                      Pré-visualização — saída financeira
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {Number(i.interpretacao.fields.valor || 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </div>
                    <div className="mt-0.5 font-medium text-foreground">
                      {i.interpretacao.fields.descricao || "—"}
                    </div>
                    {i.interpretacao.fields.categoria ? (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {i.interpretacao.fields.categoria}
                      </Badge>
                    ) : null}
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      Ao confirmar, será criada uma movimentação real (tipo saída) nesta unidade. Sem
                      autoexecução.
                    </p>
                  </div>
                )}

                <div className="mt-3 rounded-md bg-muted/40 px-3 py-2.5 text-xs">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Campos interpretados
                  </div>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {Object.entries(i.interpretacao.fields).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <span className="shrink-0 capitalize text-muted-foreground">{k}:</span>
                        <span className="truncate font-medium">{v || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {i.resultado && (
                  <div className="mt-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Resultado
                    </div>
                    <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(i.resultado, null, 2)}
                    </pre>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
