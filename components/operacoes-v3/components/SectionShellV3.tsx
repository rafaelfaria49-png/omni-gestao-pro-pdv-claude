"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cabeçalho + corpo padrão de cada tela da V3 (título, subtítulo, badge, ações). */
export function SectionShellV3({
  titulo,
  subtitulo,
  badge,
  actions,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[19px] font-semibold text-[var(--ops-v3-ink)] sm:text-[21px]">{titulo}</h1>
            {badge}
          </div>
          {subtitulo ? <p className="mt-0.5 text-sm text-[var(--ops-v3-muted)]">{subtitulo}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
