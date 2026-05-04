import { cn } from "@/lib/utils";

type Status = "online" | "warning" | "syncing" | "error";

const map: Record<Status, { label: string; color: string; dot: string }> = {
  online: { label: "Online", color: "text-success", dot: "bg-success" },
  warning: { label: "Atenção", color: "text-warning", dot: "bg-warning" },
  syncing: { label: "Sincronizando", color: "text-info", dot: "bg-info animate-pulse-soft" },
  error: { label: "Erro API", color: "text-destructive", dot: "bg-destructive" },
};

export function StatusPill({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium", m.color, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {label ?? m.label}
    </span>
  );
}
