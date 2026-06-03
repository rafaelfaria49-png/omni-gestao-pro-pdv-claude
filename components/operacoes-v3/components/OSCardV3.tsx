"use client";

import { Clock, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { StatusBadgeV3 } from "./StatusBadgeV3";
import { PaymentBadgeV3 } from "./PaymentBadgeV3";
import { formatBRL, formatRelativo } from "../lib/format";
import { isAtrasada, isEmRisco, pagamentoInfo } from "../lib/os-derive";

function equipamentoLabel(os: OrdemServico): string {
  const marcaModelo = [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ").trim();
  return marcaModelo || os.equipamento?.tipo || "Equipamento";
}

/** Card de OS reutilizado em Fila, Bancada, SLA, Histórico. Clique abre o Workspace. */
export function OSCardV3({
  os,
  onOpen,
  className,
}: {
  os: OrdemServico;
  onOpen?: (id: string) => void;
  className?: string;
}) {
  const pag = pagamentoInfo(os);
  const atrasada = isAtrasada(os);
  const risco = isEmRisco(os);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(os.id)}
      className={cn(
        "group w-full min-w-0 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-muted/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{os.codigo}</span>
        <StatusBadgeV3 status={statusV3FromOS(os)} />
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{os.cliente?.nome ?? "Cliente não identificado"}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{equipamentoLabel(os)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {pag.total > 0 ? formatBRL(pag.total) : "—"}
        </span>
        <PaymentBadgeV3 estado={pag.estado} total={pag.total} showValor={false} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{os.tecnico?.nome ?? "Sem técnico"}</span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1",
            atrasada ? "text-destructive" : risco ? "text-warning" : "",
          )}
        >
          <Clock className="h-3 w-3" aria-hidden />
          {os.sla?.prazo ? formatRelativo(os.sla.prazo) : "sem prazo"}
        </span>
      </div>
    </button>
  );
}
