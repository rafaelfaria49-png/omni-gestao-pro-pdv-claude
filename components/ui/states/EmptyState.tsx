"use client"

import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export type EmptyStateProps = {
  title: string
  description: string
  icon?: LucideIcon
  className?: string
  /** Navegação principal (ex.: outro módulo) */
  primaryHref?: { label: string; href: string }
  /** Ação secundária (ex.: recarregar lista) */
  action?: { label: string; onClick: () => void }
  /** Exibe link para o painel inicial */
  dashboardLink?: boolean
  /** Menos padding e sem borda de destaque (ex.: dentro de tabela) */
  compact?: boolean
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
  primaryHref,
  action,
  dashboardLink = true,
  compact,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn(
        compact ? "gap-4 border-0 bg-transparent p-4 md:p-5" : "border-border bg-muted/15",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="text-muted-foreground" aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        {primaryHref ? (
          <Button type="button" size="sm" asChild>
            <Link href={primaryHref.href}>{primaryHref.label}</Link>
          </Button>
        ) : null}
        {action ? (
          <Button type="button" variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
        {dashboardLink ? (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard">Painel inicial</Link>
          </Button>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}
