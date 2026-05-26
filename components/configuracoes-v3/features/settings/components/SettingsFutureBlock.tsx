import type { LucideIcon } from "lucide-react";
import { SettingsSoonBadge } from "./SettingsSoonBadge";

type SettingsFutureBlockProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

/** Recurso ainda não disponível — sem switch/checkbox que simule persistência. */
export function SettingsFutureBlock({ title, description, icon: Icon }: SettingsFutureBlockProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-border bg-card-muted/60 px-4 py-3 min-w-0">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <SettingsSoonBadge className="shrink-0" />
    </div>
  );
}
