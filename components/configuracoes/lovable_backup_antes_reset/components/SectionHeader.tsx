"use client";

import { cn } from "@/components/configuracoes/lovable/lib/utils";

type Props = {
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, right, className }: Props) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
