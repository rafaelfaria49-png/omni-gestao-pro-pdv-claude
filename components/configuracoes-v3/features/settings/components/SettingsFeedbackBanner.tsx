"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, OctagonAlert } from "lucide-react";
import { cn } from "../../../lib/utils";

export type SettingsFeedbackVariant = "info" | "warning" | "error" | "success" | "readonly";

const VARIANT_CONFIG: Record<
  SettingsFeedbackVariant,
  {
    icon: typeof Info;
    role: "alert" | "status";
    style: React.CSSProperties;
    iconColor: string;
  }
> = {
  info: {
    icon: Info,
    role: "status",
    style: {
      backgroundColor: "var(--cfg-info-soft)",
      borderColor: "var(--cfg-info-border)",
      color: "var(--cfg-info-fg)",
    },
    iconColor: "var(--cfg-info-fg)",
  },
  readonly: {
    icon: Lock,
    role: "status",
    style: {
      backgroundColor: "var(--cfg-info-soft)",
      borderColor: "var(--cfg-info-border)",
      color: "var(--cfg-info-fg)",
    },
    iconColor: "var(--cfg-info-fg)",
  },
  warning: {
    icon: AlertTriangle,
    role: "status",
    style: {
      backgroundColor: "var(--cfg-warning-soft)",
      borderColor: "var(--cfg-warning-border)",
      color: "var(--cfg-fg)",
    },
    iconColor: "var(--cfg-warning-fg)",
  },
  error: {
    icon: OctagonAlert,
    role: "alert",
    style: {
      backgroundColor: "var(--cfg-danger-soft)",
      borderColor: "var(--cfg-danger-border)",
      color: "var(--cfg-danger-fg)",
    },
    iconColor: "var(--cfg-danger-fg)",
  },
  success: {
    icon: CheckCircle2,
    role: "status",
    style: {
      backgroundColor: "var(--cfg-success-soft)",
      borderColor: "var(--cfg-success-border)",
      color: "var(--cfg-success-fg)",
    },
    iconColor: "var(--cfg-success-fg)",
  },
};

export interface SettingsFeedbackBannerProps {
  variant: SettingsFeedbackVariant;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}

/** Banner contextual ancorado para feedbacks de validação, erro parcial, sucesso, aviso ou somente leitura. */
export function SettingsFeedbackBanner({
  variant,
  title,
  children,
  action,
  role,
  className,
}: SettingsFeedbackBannerProps) {
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.icon;
  return (
    <div
      role={role ?? cfg.role}
      style={cfg.style}
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: cfg.iconColor }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          {title ? <p className="text-[13px] font-semibold leading-snug">{title}</p> : null}
          {children ? <div className="text-xs leading-relaxed">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
