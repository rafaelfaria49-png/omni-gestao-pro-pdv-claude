import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORIDADE_CONFIG, type OSPrioridade, type SLAStatus } from "@/types/os";
import { slaRestante } from "@/lib/os/format";

export function PrioridadeBadge({ value }: { value: OSPrioridade }) {
  const cfg = PRIORIDADE_CONFIG[value];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.color)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  );
}

const slaStyles: Record<SLAStatus, { cls: string; Icon: typeof Clock }> = {
  ok: { cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", Icon: CheckCircle2 },
  atencao: { cls: "bg-amber-500/10 text-amber-500 border-amber-500/20", Icon: Clock },
  estourado: { cls: "bg-rose-500/10 text-rose-500 border-rose-500/20", Icon: AlertTriangle },
};

export function SLABadge({ prazo }: { prazo: string }) {
  const r = slaRestante(prazo);
  const s = slaStyles[r.status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", s.cls)}>
      <s.Icon className="h-3 w-3" />
      {r.texto}
    </span>
  );
}
