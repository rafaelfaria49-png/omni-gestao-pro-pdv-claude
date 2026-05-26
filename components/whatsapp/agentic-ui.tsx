"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Bot,
  Flame,
  Loader2,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  Wrench,
  type LucideIcon,
} from "lucide-react"

// ─── Layout tokens (theme-aware, no hardcoded white/black) ───────────────────

export const waHubShell =
  "glass-card flex min-h-0 flex-col overflow-hidden rounded-2xl border-border/70 shadow-elegant"

export const waSidebar =
  "flex w-[min(100%,20rem)] shrink-0 flex-col border-r border-border/60 bg-muted/15"

export const waChatArea = "flex min-w-0 flex-1 flex-col bg-background/50"

export const waContextPanel =
  "hidden w-72 shrink-0 flex-col border-l border-border/60 bg-muted/10 xl:flex"

// ─── Insight types (derived from real conversation fields) ─────────────────

export type WaInsightVariant = "ai" | "priority" | "sale" | "risk" | "os" | "lead"

export type WaInsight = {
  id: string
  label: string
  variant: WaInsightVariant
  description?: string
}

const VARIANT_META: Record<
  WaInsightVariant,
  { icon: LucideIcon; className: string }
> = {
  ai: {
    icon: Sparkles,
    className:
      "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
  priority: {
    icon: Star,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  sale: {
    icon: ShoppingBag,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  risk: {
    icon: ShieldAlert,
    className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
  },
  os: {
    icon: Wrench,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  lead: {
    icon: Flame,
    className:
      "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
}

export type InsightConversationInput = {
  unreadCount: number
  humanMode: boolean
  clienteId: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  status: string
  etiquetas?: { etiqueta: { nome: string } }[]
}

/** Dados reais do CRM (opcional) — só heurísticas visuais quando ausente. */
export type ClienteOpsHint = {
  hasCliente: boolean
  openOsCount: number
  lateOsCount: number
  totalSpent?: number
  lastVendaTotal?: number
  lastVendaAt?: string | null
}

export function detectIntent(preview: string): string | null {
  const t = preview.toLowerCase().trim()
  if (!t) return null
  if (/orçamento|orcamento|preço|preco|quanto custa|valor/.test(t))
    return "Solicita orçamento"
  if (/cancelar|desistir|reembolso|devolver/.test(t))
    return "Risco de desistência"
  if (/pronto|status|andamento|quando fica/.test(t))
    return "Consulta status / OS"
  if (/garantia|defeito|não funciona|nao funciona|problema/.test(t))
    return "Suporte pós-venda"
  if (/obrigad|valeu|perfeito/.test(t)) return "Satisfação / encerramento"
  if (/oi|olá|ola|bom dia|boa tarde/.test(t)) return "Abertura de conversa"
  return null
}

export function deriveInsights(
  conv: InsightConversationInput,
  ops?: ClienteOpsHint | null
): WaInsight[] {
  const preview = (conv.lastMessagePreview ?? "").toLowerCase()
  const insights: WaInsight[] = []
  const push = (id: string, label: string, variant: WaInsightVariant, description?: string) => {
    if (insights.some((i) => i.id === id)) return
    insights.push({ id, label, variant, description })
  }

  if (conv.unreadCount >= 2 || (conv.unreadCount > 0 && conv.humanMode))
    push("priority", "Cliente prioritário", "priority", `${conv.unreadCount} não lida(s)`)

  if (conv.clienteId)
    push("recurring", "Cliente recorrente", "priority", "Vinculado ao cadastro")

  if (conv.humanMode)
    push("human", "Atendimento humano", "ai", "IA pausada nesta conversa")

  if (/orçamento|orcamento|comprar|quanto custa|parcela/.test(preview))
    push("sale", "Possível venda", "sale")

  if (/cancelar|desistir|reclamação|reclamacao|insatisfeito|péssimo|pessimo/.test(preview))
    push("risk", "Risco de cancelamento", "risk")

  if (ops && ops.lateOsCount > 0)
    push(
      "os-late-real",
      "OS atrasada",
      "os",
      `${ops.lateOsCount} OS em aberto há mais de 3 dias`
    )
  else if (/atrasad|atraso|demora/.test(preview))
    push("os-late", "OS atrasada", "os")

  if (ops && ops.openOsCount > 0 && !insights.some((i) => i.id === "os-late-real"))
    push("os-open", "OS em aberto", "os", `${ops.openOsCount} ordem(ns) ativa(s)`)

  if (/os\s*[-#]?\d|ordem de serviço|conserto|aparelho pronto/.test(preview))
    push("os-ref", "Menção a OS", "os")

  const tagNames = (conv.etiquetas ?? []).map((e) => e.etiqueta.nome.toLowerCase())
  if (tagNames.some((n) => /urgent|vip|prior/.test(n)))
    push("tag-priority", "Cliente prioritário", "priority", "Etiqueta de prioridade")

  if (conv.unreadCount > 0 && !conv.clienteId && preview.length > 8)
    push("lead", "Lead quente", "lead", "Contato ainda não cadastrado")

  if (conv.lastMessageAt) {
    const idleH =
      (Date.now() - new Date(conv.lastMessageAt).getTime()) / 3600000
    if (idleH > 24 && conv.status === "open" && conv.unreadCount === 0)
      push("stale", "Follow-up sugerido", "ai", "Sem resposta há mais de 24h")
  }

  return insights.slice(0, 5)
}

export function buildAiSummary(
  conv: InsightConversationInput,
  intent: string | null,
  ops?: ClienteOpsHint | null
): string {
  const parts: string[] = []
  if (intent) parts.push(`Intenção detectada: ${intent}.`)
  if (ops?.hasCliente || conv.clienteId) {
    parts.push("Cliente cadastrado vinculado.")
    if (ops?.totalSpent != null && ops.totalSpent > 0) {
      parts.push(
        `Total gasto (OS concluídas + vendas): ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ops.totalSpent)}.`
      )
    }
    if (ops?.openOsCount) parts.push(`${ops.openOsCount} OS em aberto.`)
    if (ops?.lateOsCount) parts.push(`${ops.lateOsCount} OS com possível atraso operacional.`)
    if (ops?.lastVendaAt && ops.lastVendaTotal != null) {
      const d = new Date(ops.lastVendaAt)
      const when = Number.isNaN(d.getTime())
        ? ops.lastVendaAt
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
      parts.push(
        `Última compra: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ops.lastVendaTotal)} em ${when}.`
      )
    }
  } else {
    parts.push("Contato ainda não vinculado a um cliente.")
  }
  if (conv.humanMode) parts.push("Modo humano ativo — revisar antes de automações.")
  if (conv.unreadCount > 0)
    parts.push(`${conv.unreadCount} mensagem(ns) aguardando leitura.`)
  const preview = conv.lastMessagePreview?.trim()
  if (preview) parts.push(`Última mensagem: “${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}”.`)
  return parts.join(" ") || "Aguardando mais contexto da conversa."
}

export function clienteOpsHintFromSnapshot(
  snapshot: {
    totalSpent: number
    openOs: { length: number }
    lateOs: { length: number }
    lastVenda: { total: number; at: string } | null
  } | null,
  hasClienteId: boolean
): ClienteOpsHint | null {
  if (!snapshot && !hasClienteId) return null
  return {
    hasCliente: !!snapshot || hasClienteId,
    openOsCount: snapshot?.openOs.length ?? 0,
    lateOsCount: snapshot?.lateOs.length ?? 0,
    totalSpent: snapshot?.totalSpent,
    lastVendaTotal: snapshot?.lastVenda?.total,
    lastVendaAt: snapshot?.lastVenda?.at ?? null,
  }
}

// ─── UI primitives ───────────────────────────────────────────────────────────

export function AiSignalBadge({
  insight,
  compact,
  className,
}: {
  insight: WaInsight
  compact?: boolean
  className?: string
}) {
  const meta = VARIANT_META[insight.variant]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium transition-colors",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        meta.className,
        className
      )}
      title={insight.description}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {insight.label}
    </span>
  )
}

export function AiAnalyzingPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-xs text-violet-700 dark:text-violet-200",
        className
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
      <span className="font-medium">IA analisando conversa…</span>
    </div>
  )
}

export function PremiumEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center",
        className
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div className="max-w-xs space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function IaSuggestionCard({
  suggestion,
  onApply,
  className,
}: {
  suggestion: string
  onApply?: () => void
  className?: string
}) {
  if (!suggestion.trim()) return null
  return (
    <div
      className={cn(
        "rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-transparent to-primary/5 p-3",
        className
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-200">
        <Sparkles className="h-3.5 w-3.5" />
        Sugestão IA
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{suggestion}</p>
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className="mt-2 text-[11px] font-medium text-primary hover:underline"
        >
          Usar sugestão no campo de mensagem
        </button>
      )}
    </div>
  )
}

