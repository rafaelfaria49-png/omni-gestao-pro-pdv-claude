import { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Badge ou ação alinhada ao título (ex.: Em breve). */
  headerExtra?: ReactNode;
}

export function SettingsCard({ title, description, children, className, footer, headerExtra }: SettingsCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md",
        className,
      )}
    >
      {(title || description || headerExtra) && (
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">{title}</h3>}
            {description && (
              <p className="mt-1.5 text-sm font-normal leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
        </div>
      )}
      <div className="min-w-0 px-4 py-5 sm:px-6">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-3 border-t border-border bg-card-muted px-6 py-3 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
}
