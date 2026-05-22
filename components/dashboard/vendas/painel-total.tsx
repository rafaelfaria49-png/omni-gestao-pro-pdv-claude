"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/** Painel lateral do terminal PDV: vidro forte sobre fundo preto. */
export function PdvPainelLateralTerminal({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-col overflow-hidden border-t border-border bg-muted/25 backdrop-blur-md lg:border-l lg:border-t-0",
        "dark:border-white/5 dark:bg-black/40 dark:backdrop-blur-3xl",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Visor do total com brilho intenso na cor primária (token --primary). */
export function PdvVisorTotal({
  label = "TOTAL",
  valorFormatado,
  glow = "soft",
  className,
}: {
  label?: string
  valorFormatado: string
  /** none = sem glow (ex.: PDV rápido); soft = glow leve (demais PDVs). */
  glow?: "none" | "soft"
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-muted/30 px-3 py-3 text-center backdrop-blur-sm dark:bg-card/60 dark:backdrop-blur-md",
        className
      )}
    >
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <p
        className="mt-1 text-3xl font-black tabular-nums tracking-tight text-primary"
        style={
          glow === "none"
            ? undefined
            : {
                // Glow leve (enterprise): sem blur pesado para manter legibilidade.
                textShadow: "0 0 8px var(--primary)",
              }
        }
      >
        {valorFormatado}
      </p>
    </div>
  )
}
