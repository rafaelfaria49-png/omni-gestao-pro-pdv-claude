"use client";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
};

export function ConfigCard({ title, description, children, className, footer }: Props) {
  return (
    <section
      className={cn(
        "config-v2-card rounded-2xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="px-6 py-6">{children}</div>
      {footer ? <div className="border-t border-border px-6 py-4">{footer}</div> : null}
    </section>
  );
}
