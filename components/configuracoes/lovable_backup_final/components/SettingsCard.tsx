"use client";

import { cn } from "@/components/configuracoes/lovable/lib/utils";

type Props = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
};

export function SettingsCard({ title, description, children, className }: Props) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
