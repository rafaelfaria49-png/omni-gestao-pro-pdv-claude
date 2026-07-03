"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_DOT_CLASS, type Tone } from "../data/status-flow";

/**
 * Seção colapsável da OS (Workspace): título · status visual · resumo ·
 * ação principal da seção · conteúdo · estado vazio honesto.
 */
export function OSSectionV3({
  titulo,
  statusVisual,
  tone = "neutral",
  resumo,
  acaoPrincipal,
  vazio,
  defaultOpen = true,
  children,
}: {
  titulo: string;
  statusVisual?: string;
  tone?: Tone;
  resumo?: ReactNode;
  acaoPrincipal?: ReactNode;
  /** Estado vazio honesto quando a seção ainda não tem conteúdo conectado. */
  vazio?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const temConteudo = children != null && children !== false;

  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)] shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--ops-v3-muted-bg)]"
        aria-expanded={open}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT_CLASS[tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[var(--ops-v3-body)]">{titulo}</h3>
            {statusVisual ? <span className="text-xs text-[var(--ops-v3-muted)]">· {statusVisual}</span> : null}
          </div>
          {resumo ? <div className="mt-0.5 truncate text-xs text-[var(--ops-v3-muted)]">{resumo}</div> : null}
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-[var(--ops-v3-subtle)] transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--ops-v3-line)] px-4 py-4">
          {acaoPrincipal ? <div className="mb-3 flex flex-wrap items-center gap-2">{acaoPrincipal}</div> : null}
          {temConteudo
            ? children
            : (vazio ?? <p className="text-sm text-[var(--ops-v3-muted)]">Sem dados nesta seção ainda.</p>)}
        </div>
      ) : null}
    </section>
  );
}
