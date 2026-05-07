"use client"

import { ThemeSwitcher } from "@/components/ia-mestre/ThemeSwitcher"
import type { ReactNode } from "react"

export function IaMestreSubPageShell({
  title,
  subtitle,
  badge,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-5 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-base font-bold tracking-tight">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ThemeSwitcher />
        </div>
      </header>
      <main className="scroll-elegant flex-1 overflow-y-auto overflow-x-hidden px-8 py-6">{children}</main>
    </div>
  )
}
