"use client";

import { cn } from "@/components/configuracoes-v2/lib/utils";

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
        "lovable-settings-card group rounded-xl border border-[hsl(var(--border))] bg-card p-6 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
