import { ArrowUpRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardStatus = "ativo" | "andamento" | "atencao" | "neutro";

const statusConfig: Record<CardStatus, { label: string; dot: string; chip: string }> = {
  ativo: {
    label: "Ativo",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  andamento: {
    label: "Em andamento",
    dot: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  atencao: {
    label: "Atenção",
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  neutro: {
    label: "Disponível",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
  },
};

export interface HubMetric {
  label: string;
  value: string | number;
}

export interface HubCardProps {
  id?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: CardStatus;
  primaryValue: string | number;
  primaryLabel: string;
  metrics?: HubMetric[];
  action: string;
  accent?: string;
  route?: string;
  onClick?: () => void;
}

export const HubCard = ({
  title,
  description,
  icon: Icon,
  status,
  primaryValue,
  primaryLabel,
  metrics = [],
  action,
  accent = "from-primary/10 to-transparent",
  onClick,
}: HubCardProps) => {
  const s = statusConfig[status];
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full text-left rounded-2xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5",
        "transition-all duration-300 hover:-translate-y-0.5 hover:ring-primary/30",
        "hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.25)]",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          accent
        )}
      />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="h-5 w-5" />
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              s.chip
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
            {s.label}
          </span>
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              {primaryValue}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{primaryLabel}</div>
          </div>
          {metrics.length > 0 && (
            <div className="flex gap-3">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-right"
                >
                  <div className="text-sm font-semibold text-foreground leading-none">
                    {m.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium text-foreground">{action}</span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </div>
    </button>
  );
};
