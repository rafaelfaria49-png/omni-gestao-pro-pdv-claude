import { ReactNode } from "react";

import { cn } from "../../../lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, actions, icon, className }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "lovable-settings-section-header flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          {icon ? <span className="inline-flex shrink-0 text-primary">{icon}</span> : null}
          <span>{title}</span>
        </h2>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="lovable-settings-section-header-actions flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
