import { Link } from "react-router-dom";
import { GripVertical, Loader2, MessageCircle, ShieldCheck, User } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { ORIGEM_LABEL } from "@/types/os";
import { PrioridadeBadge, SLABadge } from "./badges";
import { brl } from "@/lib/os/format";
import { cn } from "@/lib/utils";

interface Props {
  os: OrdemServico;
  onDragStart: (osId: string) => void;
  disabled?: boolean;
}

export function OSCard({ os, onDragStart, disabled = false }: Props) {
  const totalOrc = os.orcamento?.total;
  const wppEnviado = os.timeline.some((e) => e.tipo === "orcamento_enviado");

  return (
    <Link
      to={`/operacoes/os/${os.id}`}
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/os-id", os.id);
        onDragStart(os.id);
      }}
      className={cn(
        "group relative block rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-[0_6px_20px_-10px_hsl(var(--primary)/0.35)]",
        disabled ? "pointer-events-none opacity-60" : "cursor-grab active:cursor-grabbing",
      )}
    >
      {disabled ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="text-[11px] font-mono text-muted-foreground">{os.codigo}</span>
        </div>
        <PrioridadeBadge value={os.prioridade} />
      </div>

      <div className="mt-2">
        <div className="text-sm font-semibold text-foreground line-clamp-1">{os.cliente.nome}</div>
        <div className="text-[12px] text-muted-foreground line-clamp-1">
          {os.equipamento.tipo} · {os.equipamento.marca} {os.equipamento.modelo}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-[12px] text-muted-foreground/90">
        {os.equipamento.defeitoRelatado}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          {os.tecnico?.nome ?? "Sem técnico"}
        </div>
        <SLABadge prazo={os.sla.prazo} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {totalOrc !== undefined && (
          <span className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium">
            {brl(totalOrc)}
          </span>
        )}
        {os.garantia.ativa && (
          <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
            <ShieldCheck className="h-2.5 w-2.5" /> Garantia
          </span>
        )}
        {wppEnviado && (
          <span className="inline-flex items-center gap-0.5 rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">
            <MessageCircle className="h-2.5 w-2.5" /> WPP
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {ORIGEM_LABEL[os.origem]}
        </span>
      </div>
    </Link>
  );
}
