"use client"

/**
 * WhatsApp IA — F2/F3 · Cartão de classificação + consulta de catálogo assistida.
 *
 * F2: roda o classificador puro (`classifyWhatsAppIntent`) em tempo de leitura sobre a
 * última mensagem recebida e exibe intenção, confiança, entidades e uma sugestão segura.
 *
 * F3: quando a intenção é CONSULTA_PRODUTO_ESTOQUE, busca produtos REAIS da loja ativa
 * (via API read-only escopada por loja) e mostra cards (foto/nome/preço/estoque) + uma
 * resposta sugerida orientada pelos dados. SOMENTE LEITURA — não altera estoque.
 *
 * Nada é enviado automaticamente. "Usar resposta" apenas preenche o campo de mensagem
 * (via `onUseReply`); o operador confirma o envio manualmente.
 *
 * Cores de domínio (violet/sky/emerald/amber/orange/rose) são intencionais e seguem o
 * mesmo vocabulário visual de `agentic-ui.tsx` (CORE_RULES §7 — exceção documentada).
 */

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Activity,
  DollarSign,
  ImageOff,
  MessageCircle,
  Package,
  Pencil,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Truck,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  classifyWhatsAppIntent,
  INTENT_LABEL_PT,
  type WhatsAppIntentEntities,
  type WhatsAppIntentKind,
} from "@/lib/whatsapp/whatsapp-intent-classifier"
import type {
  WhatsAppResolvedProduct,
  WhatsAppStockStatus,
} from "@/lib/whatsapp/whatsapp-product-resolver"
import type {
  WhatsAppAssistanceQuote,
  WhatsAppQuoteBadge,
} from "@/lib/whatsapp/whatsapp-assistance-quote"
import { useWhatsAppProductSuggestion } from "./use-whatsapp-product-suggestion"
import { useWhatsAppAssistanceQuote } from "./use-whatsapp-assistance-quote"

