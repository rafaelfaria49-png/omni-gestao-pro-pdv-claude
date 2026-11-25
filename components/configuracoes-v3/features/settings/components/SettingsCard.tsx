import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export interface SettingsCardProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  footerHint?: ReactNode;
  /** Feedback contextual ancorado acima do rodapé do card. */
  feedback?: ReactNode;
  /** Badge ou ação alinhada ao título (ex.: Em breve, Alterações não salvas). */
  headerExtra?: ReactNode;
}

export function SettingsCard({
  title,
  description,
  icon,
  children,
  className,
  bodyClassName,
  footer,
  footerHint,
  feedback,
  headerExtra,
}: SettingsCardProps) {
  return (
    <div className={cn("cfg-card min-w-0 overflow-hidden", className)}>
      {(title || description || headerExtra) && (
        <div
          className="flex flex-col gap-2.5 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          style={{ borderColor: "var(--cfg-border)" }}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {icon ? (
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-primary"
                style={{
                  backgroundColor: "var(--cfg-inset)",
                  borderColor: "var(--cfg-border)",
                }}
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              {title && (
                <h3
                  className="text-[14.5px] font-semibold leading-snug tracking-tight"
                  style={{ color: "var(--cfg-fg)" }}
                >
                  {title}
                </h3>
              )}
              {description && (
                <p
                  className="mt-0.5 text-xs font-normal leading-relaxed"
                  style={{ color: "var(--cfg-muted)" }}
                >
                  {description}
                </p>
              )}
            </div>
          </div>
          {headerExtra ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{headerExtra}</div>
          ) : null}
        </div>
      )}

      <div className={cn("min-w-0 px-4 py-4 sm:px-5", bodyClassName)}>
        {children}
        {feedback ? <div className="mt-4">{feedback}</div> : null}
      </div>

      {footer && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 sm:px-5"
          style={{
            borderColor: "var(--cfg-border)",
            backgroundColor: "var(--cfg-inset)",
          }}
        >
          {footerHint ? (
            <span className="text-xs" style={{ color: "var(--cfg-muted)" }}>
              {footerHint}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{footer}</div>
        </div>
      )}
    </div>
  );
}
