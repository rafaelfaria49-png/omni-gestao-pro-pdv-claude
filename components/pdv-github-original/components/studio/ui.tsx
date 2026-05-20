"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function GlassCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm backdrop-blur-xl transition-colors duration-300",
        "shadow-card",
        className
      )}
      {...props}
    />
  )
}
