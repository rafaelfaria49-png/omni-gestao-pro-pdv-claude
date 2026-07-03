"use client";

import { Clock, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { StatusBadgeV3 } from "./StatusBadgeV3";
import { PaymentBadgeV3 } from "./PaymentBadgeV3";
import { PrioridadeBadgeV3 } from "./PrioridadeBadgeV3";
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
        "group w-full min-w-0 rounded-[12px] border border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)] p-3 text-left shadow-sm transition-colors hover:border-[var(--ops-v3-line-hover)] hover:bg-[var(--ops-v3-soft)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--ops-v3-ink)]">{os.codigo}</span>
          <PrioridadeBadgeV3 os={os} />
        </span>
        <StatusBadgeV3 status={statusV3FromOS(os)} />
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--ops-v3-body)]">
        <User className="h-3.5 w-3.5 shrink-0 text-[var(--ops-v3-subtle)]" aria-hidden />
        <span className="truncate">{os.cliente?.nome ?? "Cliente não identificado"}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ops-v3-muted)]">
        <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{equipamentoLabel(os)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-[var(--ops-v3-ink)]">
          {pag.total > 0 ? formatBRL(pag.total) : "—"}
        </span>
        <PaymentBadgeV3 estado={pag.estado} total={pag.total} showValor={false} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ops-v3-line)] pt-2 text-xs text-[var(--ops-v3-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{os.tecnico?.nome ?? "Sem técnico"}</span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1",
            atrasada ? "text-[var(--ops-v3-danger)]" : risco ? "text-[var(--ops-v3-warning)]" : "",
          )}
        >
          <Clock className="h-3 w-3" aria-hidden />
          {os.sla?.prazo ? formatRelativo(os.sla.prazo) : "sem prazo"}
        </span>
      </div>
    </button>
  );
}
