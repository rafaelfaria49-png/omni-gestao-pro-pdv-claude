"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface SettingsCollapsibleProps {
  title: ReactNode;
  summary?: ReactNode;
  expandedSummary?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Accordion / disclosure acessível do sistema visual Configurações (Conceito C). */
export function SettingsCollapsible({
  title,
  summary,
  expandedSummary,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
  contentClassName,
}: SettingsCollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const contentId = useId();
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const toggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      className={cn("overflow-hidden rounded-xl border", className)}
      style={{
        borderColor: "var(--cfg-border)",
        backgroundColor: "var(--cfg-inset)",
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? contentId : undefined}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--cfg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium" style={{ color: "var(--cfg-fg)" }}>
            {title}
          </div>
          {(isOpen ? expandedSummary ?? summary : summary) ? (
            <div className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--cfg-muted)" }}>
              {isOpen ? expandedSummary ?? summary : summary}
            </div>
          ) : null}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: "var(--cfg-surface)",
            borderColor: "var(--cfg-border-strong)",
            color: "var(--cfg-fg-body)",
          }}
        >
          <span>{isOpen ? "Recolher" : "Expandir"}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-150", isOpen && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen ? (
        <div
          id={contentId}
          className={cn("border-t px-4 py-3.5", contentClassName)}
          style={{
            borderColor: "var(--cfg-border)",
            backgroundColor: "var(--cfg-surface)",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
