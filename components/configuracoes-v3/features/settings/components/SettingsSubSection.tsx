"use client";

import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export interface SettingsSubSectionProps {
  title: string;
  description?: string;
  divided?: boolean;
  children: ReactNode;
  className?: string;
}

/** Subbloco estrutural com micro-eyebrow e separador hairline para formulários densos. */
export function SettingsSubSection({
  title,
  description,
  divided = false,
  children,
  className,
}: SettingsSubSectionProps) {
  return (
    <div
      className={cn(
        "space-y-2.5",
        divided && "border-t pt-4",
        className,
      )}
      style={divided ? { borderColor: "var(--cfg-border)" } : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          className="text-[10.5px] font-semibold uppercase tracking-[0.09em]"
          style={{ color: "var(--cfg-eyebrow)" }}
        >
          {title}
        </h4>
        {description ? (
          <p className="text-[11.5px]" style={{ color: "var(--cfg-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
