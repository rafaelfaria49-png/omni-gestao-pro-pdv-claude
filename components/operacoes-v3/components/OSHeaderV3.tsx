"use client";

import type { ReactNode } from "react";
import { Clock, MapPin, Smartphone, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { StatusBadgeV3 } from "./StatusBadgeV3";
import { PaymentBadgeV3 } from "./PaymentBadgeV3";
import { formatBRL, formatDataHora } from "../lib/format";
import { isAtrasada, isEmRisco, pagamentoInfo } from "../lib/os-derive";

function Field({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        {label}
      </div>
      <div className={cn("mt-0.5 truncate text-sm font-medium text-foreground", tone)}>{value || "—"}</div>
    </div>
  );
}

/** Cabeçalho fixo/sticky da OS no Workspace. Campos sem dado → traço (—). */
export function OSHeaderV3({ os }: { os: OrdemServico }) {
  const pag = pagamentoInfo(os);
  const atrasada = isAtrasada(os);
  const risco = isEmRisco(os);
  const equipamento =
    [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ").trim() ||
    os.equipamento?.tipo ||
    "";
  const localizacao = (os.equipamento?.numeroSerie ? `Série ${os.equipamento.numeroSerie}` : "") || "";

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-foreground">{os.codigo}</h2>
          <StatusBadgeV3 status={os.status} />
          <PaymentBadgeV3 estado={pag.estado} total={pag.total} />
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total da OS</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {pag.total > 0 ? formatBRL(pag.total) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field icon={<User className="h-3 w-3" />} label="Cliente" value={os.cliente?.nome} />
        <Field icon={<Smartphone className="h-3 w-3" />} label="Equipamento" value={equipamento} />
        <Field icon={<Wrench className="h-3 w-3" />} label="Técnico" value={os.tecnico?.nome} />
        <Field
          icon={<Clock className="h-3 w-3" />}
          label="Prazo / SLA"
          value={os.sla?.prazo ? formatDataHora(os.sla.prazo) : ""}
          tone={atrasada ? "text-destructive" : risco ? "text-warning" : undefined}
        />
        <Field icon={<MapPin className="h-3 w-3" />} label="Localização" value={localizacao} />
      </div>
    </div>
  );
}
