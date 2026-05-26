"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Activity,
  Clock,
  FileText,
  MessageSquare,
  Phone,
  Sparkles,
  UserCheck,
  Zap,
} from "lucide-react"
import {
  AiAnalyzingPulse,
  AiSignalBadge,
  buildAiSummary,
  detectIntent,
  deriveInsights,
  IaSuggestionCard,
  suggestReply,
  TimelineEvent,
  waContextPanel,
  type InsightConversationInput,
} from "./agentic-ui"
import { cn } from "@/lib/utils"

export type ContextContact = {
  id: string
  displayName: string
  phoneDigits: string
  profilePicUrl?: string
}

export type ContextConversation = InsightConversationInput & {
  id: string
  contact: ContextContact
  clienteId: string | null
  humanMode: boolean
  status: string
}

type TimelineMessage = {
  id: string
  direction: string
  body: string
  createdAt: string
}

function formatTimelineTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function phoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length === 13)
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return digits
}

export function WhatsAppContextPanel({
  conv,
  messages,
  aiAnalyzing,
  onApplySuggestion,
  onQuickAction,
  className,
}: {
  conv: ContextConversation | null
  messages: TimelineMessage[]
  aiAnalyzing?: boolean
  onApplySuggestion?: (text: string) => void
  onQuickAction?: (action: string) => void
  className?: string
}) {
  const intent = useMemo(
    () => (conv ? detectIntent(conv.lastMessagePreview) : null),
    [conv]
  )
  const insights = useMemo(() => (conv ? deriveInsights(conv) : []), [conv])
  const summary = useMemo(
    () => (conv ? buildAiSummary(conv, intent) : ""),
    [conv, intent]
  )
  const suggestion = useMemo(
    () => (conv ? suggestReply(intent, conv.humanMode) : ""),
    [conv, intent]
  )

  const timeline = useMemo(() => {
    const items = [...messages].slice(-8).reverse()
    return items.map((m) => ({
      id: m.id,
      time: formatTimelineTime(m.createdAt),
      title: m.direction === "outbound" ? "Você enviou" : "Cliente enviou",
      detail: m.body.slice(0, 80) + (m.body.length > 80 ? "…" : ""),
    }))
  }, [messages])

  if (!conv) {
    return (
      <aside className={cn(waContextPanel, "items-center justify-center p-6", className)}>
        <div className="text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Selecione uma conversa para ver contexto, IA e timeline.
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside className={cn(waContextPanel, className)}>
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Contexto operacional
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {conv.contact.displayName}
        </p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Phone className="h-3 w-3" />
          {phoneLabel(conv.contact.phoneDigits)}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {aiAnalyzing ? <AiAnalyzingPulse /> : null}

        {insights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {insights.map((ins) => (
              <AiSignalBadge key={ins.id} insight={ins} compact />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border/60 bg-card/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Resumo IA
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
          {intent && (
            <p className="mt-2 text-[11px]">
              <span className="text-muted-foreground">Intenção: </span>
              <span className="font-medium text-primary">{intent}</span>
            </p>
          )}
        </div>

        <IaSuggestionCard
          suggestion={suggestion}
          onApply={onApplySuggestion ? () => onApplySuggestion(suggestion) : undefined}
        />

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cliente
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cadastro</span>
              <span className="flex items-center gap-1 font-medium text-foreground">
                {conv.clienteId ? (
                  <>
                    <UserCheck className="h-3 w-3 text-emerald-500" />
                    Vinculado
                  </>
                ) : (
                  "Não vinculado"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Modo</span>
              <span className="font-medium">
                {conv.humanMode ? "Humano" : "Automático"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium capitalize">{conv.status}</span>
            </div>
          </div>
        </div>

        <Separator className="opacity-50" />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" />
            Ações rápidas
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "os", label: "Ver OS", icon: FileText },
              { id: "status", label: "Status OS", icon: Activity },
              { id: "quote", label: "Orçamento", icon: MessageSquare },
              { id: "human", label: "Modo humano", icon: UserCheck },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-1.5 border-border/70 bg-card/40 text-[11px]"
                onClick={() => onQuickAction?.(id)}
              >
                <Icon className="h-3 w-3 text-primary" />
                {label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            OS e compras aparecem quando vinculados ao cadastro do cliente.
          </p>
        </div>

        <Separator className="opacity-50" />

        <div>
          <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" />
            Timeline
          </p>
          {timeline.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem eventos ainda.</p>
          ) : (
            timeline.map((ev) => (
              <TimelineEvent
                key={ev.id}
                time={ev.time}
                title={ev.title}
                detail={ev.detail}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
