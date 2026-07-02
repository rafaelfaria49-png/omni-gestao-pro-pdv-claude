"use client"

import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  FolderKanban,
  Hash,
  Inbox,
  LineChart,
  Megaphone,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  Shuffle,
  Sparkles,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox"
import { WhatsAppInsightsPanel } from "@/components/whatsapp/WhatsAppInsightsPanel"
import { WhatsAppIaPanel } from "@/components/whatsapp/WhatsAppIaPanel"
import { WhatsAppAutomationsPanel } from "@/components/whatsapp/WhatsAppAutomationsPanel"
import { WhatsAppRespostasRapidasPanel } from "@/components/whatsapp/WhatsAppRespostasRapidasPanel"
import { WhatsAppHandoffPanel } from "@/components/whatsapp/WhatsAppHandoffPanel"
import { WhatsAppTemplatesPanel } from "@/components/whatsapp/WhatsAppTemplatesPanel"
import { WhatsAppCatalogoPanel } from "@/components/whatsapp/WhatsAppCatalogoPanel"
import { WhatsAppCampanhasPanel } from "@/components/whatsapp/WhatsAppCampanhasPanel"
import { WhatsAppLogsPanel } from "@/components/whatsapp/WhatsAppLogsPanel"
import { WhatsAppMetricasPanel } from "@/components/whatsapp/WhatsAppMetricasPanel"
import { WhatsAppConfiguracoesPanel } from "@/components/whatsapp/WhatsAppConfiguracoesPanel"
import { PreviewBadge, ComingSoonBadge } from "@/components/whatsapp/whatsapp-preview-ui"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { cn } from "@/lib/utils"

type SectionId =
  | "visao-geral"
  | "inbox"
  | "handoff"
  | "automacoes"
  | "respostas-rapidas"
  | "regras-ia"
  | "templates"
  | "catalogo"
  | "campanhas"
  | "logs"
  | "metricas"
  | "configuracoes"

type NavItem = {
  id: SectionId
  label: string
  icon: LucideIcon
  badge?: "preview" | "em-breve" | "unread"
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Atendimento",
    items: [
      { id: "visao-geral", label: "Visão Geral", icon: BarChart3 },
      { id: "inbox", label: "Caixa de Entrada", icon: Inbox, badge: "unread" },
      { id: "handoff", label: "Handoff", icon: Shuffle, badge: "preview" },
    ],
  },
  {
    label: "Automação & IA",
    items: [
      { id: "automacoes", label: "Automações", icon: Zap },
      { id: "respostas-rapidas", label: "Respostas Rápidas", icon: Hash },
      { id: "regras-ia", label: "Regras de IA", icon: Sparkles, badge: "preview" },
      { id: "templates", label: "Templates", icon: FolderKanban, badge: "preview" },
      { id: "catalogo", label: "Catálogo", icon: Package, badge: "em-breve" },
      { id: "campanhas", label: "Campanhas", icon: Megaphone, badge: "em-breve" },
    ],
  },
  {
    label: "Análise",
    items: [
      { id: "logs", label: "Logs", icon: ScrollText, badge: "preview" },
      { id: "metricas", label: "Métricas", icon: LineChart, badge: "preview" },
      { id: "configuracoes", label: "Configurações", icon: Settings, badge: "preview" },
    ],
  },
]

export default function WhatsAppOperationalHub() {
  const [section, setSection] = useState<SectionId>("inbox")
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva()
  const apiHeaders = useMemo((): Record<string, string> | null => {
    const id = lojaAtivaId?.trim()
    if (!id) return null
    return { [ASSISTEC_LOJA_HEADER]: id, "Content-Type": "application/json" }
  }, [lojaAtivaId])

  const [totalUnread, setTotalUnread] = useState<number | null>(null)
  useEffect(() => {
    if (!apiHeaders) {
      setTotalUnread(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/whatsapp/conversations", { headers: apiHeaders })
        const data = (await res.json()) as { conversations?: { unreadCount?: number }[] }
        if (cancelled) return
        const sum = (data.conversations ?? []).reduce((s, c) => s + (c.unreadCount ?? 0), 0)
        setTotalUnread(sum)
      } catch {
        if (!cancelled) setTotalUnread(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiHeaders])

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden gap-3">
      <header className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 md:px-5 flex-none">
        <div className="min-w-0 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/20 animate-pulse-slow">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
              WhatsApp HUB
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Atendimento agentic · OmniGestão Pro
              {lojaAtivaRaw?.nomeFantasia ? ` · ${lojaAtivaRaw.nomeFantasia}` : ""}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-1 border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200"
        >
          <Sparkles className="h-3 w-3" />
          Agentic AI
        </Badge>
      </header>

      <div className="flex-1 min-h-0 w-full flex gap-3 overflow-hidden">
        {/* ── Rail lateral ── */}
        <nav
          data-hubnav
          className="glass-card hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto rounded-2xl p-3 sm:flex"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-muted/60"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge === "unread" && totalUnread ? (
                      <Badge variant="default" className="h-4 shrink-0 px-1.5 py-0 text-[10px]">
                        {totalUnread}
                      </Badge>
                    ) : item.badge === "preview" ? (
                      <PreviewBadge className="h-4 shrink-0 px-1.5 py-0 text-[9px]" />
                    ) : item.badge === "em-breve" ? (
                      <ComingSoonBadge className="h-4 shrink-0 px-1.5 py-0 text-[9px]" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* ── Mobile: seletor simples ── */}
        <div className="sm:hidden w-full">
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SectionId)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Stage ── */}
        <div className="min-h-0 min-w-0 flex-1 h-full w-full flex flex-col overflow-hidden">
          {section === "visao-geral" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppInboxInsightsBridge apiHeaders={apiHeaders} />
            </div>
          )}

          {section === "inbox" && (
            <div className="min-h-0 flex-1 h-full w-full flex flex-col overflow-hidden">
              <WhatsAppInbox embedded />
            </div>
          )}

          {section === "handoff" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppHandoffPanel />
            </div>
          )}

          {section === "automacoes" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppAutomationsPanel apiHeaders={apiHeaders} />
            </div>
          )}

          {section === "respostas-rapidas" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppRespostasRapidasPanel apiHeaders={apiHeaders} />
            </div>
          )}

          {section === "regras-ia" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppIaPanel apiHeaders={apiHeaders} />
            </div>
          )}

          {section === "templates" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppTemplatesPanel />
            </div>
          )}

          {section === "catalogo" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppCatalogoPanel />
            </div>
          )}

          {section === "campanhas" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppCampanhasPanel />
            </div>
          )}

          {section === "logs" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppLogsPanel />
            </div>
          )}

          {section === "metricas" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppMetricasPanel />
            </div>
          )}

          {section === "configuracoes" && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-elegant pr-1">
              <WhatsAppConfiguracoesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Bridge leve: reusa fetch do inbox via evento — implementação inline para painel de Visão Geral. */
function WhatsAppInboxInsightsBridge({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [conversations, setConversations] = useState<
    import("./WhatsAppInsightsPanel").InsightsConversation[]
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      if (!apiHeaders) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetch("/api/whatsapp/conversations", { headers: apiHeaders })
        const data = (await res.json()) as {
          conversations?: import("./WhatsAppInsightsPanel").InsightsConversation[]
        }
        setConversations(data.conversations ?? [])
      } catch {
        setConversations([])
      } finally {
        setLoading(false)
      }
    })()
  }, [apiHeaders])

  return <WhatsAppInsightsPanel conversations={conversations} loading={loading} showChannelHealth />
}
