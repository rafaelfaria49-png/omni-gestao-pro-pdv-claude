"use client"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type LoadingStateProps = {
  message?: string
  className?: string
  /** Menos altura (ex.: célula de tabela) */
  inline?: boolean
}

export function LoadingState({
  message = "Carregando…",
  className,
  inline,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        inline ? "py-6" : "min-h-[12rem] py-8",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-6 text-primary" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
