"use client"

import { useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  AlertCircle,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Link2,
  Link2Off,
  MessageSquare,
  Phone,
  RefreshCw,
  Sparkles,
  UserCheck,
  UserPlus,
  Zap,
} from "lucide-react"
import {
  AiAnalyzingPulse,
  AiSignalBadge,
  buildAiSummary,
  clienteOpsHintFromSnapshot,
  detectIntent,
  deriveInsights,
  IaSuggestionCard,
  PremiumEmptyState,
  suggestReply,
  TimelineEvent,
  waContextPanel,
  type InsightConversationInput,
} from "./agentic-ui"
import {
  formatMoney,
  useWhatsAppClienteContext,
} from "./use-whatsapp-cliente-context"
import { useWhatsAppAiAnalysis } from "./use-whatsapp-ai-analysis"
import { WhatsAppIntentSuggestion } from "./WhatsAppIntentSuggestion"
import { clientesDashboardHref } from "@/lib/whatsapp/clientes-dashboard-link"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
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

function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function phoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length === 13)
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return digits
}

function osStatusClass(status: string): string {
  if (status === "Entregue") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  if (status === "Pronto") return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
  if (status === "EmAnalise") return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
  return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
}

function prioridadeClass(p: string): string {
  if (p === "urgente") return "bg-red-500/15 text-red-700 dark:text-red-300"
  if (p === "alta") return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
  if (p === "media") return "bg-sky-500/15 text-sky-700 dark:text-sky-300"
  return "bg-muted text-muted-foreground"
}

