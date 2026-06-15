"use client"

/**
 * WhatsApp IA — F2 · Cartão de classificação assistida do inbound.
 *
 * Componente ISOLADO: roda o classificador puro (`classifyWhatsAppIntent`) em tempo de
 * leitura sobre a última mensagem recebida e exibe intenção, confiança, entidades e uma
 * sugestão de resposta SEGURA para o operador revisar.
 *
 * Nada é enviado automaticamente. "Usar resposta" apenas preenche o campo de mensagem
 * (via `onUseReply`); o operador confirma o envio manualmente.
 *
 * Cores de domínio (violet/sky/emerald/amber/orange/rose) são intencionais e seguem o
 * mesmo vocabulário visual de `agentic-ui.tsx` (CORE_RULES §7 — exceção documentada).
 */

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Activity,
  DollarSign,
  MessageCircle,
  Pencil,
  ShieldCheck,
  ShoppingBag,
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

export function WhatsAppIntentSuggestion({
  lastInboundText,
  storeId,
  phone,
  isSupplierConversation,
  onUseReply,
  className,
}: {
  lastInboundText: string
  storeId?: string
  phone?: string
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

  const [dismissed, setDismissed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [replyText, setReplyText] = useState("")

  // Reset ao trocar a mensagem/conversa.
  useEffect(() => {
    setDismissed(false)
    setEditing(false)
    setReplyText(classification?.suggestedReply ?? "")
  }, [classification?.suggestedReply, text])

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

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/25 bg-card/50 p-3",
        className
      )}
    >
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
        <span className="text-[10px] text-muted-foreground">
          Confiança {confidencePct}%
        </span>
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
