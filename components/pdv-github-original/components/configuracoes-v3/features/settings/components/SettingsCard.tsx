import { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export function SettingsCard({ title, description, children, className, footer }: SettingsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md",
        className,
      )}
    >
      {(title || description) && (
        <div className="border-b border-border px-6 py-4">
          {title && <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">{title}</h3>}
          {description && (
            <p className="mt-1.5 text-sm font-normal leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-3 border-t border-border bg-card-muted px-6 py-3 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
}