const INTENT_META: Record<WhatsAppIntentKind, { icon: LucideIcon; className: string }> = {
  CONSULTA_PRODUTO_ESTOQUE: {
    icon: ShoppingBag,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  ORCAMENTO_ASSISTENCIA: {
    icon: Wrench,
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  STATUS_OS: {
    icon: Activity,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  GARANTIA: {
    icon: ShieldCheck,
    className: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  FINANCEIRO_CLIENTE: {
    icon: DollarSign,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  FORNECEDOR_COTACAO: {
    icon: Truck,
    className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  OUTRO: {
    icon: MessageCircle,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
}

const ENTITY_LABELS: { key: keyof WhatsAppIntentEntities; label: string }[] = [
  { key: "termoProduto", label: "Produto" },
  { key: "categoria", label: "Categoria" },
  { key: "marca", label: "Marca" },
  { key: "modeloAparelho", label: "Aparelho" },
  { key: "aparelhoTexto", label: "Aparelho" },
  { key: "servico", label: "Serviço" },
  { key: "peca", label: "Peça" },
  { key: "possivelCodigoOS", label: "OS" },
  { key: "tipoSolicitacaoFinanceira", label: "Tipo" },
  { key: "contextoGarantia", label: "Garantia" },
  { key: "telefone", label: "Telefone" },
  { key: "nome", label: "Nome" },
]

const STOCK_META: Record<WhatsAppStockStatus, { label: string; className: string }> = {
  EM_ESTOQUE: {
    label: "Disponível",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  BAIXO_ESTOQUE: {
    label: "Baixo estoque",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  SEM_ESTOQUE: {
    label: "Sem estoque",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
}

const QUOTE_BADGE_META: Record<WhatsAppQuoteBadge, string> = {
  Real: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Estimado: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Revisar: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

const QUOTE_ORIGIN_LABEL: Record<WhatsAppAssistanceQuote["origem"], string> = {
  SERVICO_CADASTRADO: "Serviço cadastrado",
  PRODUTO_COMPATIVEL: "Peça compatível",
  ESTIMATIVA: "Estimativa",
  SEM_DADOS: "Sem dados",
}

function formatBRL(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function priceDisplay(q: WhatsAppAssistanceQuote): string {
  if (q.valorSugerido != null && q.valorSugerido > 0) return formatBRL(q.valorSugerido)
  const { min, max } = q.faixaPreco
  if (min != null && max != null && min !== max) return `${formatBRL(min)} – ${formatBRL(max)}`
  if (min != null) return `a partir de ${formatBRL(min)}`
  if (max != null) return `até ${formatBRL(max)}`
  return "a confirmar"
}

function QuoteBlock({ quote }: { quote: WhatsAppAssistanceQuote }) {
  const aparelho = quote.device.modelo || quote.device.marca || "Aparelho a confirmar"
  const servico = quote.service.label || "Serviço a identificar"
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-border/60 bg-card/50 p-1.5">
          <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
            <Smartphone className="h-2.5 w-2.5" /> Aparelho
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-foreground">{aparelho}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card/50 p-1.5">
          <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-2.5 w-2.5" /> Serviço
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-foreground">{servico}</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground">Valor sugerido</span>
        <span className="text-sm font-semibold text-foreground">{priceDisplay(quote)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
            QUOTE_BADGE_META[quote.badge]
          )}
        >
          {quote.badge}
        </span>
        <span className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {QUOTE_ORIGIN_LABEL[quote.origem]}
        </span>
        <span className="text-[9px] text-muted-foreground">
          Confiança {Math.round(quote.confidence * 100)}%
        </span>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">{quote.resumo}</p>
    </div>
  )
}

function entityChips(entities: WhatsAppIntentEntities): { label: string; value: string }[] {
  const seen = new Set<string>()
  const chips: { label: string; value: string }[] = []
  for (const { key, label } of ENTITY_LABELS) {
    const value = entities[key]?.trim()
    if (!value) continue
    const dedupeKey = `${label}:${value.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    chips.push({ label, value })
  }
  return chips
}

function ProductRow({ p }: { p: WhatsAppResolvedProduct }) {
  const stock = STOCK_META[p.estoqueStatus]
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-2">
      {p.imagemPrincipalUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.imagemPrincipalUrl}
          alt={p.nome}
          className="h-10 w-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
          <ImageOff className="h-4 w-4 text-muted-foreground/60" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-foreground">{p.nome}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-foreground">{formatBRL(p.preco)}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
              stock.className
            )}
          >
            {stock.label}
          </span>
        </div>
      </div>
    </div>
  )
}

export function WhatsAppIntentSuggestion({
  lastInboundText,
  storeId,
  phone,
  conversationId,
  apiHeaders,
  isSupplierConversation,
  onUseReply,
  className,
}: {
  lastInboundText: string
  storeId?: string
  phone?: string
  conversationId?: string | null
  apiHeaders?: Record<string, string> | null
  isSupplierConversation?: boolean
  onUseReply?: (text: string) => void
  className?: string
}) {
  const text = lastInboundText?.trim() ?? ""

  const classification = useMemo(
    () =>
      text
        ? classifyWhatsAppIntent({
            text,
            storeId,
            phone,
            context: { isSupplierConversation },
          })
        : null,
    [text, storeId, phone, isSupplierConversation]
  )

  const isProduct = classification?.intent === "CONSULTA_PRODUTO_ESTOQUE"
  const productState = useWhatsAppProductSuggestion({
    conversationId: conversationId ?? null,
    apiHeaders: apiHeaders ?? null,
    enabled: !!isProduct,
    text,
    entities: classification?.entities ?? {},
  })

  const isQuote = classification?.intent === "ORCAMENTO_ASSISTENCIA"
  const quoteState = useWhatsAppAssistanceQuote({
    conversationId: conversationId ?? null,
    apiHeaders: apiHeaders ?? null,
    enabled: !!isQuote,
    text,
  })

  const [dismissed, setDismissed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [replyText, setReplyText] = useState("")

  // Prefere a resposta orientada pelos dados (F3 produto / F4 orçamento) quando disponível.
  const effectiveReply =
    productState.resolution?.suggestedReply?.trim() ||
    quoteState.quote?.suggestedReply?.trim() ||
    classification?.suggestedReply ||
    ""

  // Reset ao trocar a mensagem/conversa ou quando a resposta efetiva muda.
  useEffect(() => {
    setDismissed(false)
    setEditing(false)
    setReplyText(effectiveReply)
  }, [effectiveReply, text])

  if (!classification) return null

  if (dismissed) {
    return (
      <div className={cn("text-[10px] text-muted-foreground", className)}>
        Sugestão de intenção descartada.{" "}
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="font-medium text-primary hover:underline"
        >
          Reabrir
        </button>
      </div>
    )
  }

  const meta = INTENT_META[classification.intent]
  const Icon = meta.icon
  const confidencePct = Math.round(classification.confidence * 100)
  const chips = entityChips(classification.entities)
  const canUse = !!onUseReply && replyText.trim().length > 0

  const resolution = productState.resolution

  return (
    <div className={cn("rounded-xl border border-primary/25 bg-card/50 p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Classificação assistida
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">
          Aguardando aprovação
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            meta.className
          )}
        >
          <Icon className="h-3 w-3" />
          {INTENT_LABEL_PT[classification.intent]}
        </span>
        <span className="text-[10px] text-muted-foreground">Confiança {confidencePct}%</span>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={`${c.label}-${c.value}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/80"
            >
              <span className="text-muted-foreground">{c.label}:</span>
              {c.value}
            </span>
          ))}
        </div>
      )}

      {/* ── F3 · Produtos encontrados (só CONSULTA_PRODUTO_ESTOQUE) ── */}
      {isProduct && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/15 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Package className="h-3 w-3 text-primary" />
              Produtos no catálogo
            </span>
            {resolution && resolution.total > 0 && (
              <span className="text-[9px] text-muted-foreground">
                Busca {Math.round(resolution.confidence * 100)}%
              </span>
            )}
          </div>

          {productState.loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : productState.error ? (
            <p className="text-[10px] text-muted-foreground">
              Não foi possível consultar o catálogo agora ({productState.error}).
            </p>
          ) : resolution && resolution.produtos.length > 0 ? (
            <div className="space-y-1.5">
              {resolution.produtos.map((p) => (
                <ProductRow key={p.id} p={p} />
              ))}
              {resolution.overflow > 0 && (
                <p className="pt-0.5 text-center text-[10px] font-medium text-muted-foreground">
                  + {resolution.overflow} produto{resolution.overflow > 1 ? "s" : ""} encontrado
                  {resolution.overflow > 1 ? "s" : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Nenhum produto compatível no catálogo desta loja. Verifique manualmente antes de responder.
            </p>
          )}
        </div>
      )}

      {/* ── F4 · Orçamento sugerido (só ORCAMENTO_ASSISTENCIA) ── */}
      {isQuote && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/15 p-2">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Receipt className="h-3 w-3 text-primary" />
            Orçamento sugerido
          </div>
          {quoteState.loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-6 w-2/3 rounded-lg" />
            </div>
          ) : quoteState.error ? (
            <p className="text-[10px] text-muted-foreground">
              Não foi possível montar o orçamento agora ({quoteState.error}).
            </p>
          ) : quoteState.quote ? (
            <QuoteBlock quote={quoteState.quote} />
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Confirme o aparelho e o serviço para montar o orçamento manualmente.
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        Próxima ação sugerida: {classification.suggestedAction}
      </p>

      <div className="mt-2">
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">
          Sugestão de resposta (revise antes de enviar):
        </p>
        {editing ? (
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            className="text-xs"
          />
        ) : (
          <p className="rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px] leading-relaxed text-foreground/90">
            {replyText}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-[10px]"
          disabled={!canUse}
          onClick={() => onUseReply?.(replyText.trim())}
        >
          Usar resposta
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[10px]"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil className="h-3 w-3" />
          {editing ? "Concluir edição" : "Editar resposta"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[10px] text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3 w-3" />
          Descartar
        </Button>
      </div>

      <p className="mt-2 text-[9px] text-muted-foreground">
        Nada é enviado automaticamente — o operador revisa e confirma o envio.
      </p>
    </div>
  )
}
