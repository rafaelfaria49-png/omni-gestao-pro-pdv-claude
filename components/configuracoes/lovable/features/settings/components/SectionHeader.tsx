"use client";

import { cn } from "@/components/configuracoes/lovable/lib/utils";

type Props = {
  title: React.ReactNode;
  description?: string;
  right?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, right, className }: Props) {
  return (
    <div
      className={cn(
        "lovable-settings-section-header mb-8 flex flex-wrap items-center justify-between gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-x-2 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        ) : null}
      </div>
      {right ? <div className="lovable-settings-section-header-actions shrink-0">{right}</div> : null}
    </div>
  );
}
