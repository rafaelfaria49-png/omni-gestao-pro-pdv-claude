"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ArrowRight, Edit, Zap } from "lucide-react"
import { PremiumEmptyState } from "./agentic-ui"
import Link from "next/link"

type Automation = {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: string
  action: string
  lastRun: string
  runs: number
  deliveryLabel?: string
  sendsMeta?: boolean
}

const TRIGGER_LABELS: Record<string, string> = {
  new_contact: "Novo contato",
  keyword: "Palavra-chave",
  os_created: "OS criada",
  os_status_changed: "OS mudou status",
  budget_approved: "Orçamento aprovado",
  os_ready: "OS pronta",
  payment_pending: "Pagamento pendente",
  no_reply: "Sem resposta",
}

const ACTION_LABELS: Record<string, string> = {
  send_message: "Enviar mensagem",
  create_os: "Criar OS",
  notify_team: "Notificar equipe",
  move_funnel: "Mover no funil",
  send_payment_link: "Link de pagamento",
  send_warranty: "Enviar garantia",
}

export function WhatsAppAutomationsPanel({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!apiHeaders) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/automations", { headers: apiHeaders })
      const data = (await res.json()) as { ok?: boolean; automations?: Record<string, unknown>[] }
      if (data.ok && Array.isArray(data.automations)) {
        const mapped: Automation[] = data.automations.map((a) => {
          const acts =
            a.actions && typeof a.actions === "object" && !Array.isArray(a.actions)
              ? (a.actions as Record<string, unknown>)
              : {}
          return {
            id: String(a.id ?? ""),
            name: String(a.name ?? ""),
            description: String(acts.description ?? ""),
            enabled: Boolean(a.enabled),
            trigger: String(a.triggerType ?? "keyword"),
            action: String(acts.type ?? "send_message"),
            lastRun: String(acts.lastRun ?? "—"),
            runs: typeof acts.runs === "number" ? acts.runs : 0,
            deliveryLabel:
              typeof a.deliveryLabel === "string" ? a.deliveryLabel : undefined,
            sendsMeta: a.sendsMeta === true,
          }
        })
        setAutomations(mapped)
      }
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [apiHeaders])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(a: Automation) {
    if (!apiHeaders) return
    const next = !a.enabled
    setAutomations((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, enabled: next } : x))
    )
    try {
      const res = await fetch(`/api/whatsapp/automations/${a.id}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ enabled: next }),
      })
      const j = (await res.json()) as { ok?: boolean }
      if (!j.ok) throw new Error("fail")
    } catch {
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, enabled: !next } : x))
      )
    }
  }

  if (!apiHeaders) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Selecione uma loja ativa.</p>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (automations.length === 0) {
    return (
      <PremiumEmptyState
        icon={Zap}
        title="Nenhuma automação configurada"
        description="Crie fluxos no HUB operacional (aba Automações) ou aguarde templates da loja."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/whatsapp">Abrir HUB operacional</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Automações</h2>
          <p className="text-sm text-muted-foreground">
            {automations.filter((a) => a.enabled).length} ativas de {automations.length}
            {" · "}
            Automações de evento registram histórico interno — não enviam WhatsApp Meta ao cliente.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/whatsapp-automation">Ferramentas admin (legado)</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {automations.map((a) => (
          <div
            key={a.id}
            className="glass-card flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl p-4 transition-colors hover:border-primary/25"
          >
            <div className="flex items-center gap-3 flex-none">
              <Switch checked={a.enabled} onCheckedChange={() => void toggle(a)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <span className="text-sm text-foreground">{a.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {TRIGGER_LABELS[a.trigger] ?? a.trigger}
                </Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {ACTION_LABELS[a.action] ?? a.action}
                </Badge>
                {a.deliveryLabel ? (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300 shrink-0">
                    {a.deliveryLabel}
                  </Badge>
                ) : null}
              </div>
              {a.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Última execução: {a.lastRun} · {a.runs} disparos
              </p>
            </div>
            <div className="flex items-center gap-3 flex-none sm:ml-auto justify-between sm:justify-start">
              <Badge variant={a.enabled ? "default" : "outline"} className="shrink-0">
                {a.enabled ? "Ativa" : "Pausada"}
              </Badge>
              <Button variant="ghost" size="sm" disabled className="h-8 text-xs shrink-0" title="Em breve">
                <Edit className="mr-1 h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
