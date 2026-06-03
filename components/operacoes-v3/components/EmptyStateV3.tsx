"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyStateV3({
  icon,
  titulo,
  descricao,
  acao,
  className,
}: {
  icon?: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-muted-foreground/60">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descricao ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}
