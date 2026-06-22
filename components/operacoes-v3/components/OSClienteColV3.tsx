"use client";

import { ChevronLeft, ChevronRight, Clock, Smartphone, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import { isAtrasada, isEmRisco } from "../lib/os-derive";
import { formatDataHora } from "../lib/format";
import { StatusBadgeV3 } from "./StatusBadgeV3";

function ColRow({
  label,
  value,
  tone,
}: {
  label: string;
  value?: string | null;
  tone?: string;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-xs text-foreground", tone)}>{value}</p>
    </div>
  );
}

/**
 * Coluna esquerda do cockpit — resume o cliente e o aparelho da OS aberta.
 * Somente leitura: lê `OrdemServico` recebido via prop sem chamar hooks.
 * Recolhe para trilho de 32 px quando `open = false`.
 */
export function OSClienteColV3({
  os,
  open,
  onToggle,
}: {
  os: OrdemServico;
  open: boolean;
  onToggle: () => void;
}) {
  const recepcao = lerRecepcaoV3(os);
  const atrasada = isAtrasada(os);
  const risco = isEmRisco(os);
  const status = statusV3FromOS(os);
  const marcaModelo = [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ");

  return (
    <div
      className={cn(
        "relative flex flex-none flex-col border-r border-border bg-card/40 transition-[width] duration-200",
        open ? "w-[272px]" : "w-8",
      )}
    >
      {/* Botão de colapso */}
      <button
        type="button"
        onClick={onToggle}
        title={open ? "Recolher coluna do cliente" : "Expandir coluna do cliente"}
        aria-label={open ? "Recolher" : "Abrir coluna do cliente"}
        className="absolute -right-3 top-4 z-20 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
      >
        {open ? (
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      {open && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3 pt-4">
          {/* Código + status */}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              OS {os.codigo}
            </p>
            <StatusBadgeV3 status={status} />
          </div>

          {/* Cliente */}
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-3 w-3" aria-hidden /> Cliente
            </p>
            <ColRow label="Nome" value={os.cliente?.nome} />
            <ColRow label="Telefone" value={os.cliente?.telefone} />
            <ColRow label="Documento" value={os.cliente?.documento} />
          </div>

          {/* Aparelho */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Smartphone className="h-3 w-3" aria-hidden /> Aparelho
            </p>
            {marcaModelo ? (
              <ColRow label="Modelo" value={marcaModelo} />
            ) : (
              <ColRow label="Tipo" value={os.equipamento?.tipo} />
            )}
            <ColRow label="IMEI / Série" value={os.equipamento?.numeroSerie} />
            {os.equipamento?.defeitoRelatado ? (
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Defeito
                </p>
                <p className="mt-0.5 line-clamp-4 text-xs text-foreground">
                  {os.equipamento.defeitoRelatado}
                </p>
              </div>
            ) : null}
          </div>

          {/* SLA */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden /> SLA
            </p>
            <ColRow
              label="Entrada"
              value={recepcao.dataEntrada ? formatDataHora(recepcao.dataEntrada) : undefined}
            />
            <ColRow
              label="Previsão"
              value={recepcao.previsaoEntrega ? formatDataHora(recepcao.previsaoEntrega) : undefined}
              tone={
                atrasada
                  ? "text-destructive font-semibold"
                  : risco
                    ? "text-warning"
                    : undefined
              }
            />
            {atrasada ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                <Zap className="h-3 w-3" aria-hidden /> Atrasada
              </span>
            ) : risco ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                <Zap className="h-3 w-3" aria-hidden /> Em risco
              </span>
            ) : null}
          </div>

          {/* Técnico */}
          {os.tecnico?.nome ? (
            <div className="border-t border-border pt-3">
              <ColRow label="Técnico" value={os.tecnico.nome} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