export function WhatsAppContextPanel({
  conv,
  messages,
  apiHeaders,
  onApplySuggestion,
  onQuickAction,
  onLinkCliente,
  onUnlinkCliente,
  linkingCliente,
  unlinkingCliente,
  linkSuccessMessage,
  highlightLinkCard,
  className,
}: {
  conv: ContextConversation | null
  messages: TimelineMessage[]
  apiHeaders: Record<string, string> | null
  onApplySuggestion?: (text: string) => void
  onQuickAction?: (action: string) => void
  onLinkCliente?: (clienteId: string) => void | Promise<boolean>
  onUnlinkCliente?: () => void | Promise<boolean>
  linkingCliente?: boolean
  unlinkingCliente?: boolean
  linkSuccessMessage?: string | null
  highlightLinkCard?: boolean
  className?: string
}) {
  const linkCardRef = useRef<HTMLDivElement>(null)
  const {
    snapshot,
    phoneCandidates,
    phoneLinkStatus,
    uniqueMatch,
    waPhoneDisplay,
    loading,
    error,
    refresh,
  } = useWhatsAppClienteContext(
    conv?.clienteId,
    conv?.contact.phoneDigits ?? "",
    apiHeaders
  )

  const opsHint = useMemo(
    () => clienteOpsHintFromSnapshot(snapshot, !!conv?.clienteId),
    [snapshot, conv?.clienteId]
  )

  const {
    loading: aiLoading,
    available: aiAvailable,
    analysis: aiAnalysis,
    cached: aiCached,
    reason: aiReason,
    error: aiError,
    refresh: refreshAi,
  } = useWhatsAppAiAnalysis(conv?.id ?? null, apiHeaders)

  const intent = useMemo(
    () => (conv ? detectIntent(conv.lastMessagePreview) : null),
    [conv]
  )
  const insights = useMemo(
    () => (conv ? deriveInsights(conv, opsHint) : []),
    [conv, opsHint]
  )
  const summary = useMemo(
    () => (conv ? buildAiSummary(conv, intent, opsHint) : ""),
    [conv, intent, opsHint]
  )
  const localSuggestion = useMemo(
    () => (conv ? suggestReply(intent, conv.humanMode) : ""),
    [conv, intent]
  )
  // F2 — última mensagem RECEBIDA (inbound) para a classificação assistida.
  const lastInboundText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m && m.direction !== "outbound") return m.body
    }
    return conv?.lastMessagePreview ?? ""
  }, [messages, conv?.lastMessagePreview])
  const llmSuggestion = aiAnalysis?.sugestaoResposta?.trim() ?? ""
  const suggestionSource: "llm" | "local" | null = aiLoading
    ? null
    : aiAvailable && llmSuggestion
      ? "llm"
      : localSuggestion.trim()
        ? "local"
        : null
  const activeSuggestion =
    suggestionSource === "llm" ? llmSuggestion : suggestionSource === "local" ? localSuggestion : ""

  const copySuggestion = async () => {
    const text = activeSuggestion.trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!highlightLinkCard || !linkCardRef.current) return
    linkCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [highlightLinkCard, phoneLinkStatus, uniqueMatch?.id])

  const timeline = useMemo(() => {
    const msgItems = [...messages].slice(-6).reverse().map((m) => ({
      id: m.id,
      time: formatTimelineTime(m.createdAt),
      title: m.direction === "outbound" ? "Você enviou" : "Cliente enviou",
      detail: m.body.slice(0, 80) + (m.body.length > 80 ? "…" : ""),
      icon: MessageSquare,
    }))
    const crmItems =
      snapshot?.ordensServico.slice(0, 3).map((os) => ({
        id: `os-${os.id}`,
        time: formatDateBr(os.createdAt),
        title: `OS #${os.numero}`,
        detail: `${os.equipamento || "Equipamento"} · ${os.status}${os.isLate ? " · possível atraso" : ""}`,
        icon: FileText,
      })) ?? []
    const saleItems =
      snapshot?.vendas.slice(0, 2).map((v) => ({
        id: `v-${v.id}`,
        time: formatDateBr(v.at),
        title: `Venda ${v.pedidoId}`,
        detail: `${formatMoney(v.total)} · ${v.status}`,
        icon: DollarSign,
      })) ?? []
    return [...msgItems, ...crmItems, ...saleItems].slice(0, 10)
  }, [messages, snapshot])

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

  const clientesBuscaHref = clientesDashboardHref(
    snapshot?.phone?.trim() || conv.contact.phoneDigits
  )
  const clienteHref = snapshot?.id ? clientesBuscaHref : null
  const osHref = snapshot?.id
    ? `/dashboard/operacoes-v2?clienteId=${encodeURIComponent(snapshot.id)}`
    : null

  return (
    <aside className={cn(waContextPanel, className)}>
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Contexto operacional
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {snapshot?.name ?? conv.contact.displayName}
        </p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Phone className="h-3 w-3" />
          {phoneLabel(conv.contact.phoneDigits)}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {insights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {insights.map((ins) => (
              <AiSignalBadge key={ins.id} insight={ins} compact />
            ))}
          </div>
        )}

        <WhatsAppIntentSuggestion
          lastInboundText={lastInboundText}
          storeId={apiHeaders?.[ASSISTEC_LOJA_HEADER]}
          phone={conv.contact.phoneDigits}
          conversationId={conv.id}
          apiHeaders={apiHeaders}
          onUseReply={onApplySuggestion}
        />

        <div className="rounded-xl border border-violet-500/25 bg-card/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Resumo IA
              {aiAvailable && aiCached && (
                <span className="text-[9px] font-normal text-muted-foreground">(cache)</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px]"
              disabled={aiLoading}
              onClick={() => void refreshAi()}
            >
              <RefreshCw className={cn("h-3 w-3", aiLoading && "animate-spin")} />
              Atualizar análise
            </Button>
          </div>

          {aiLoading ? (
            <AiAnalyzingPulse className="mt-1" />
          ) : aiAvailable && aiAnalysis ? (
            <div className="space-y-2 text-[11px]">
              <p className="leading-relaxed text-foreground/90">{aiAnalysis.resumoOperacional}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-5 text-[9px]">
                  {aiAnalysis.intencao}
                </Badge>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize",
                    prioridadeClass(aiAnalysis.prioridade)
                  )}
                >
                  {aiAnalysis.prioridade}
                </span>
                <span className="text-muted-foreground">
                  Tom: {aiAnalysis.tomEmocional}
                </span>
              </div>
              {aiAnalysis.risco && aiAnalysis.risco !== "nenhum relevante" && (
                <p>
                  <span className="text-muted-foreground">Risco: </span>
                  {aiAnalysis.risco}
                </p>
              )}
              {aiAnalysis.oportunidade && (
                <p>
                  <span className="text-muted-foreground">Oportunidade: </span>
                  {aiAnalysis.oportunidade}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Próxima ação: </span>
                {aiAnalysis.proximaMelhorAcao}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Confiança {aiAnalysis.confianca}% — {aiAnalysis.motivo}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Análise IA indisponível
                {aiReason || aiError ? ` — ${aiError ?? aiReason}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Apoio local (heurística, não é LLM):
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
              {intent && (
                <p className="text-[11px]">
                  <span className="text-muted-foreground">Intenção local: </span>
                  <span className="font-medium text-primary">{intent}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {aiLoading ? (
          <p className="text-[11px] text-muted-foreground">Gerando sugestão IA…</p>
        ) : activeSuggestion.trim() && suggestionSource ? (
          <div className="space-y-1">
            <IaSuggestionCard
              suggestion={activeSuggestion}
              source={suggestionSource}
              onApply={
                onApplySuggestion
                  ? () => onApplySuggestion(activeSuggestion)
                  : undefined
              }
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[10px]"
                onClick={() => void copySuggestion()}
              >
                <Copy className="h-3 w-3" />
                Copiar sugestão
              </Button>
              {onApplySuggestion && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => onApplySuggestion(activeSuggestion)}
                >
                  Usar como resposta
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {/* ── CRM real ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cliente & CRM
          </p>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : conv.clienteId && snapshot ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                  {snapshot.name}
                </span>
                <div className="flex items-center gap-2">
                  {clienteHref && (
                    <Link
                      href={clienteHref}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Ver cadastro
                    </Link>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Cliente desde</p>
                  <p className="font-medium">{snapshot.clientSince}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total gasto</p>
                  <p className="font-medium">{formatMoney(snapshot.totalSpent)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Última compra</p>
                  {snapshot.lastVenda ? (
                    <p className="font-medium">
                      {formatMoney(snapshot.lastVenda.total)} ·{" "}
                      {formatDateBr(snapshot.lastVenda.at)}
                    </p>
                  ) : snapshot.lastPurchaseAt ? (
                    <p className="font-medium">{formatDateBr(snapshot.lastPurchaseAt)}</p>
                  ) : (
                    <p className="text-muted-foreground">Sem compras no PDV</p>
                  )}
                </div>
              </div>
              {onUnlinkCliente && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 border-border/70 text-[11px] text-muted-foreground hover:text-foreground"
                  disabled={unlinkingCliente || linkingCliente}
                  onClick={() => void onUnlinkCliente()}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  {unlinkingCliente ? "Desvinculando…" : "Desvincular cliente"}
                </Button>
              )}
            </div>
          ) : conv.clienteId && error ? (
            <p className="text-[11px] text-red-500">{error}</p>
          ) : !conv.clienteId ? (
            <div className="space-y-2">
              {linkSuccessMessage && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                  {linkSuccessMessage}
                </p>
              )}

              {phoneLinkStatus === "too_short" ? (
                <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-[11px] text-muted-foreground">
                  Telefone do contato incompleto para busca segura. Cadastre o cliente manualmente.
                </p>
              ) : phoneLinkStatus === "searching" || loading ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Buscando cliente na loja ativa pelo telefone…
                  </p>
                  <Skeleton className="mt-2 h-10 w-full rounded-lg" />
                </div>
              ) : phoneLinkStatus === "unique" && uniqueMatch && onLinkCliente ? (
                <div
                  ref={linkCardRef}
                  className={cn(
                    "rounded-xl border border-primary/35 bg-primary/5 p-3 transition-shadow",
                    highlightLinkCard &&
                      "ring-2 ring-primary/60 shadow-md shadow-primary/15 animate-pulse"
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Auto-vínculo sugerido
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Um cliente compatível com{" "}
                    <span className="font-medium text-foreground">{waPhoneDisplay}</span>.
                    Confirme — não vinculamos sem sua ação.
                  </p>
                  <div className="mt-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-2">
                    <p className="text-sm font-semibold text-foreground">{uniqueMatch.name}</p>
                    <p className="text-[11px] text-muted-foreground">{uniqueMatch.phoneDisplay}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-9 w-full gap-1.5 text-xs"
                    disabled={linkingCliente}
                    onClick={() => void onLinkCliente(uniqueMatch.id)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Vincular agora
                  </Button>
                </div>
              ) : phoneLinkStatus === "multiple" && phoneCandidates.length > 0 ? (
                <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3 w-3" />
                    Vários clientes compatíveis
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Escolha o cadastro correto para {waPhoneDisplay}:
                  </p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {phoneCandidates.map((c) => (
                      <Button
                        key={c.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto min-h-8 w-full flex-col items-start gap-0 py-1.5 text-left text-[11px]"
                        disabled={linkingCliente}
                        onClick={() => void onLinkCliente?.(c.id)}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.phoneDisplay}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : phoneLinkStatus === "none" ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum cliente cadastrado com telefone compatível{" "}
                    {waPhoneDisplay ? `(${waPhoneDisplay})` : ""} nesta loja.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-8 w-full gap-1.5 text-[11px]"
                      asChild
                    >
                      <Link href={clientesBuscaHref}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Cadastrar novo cliente
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full text-[11px]"
                      asChild
                    >
                      <Link href={clientesBuscaHref}>
                        Buscar no cadastro
                        {waPhoneDisplay ? ` · ${waPhoneDisplay}` : ""}
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Contato não vinculado. Aguardando busca…
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Carregando dados do cliente…</p>
          )}
        </div>

        {/* ── OS ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3 w-3 text-primary" />
              OS vinculadas
            </p>
            {osHref && (
              <Link
                href={osHref}
                className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
              >
                Ver todas <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
          {!conv.clienteId ? (
            <p className="text-[11px] text-muted-foreground">
              Vincule o cliente para listar ordens de serviço.
            </p>
          ) : loading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : snapshot && snapshot.ordensServico.length === 0 ? (
            <PremiumEmptyState
              icon={FileText}
              title="Nenhuma OS"
              description="Este cliente ainda não possui ordens de serviço registradas."
              className="py-6"
            />
          ) : snapshot ? (
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {snapshot.ordensServico.slice(0, 6).map((os) => (
                <div
                  key={os.id}
                  className={cn(
                    "rounded-lg border border-border/60 bg-card/50 p-2.5 text-[11px]",
                    os.isLate && "border-amber-500/40 bg-amber-500/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      OS #{os.numero}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                        osStatusClass(os.status)
                      )}
                    >
                      {os.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {os.equipamento || "—"}
                    {os.defeito ? ` · ${os.defeito.slice(0, 40)}` : ""}
                  </p>
                  <div className="mt-1 flex justify-between text-muted-foreground">
                    <span>{formatDateBr(os.createdAt)}</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(os.valorTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Vendas recentes ── */}
        {conv.clienteId && snapshot && snapshot.vendas.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-3 w-3 text-emerald-500" />
              Vendas recentes
            </p>
            <div className="space-y-1.5">
              {snapshot.vendas.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-2.5 py-2 text-[11px]"
                >
                  <div>
                    <p className="font-medium text-foreground">{v.pedidoId}</p>
                    <p className="text-muted-foreground">{formatDateBr(v.at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatMoney(v.total)}</p>
                    <Badge variant="outline" className="mt-0.5 h-4 text-[9px]">
                      {v.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="opacity-50" />

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3 w-3 text-primary" />
            Ações rápidas
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "os", label: "Ver OS", icon: FileText, disabled: !osHref },
              { id: "status", label: "Operações", icon: Activity, disabled: !osHref },
              {
                id: "quote",
                label: "Orçamento",
                icon: MessageSquare,
                disabled: true,
                soon: true,
              },
              { id: "human", label: "Modo humano", icon: UserCheck, disabled: false },
            ].map(({ id, label, icon: Icon, disabled, soon }) => (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="h-8 justify-start gap-1.5 border-border/70 bg-card/40 text-[11px]"
                onClick={() => {
                  if (id === "os" && osHref) window.open(osHref, "_blank")
                  else if (id === "status" && osHref) window.open(osHref, "_blank")
                  else onQuickAction?.(id)
                }}
              >
                <Icon className="h-3 w-3 text-primary shrink-0" />
                <span className="truncate">{label}</span>
                {soon ? (
                  <Badge
                    variant="secondary"
                    className="ml-auto shrink-0 px-1 py-0 text-[9px] font-normal"
                  >
                    Em breve
                  </Badge>
                ) : null}
              </Button>
            ))}
          </div>
          {error && conv.clienteId && (
            <button
              type="button"
              onClick={() => refresh()}
              className="mt-2 text-[10px] text-primary hover:underline"
            >
              Recarregar dados do cliente
            </button>
          )}
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
                icon={ev.icon}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
