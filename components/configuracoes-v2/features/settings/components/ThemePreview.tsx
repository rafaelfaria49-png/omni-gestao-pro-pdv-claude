"use client";

import { cn } from "@/components/configuracoes-v2/lib/utils";

type Props = {
  active?: boolean;
  label: string;
};

export function ThemePreview({ active, label }: Props) {
  return (
    <div
      className={cn(
        "lovable-settings-theme-preview rounded-xl border border-border/60 bg-card/50 p-3.5 overflow-hidden",
        active && "ring-1 ring-primary/30 shadow-soft",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className={cn("h-2 w-2 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_60px] gap-2">
        <div className="space-y-2">
          <div className="h-6 rounded-lg bg-muted/50 border border-border/50" />
          <div className="h-3 rounded-full bg-muted/40 w-4/5" />
          <div className="h-3 rounded-full bg-muted/30 w-2/3" />
        </div>
        <div className="rounded-xl border border-border/50 bg-primary/10 grid place-items-center">
          <div className="h-8 w-8 rounded-full bg-primary/20" />
        </div>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-muted/50 overflow-hidden">
        <div className="h-full w-2/3 rounded-full bg-primary/35" />
      </div>
    </div>
  );
}
