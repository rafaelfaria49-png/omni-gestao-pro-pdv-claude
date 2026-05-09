"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DemoBadgeProps = {
  children: ReactNode;
  className?: string;
};

/** Selo discreto para conteúdo de exemplo / preview (tokens semânticos). */
export function DemoBadge({ children, className }: DemoBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
