"use client";

import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export type SettingsStatusTone =
  | "done"
  | "active"
  | "review"
  | "dirty"
  | "pending"
  | "inactive"
  | "not_verified"
  | "unavailable"
  | "readonly"
  | "soon"
  | "explicit"
  | "manual"
  | "preset"
  | "neutral";

const TONE_STYLES: Record<
  SettingsStatusTone,
  { style: React.CSSProperties; dashed?: boolean; dotColor?: string }
> = {
  done: {
    style: {
      backgroundColor: "var(--cfg-success-soft)",
      borderColor: "var(--cfg-success-border)",
      color: "var(--cfg-success-fg)",
    },
    dotColor: "var(--cfg-success-dot)",
  },
  active: {
    style: {
      backgroundColor: "var(--cfg-success-soft)",
      borderColor: "var(--cfg-success-border)",
      color: "var(--cfg-success-fg)",
    },
    dotColor: "var(--cfg-success-dot)",
  },
  review: {
    style: {
      backgroundColor: "var(--cfg-warning-soft)",
      borderColor: "var(--cfg-warning-border)",
      color: "var(--cfg-warning-fg)",
    },
    dotColor: "var(--cfg-warning-dot)",
  },
  dirty: {
    style: {
      backgroundColor: "var(--cfg-warning-soft)",
      borderColor: "var(--cfg-warning-border)",
      color: "var(--cfg-warning-fg)",
    },
    dotColor: "var(--cfg-warning-dot)",
  },
  manual: {
    style: {
      backgroundColor: "var(--cfg-warning-soft)",
      borderColor: "var(--cfg-warning-border)",
      color: "var(--cfg-warning-fg)",
    },
  },
  explicit: {
    style: {
      backgroundColor: "var(--cfg-primary-soft)",
      borderColor: "var(--cfg-primary-border)",
      color: "var(--cfg-primary-text)",
    },
  },
  readonly: {
    style: {
      backgroundColor: "var(--cfg-info-soft)",
      borderColor: "var(--cfg-info-border)",
      color: "var(--cfg-info-fg)",
    },
  },
  not_verified: {
    style: {
      backgroundColor: "var(--cfg-info-soft)",
      borderColor: "var(--cfg-info-border)",
      color: "var(--cfg-info-fg)",
    },
    dashed: true,
  },
  pending: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border)",
      color: "var(--cfg-muted)",
    },
    dotColor: "var(--cfg-subtle)",
  },
  inactive: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border)",
      color: "var(--cfg-muted)",
    },
  },
  preset: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border)",
      color: "var(--cfg-muted)",
    },
  },
  soon: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border-strong)",
      color: "var(--cfg-muted)",
    },
    dashed: true,
  },
  unavailable: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border-strong)",
      color: "var(--cfg-muted)",
    },
    dashed: true,
  },
  neutral: {
    style: {
      backgroundColor: "var(--cfg-inset)",
      borderColor: "var(--cfg-border)",
      color: "var(--cfg-fg-body)",
    },
  },
};

export interface SettingsStatusBadgeProps {
  tone: SettingsStatusTone;
  children: ReactNode;
  icon?: ReactNode;
  showDot?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
}

/** Pill semântica reutilizável do sistema visual Configurações (Conceito C). */
export function SettingsStatusBadge({
  tone,
  children,
  icon,
  showDot = false,
  className,
  "aria-hidden": ariaHidden,
}: SettingsStatusBadgeProps) {
  const cfg = TONE_STYLES[tone];
  return (
    <span
      aria-hidden={ariaHidden}
      style={cfg.style}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        cfg.dashed && "border-dashed",
        className,
      )}
    >
      {showDot && cfg.dotColor ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: cfg.dotColor }}
        />
      ) : null}
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
