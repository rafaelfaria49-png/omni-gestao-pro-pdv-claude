"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

/** Toast padrão para qualquer ação sem backend real nas telas novas do HUB. */
export function previewToast(detail?: string) {
  toast.info(
    detail
      ? `Preview visual — nenhuma ação real foi executada (${detail}).`
      : "Preview visual — nenhuma ação real foi executada."
  )
}

export function PreviewBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200", className)}
    >
      Preview
    </Badge>
  )
}

export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", className)}
    >
      Em breve
    </Badge>
  )
}

export type RiskLevel = "safe" | "ai" | "approval"

export const RISK_META: Record<RiskLevel, { label: string; dot: string; className: string }> = {
  safe: {
    label: "Consulta segura",
    dot: "bg-emerald-500",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  ai: {
    label: "IA / Orçamento",
    dot: "bg-amber-500",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  approval: {
    label: "Aprovação humana",
    dot: "bg-red-500",
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const meta = RISK_META[level]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

/** Nota de rodapé honesta, padrão em telas preview/protótipo. */
export function PreviewFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
      <span className="mt-0.5">🔒</span>
      <span>{children}</span>
    </p>
  )
}

/** Shell de drawer lateral (slide-over) reutilizado por Nova/Editar automação, template, config etc. */
export function PreviewDrawer({
  title,
  badge = "Preview",
  subtitle,
  onClose,
  children,
  footer,
  widthClassName = "max-w-lg",
}: {
  title: string
  badge?: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  widthClassName?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <div
        className={cn(
          "flex h-full w-full flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200",
          widthClassName
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
              <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-200">
                {badge}
              </Badge>
            </div>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

/** Tela padrão "Em breve" / "Preview" para seções sem backend ainda (Catálogo, Campanhas, Logs, Métricas). */
export function ComingSoonScreen({
  icon: Icon,
  title,
  description,
  badge = "em-breve",
  features,
  footnote,
}: {
  icon: LucideIcon
  title: string
  description: string
  badge?: "em-breve" | "preview"
  features: { icon: LucideIcon; title: string; description: string; tag: string }[]
  footnote: string
}) {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon className="h-5 w-5 text-primary" />
          {title}
          {badge === "em-breve" ? <ComingSoonBadge /> : <PreviewBadge />}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="glass-card rounded-xl p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <f.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">{f.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
            <Badge variant="outline" className="mt-2 text-[10px]">{f.tag}</Badge>
          </div>
        ))}
      </div>

      <PreviewFootnote>{footnote}</PreviewFootnote>
    </div>
  )
}
