"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "subtle" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent",
  outline: "bg-transparent text-foreground hover:bg-muted border border-border",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
  subtle: "bg-muted text-foreground hover:bg-muted/70 border border-transparent",
  danger: "bg-destructive/10 text-destructive hover:bg-destructive/15 border border-destructive/25",
};

/** Botão self-contained da V3 (sem depender do kit shadcn global). */
export function ButtonV3({
  variant = "outline",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Pílula informativa neutra (rótulo + valor). */
export function PillV3({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
