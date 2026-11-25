"use client";

import type { ReactNode } from "react";
import { SettingsSoonBadge } from "./SettingsSoonBadge";
import { cn } from "../../../lib/utils";

export interface ReadonlySummaryItem {
  label: string;
  value: string;
}

export interface SettingsReadonlySummaryProps {
  icon?: ReactNode;
  title: string;
  description: string;
  items: ReadonlySummaryItem[];
  badge?: ReactNode;
  className?: string;
}

/** Cartão compacto e honesto para preferências somente leitura / futuras (sem selects falsos desabilitados). */
export function SettingsReadonlySummary({
  icon,
  title,
  description,
  items,
  badge,
  className,
}: SettingsReadonlySummaryProps) {
  return (
    <section className={cn("cfg-card overflow-hidden", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
              style={{
                backgroundColor: "var(--cfg-inset)",
                borderColor: "var(--cfg-border)",
                color: "var(--cfg-muted)",
              }}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--cfg-fg)" }}>
                {title}
              </h3>
              {badge ?? <SettingsSoonBadge />}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--cfg-muted)" }}>
              {description}
            </p>
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-2 text-xs">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border px-3 py-1.5"
              style={{
                backgroundColor: "var(--cfg-inset)",
                borderColor: "var(--cfg-border)",
              }}
            >
              <dt className="inline" style={{ color: "var(--cfg-subtle)" }}>
                {item.label}:
              </dt>{" "}
              <dd className="inline font-semibold" style={{ color: "var(--cfg-fg)" }}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
