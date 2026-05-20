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
    <div className={cn("lovable-settings-section-header flex items-center justify-between gap-3 pb-5", className)}>
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">
          {icon}
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="lovable-settings-section-header-actions flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