export function HubStatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  trend?: "up" | "down" | "neutral"
}) {
  return (
    <div className="glass-card rounded-xl p-4 transition-colors hover:border-primary/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {hint && (
        <p
          className={cn(
            "mt-1 text-[11px]",
            trend === "up" && "text-emerald-600 dark:text-emerald-400",
            trend === "down" && "text-red-600 dark:text-red-400",
            !trend && "text-muted-foreground"
          )}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

export function TimelineEvent({
  time,
  title,
  detail,
  icon: Icon = Bot,
}: {
  time: string
  title: string
  detail?: string
  icon?: LucideIcon
}) {
  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted/50">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[10px] text-muted-foreground">{time}</p>
        <p className="text-xs font-medium text-foreground">{title}</p>
        {detail && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{detail}</p>
        )}
      </div>
    </div>
  )
}

export function AlertRow({
  type,
  text,
}: {
  type: "warn" | "info" | "danger"
  text: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
      <AlertTriangle
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          type === "danger" && "text-red-500",
          type === "warn" && "text-amber-500",
          type === "info" && "text-primary"
        )}
      />
      <span className="text-foreground/90">{text}</span>
    </div>
  )
}

/** Sugestão de resposta baseada em intenção (sem backend extra). */
export function suggestReply(intent: string | null, humanMode: boolean): string {
  if (humanMode)
    return "Olá! Estou verificando seu caso com a equipe e retorno em instantes."
  if (!intent) return "Olá! Como posso ajudar você hoje?"
  if (intent.includes("orçamento"))
    return "Claro! Para montar o orçamento, pode me informar o modelo do aparelho e o defeito relatado?"
  if (intent.includes("status"))
    return "Vou consultar o status da sua OS e já te retorno com a previsão de entrega."
  if (intent.includes("Risco"))
    return "Sinto muito pelo transtorno. Pode me contar o que aconteueu para resolvermos o quanto antes?"
  if (intent.includes("Suporte"))
    return "Entendi. Vamos resolver isso — o aparelho apresenta o defeito desde quando?"
  return "Obrigado pela mensagem! Já estou analisando e retorno em seguida."
}
