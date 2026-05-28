"use client"

import { useMemo } from "react"
import {
  Bot,
  Clock,
  MessageSquare,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react"
import { AlertRow, deriveInsights, HubStatCard } from "./agentic-ui"

export type InsightsConversation = {
  id: string
  contact: { displayName: string }
  unreadCount: number
  humanMode: boolean
  clienteId: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  status: string
  etiquetas?: { etiqueta: { nome: string } }[]
}

export function WhatsAppInsightsPanel({
  conversations,
  loading,
}: {
  conversations: InsightsConversation[]
  loading?: boolean
}) {
  const stats = useMemo(() => {
    const total = conversations.length
    const unread = conversations.reduce((s, c) => s + c.unreadCount, 0)
    const human = conversations.filter((c) => c.humanMode).length
    const registered = conversations.filter((c) => c.clienteId).length
    const withInsights = conversations.filter(
      (c) => deriveInsights(c).length > 0
    ).length
    const open = conversations.filter((c) => c.status === "open").length
    return { total, unread, human, registered, withInsights, open }
  }, [conversations])

  const alerts = useMemo(() => {
    const a: { type: "warn" | "info" | "danger"; text: string }[] = []
    conversations.forEach((c) => {
      const ins = deriveInsights(c)
      ins.forEach((i) => {
        if (i.variant === "risk")
          a.push({
            type: "danger",
            text: `${c.contact.displayName}: ${i.label}`,
          })
        if (i.variant === "priority" && c.unreadCount > 0)
          a.push({
            type: "warn",
            text: `${c.contact.displayName} — ${c.unreadCount} não lida(s)`,
          })
      })
    })
    return a.slice(0, 6)
  }, [conversations])

  const recent = conversations.slice(0, 6)

  if (loading) {
    return (
      <div className="grid gap-3 p-4 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-card h-24 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Painel operacional
        </h2>
        <p className="text-sm text-muted-foreground">
          Métricas calculadas em tempo real das conversas da loja ativa.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        <HubStatCard icon={MessageSquare} label="Conversas" value={stats.total} hint={`${stats.open} abertas`} />
        <HubStatCard icon={Clock} label="Não lidas" value={stats.unread} hint="Mensagens pendentes" trend={stats.unread > 0 ? "up" : "neutral"} />
        <HubStatCard icon={Bot} label="Modo humano" value={stats.human} hint="Requer atenção" />
        <HubStatCard icon={UserCheck} label="Cadastrados" value={stats.registered} hint="Vinculados ao CRM" />
        <HubStatCard icon={TrendingUp} label="Sinais heurísticos" value={stats.withInsights} hint="Regras sobre dados reais — não é LLM" />
        <HubStatCard icon={Users} label="Taxa vínculo" value={stats.total ? `${Math.round((stats.registered / stats.total) * 100)}%` : "—"} hint="Clientes vs contatos" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card rounded-xl p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Atividade recente
          </h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
          ) : (
            <div className="space-y-3">
              {recent.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {c.contact.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.contact.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessagePreview || "—"}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Alertas operacionais
          </h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum alerta crítico no momento.
            </p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <AlertRow key={i} type={a.type} text={a.text} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
