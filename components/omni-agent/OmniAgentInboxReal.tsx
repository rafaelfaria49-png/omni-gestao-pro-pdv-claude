"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { OmniAgentCommandDTO } from "@/app/actions/omni-agent"
import {
  confirmOmniAgentCommand,
  listOmniAgentCommands,
  rejectOmniAgentCommand,
} from "@/app/actions/omni-agent"
import { Check, X, RefreshCw } from "lucide-react"

type Props = {
  storeId: string
  logAudit: (m: string) => void
  onPendingChange?: (n: number) => void
  /** Chamado após carregar / confirmar / recusar — para sincronizar feed e stats no Hub. */
  onCommandsChanged?: () => void
}

function statusLabel(s: OmniAgentCommandDTO["status"]): string {
  switch (s) {
    case "PENDENTE":
      return "pendente"
    case "AGUARDANDO_CONFIRMACAO":
      return "aguardando confirmação"
    case "EXECUTADO":
      return "executado"
    case "ERRO":
      return "erro"
    default:
      return s
  }
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
          ? "Executado"
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

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "PENDENTE", "AGUARDANDO_CONFIRMACAO", "EXECUTADO", "ERRO"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "Todos" : statusLabel(f)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {counts.PENDENTE} pendentes · {counts.AGUARDANDO_CONFIRMACAO} aguardando confirmação · {counts.EXECUTADO} executados ·{" "}
          {counts.ERRO} erros
        </p>
      </Card>

      {visible.map((i) => (
        <Card key={i.id} className="p-4 space-y-2">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-medium break-words">{i.interpretacao.action}</div>
              <div className="text-xs text-muted-foreground">Original: &quot;{i.comandoOriginal}&quot;</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{i.interpretacao.intent}</Badge>
                <Badge variant="secondary">{Math.round(i.interpretacao.confidence * 100)}%</Badge>
                <Badge variant={i.status === "EXECUTADO" ? "default" : i.status === "ERRO" ? "destructive" : "secondary"}>
                  {statusLabel(i.status)}
                </Badge>
                <span className="text-muted-foreground">{new Date(i.createdAt).toLocaleString("pt-BR")}</span>
              </div>
            </div>
            {(i.status === "PENDENTE" || i.status === "AGUARDANDO_CONFIRMACAO") && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void onConfirm(i.id)} disabled={busy === i.id}>
                  <Check className="h-4 w-4 mr-1" />
                  {i.status === "PENDENTE" ? "Interpretar e executar" : "Confirmar execução"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void onReject(i.id)} disabled={busy === i.id}>
                  <X className="h-4 w-4 mr-1" />
                  Recusar
                </Button>
              </div>
            )}
          </div>

          {ambiguous(i) && i.status === "AGUARDANDO_CONFIRMACAO" && (
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="text-xs font-medium">Escolha o cliente:</div>
              <div className="flex flex-wrap gap-2">
                {ambiguous(i)!.map((c) => (
                  <Button key={c.id} size="sm" variant="outline" disabled={busy === i.id} onClick={() => void onConfirm(i.id, c.id)}>
                    {c.nome} · {c.telefone}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
            <div className="font-medium text-muted-foreground">Interpretação (campos)</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.entries(i.interpretacao.fields).map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground capitalize">{k}:</span> <span className="font-medium">{v || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {i.resultado && (
            <div className="rounded-md border border-border p-2 text-xs max-h-48 overflow-y-auto">
              <div className="font-medium mb-1">Resultado / ação executada</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">{JSON.stringify(i.resultado, null, 2)}</pre>
            </div>
          )}
        </Card>
      ))}

      {!loading && visible.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground text-center">Nenhum comando registado. Use &quot;Novo&quot; ou os exemplos de teste.</Card>
      )}
    </div>
  )
}
