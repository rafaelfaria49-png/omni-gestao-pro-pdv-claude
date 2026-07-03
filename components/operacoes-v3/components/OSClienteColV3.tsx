"use client";

import { ChevronLeft, Clock, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import { isAtrasada, isEmRisco } from "../lib/os-derive";
import { formatDataHora } from "../lib/format";
import { StatusBadgeV3 } from "./StatusBadgeV3";

function iniciaisDe(nome?: string | null): string {
  const parts = (nome ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
  const ini = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return ini || "—";
}

/** Bloco rotulado da coluna (título uppercase + filhos). */
function ColBlock({ icon: Icon, titulo, children }: { icon: typeof User; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ops-v3-subtle)]">
        <Icon className="h-3 w-3" aria-hidden /> {titulo}
      </p>
      {children}
    </div>
  );
}

function StatRow({ label, value, tone }: { label: string; value?: string | null; tone?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-[var(--ops-v3-subtle)]">{label}</p>
      <p className={cn("mt-0.5 truncate text-[12.5px] text-[var(--ops-v3-body)]", tone)}>{value}</p>
    </div>
  );
}

/**
 * Coluna esquerda do cockpit (272 px) — resume cliente, aparelho e SLA da OS aberta.
 * Somente leitura: lê `OrdemServico` recebido via prop sem chamar hooks.
 * Recolhe para trilho clicável de 32 px quando `open = false`.
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
  // Trilho recolhido — o strip inteiro reexpande a coluna (padrão V4).
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Expandir coluna do cliente"
        aria-label="Expandir coluna do cliente"
        className="flex w-8 flex-none flex-col items-center gap-[9px] border-r border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)] pt-[9px] text-[var(--ops-v3-subtle)] transition-colors hover:bg-[var(--ops-v3-soft)] hover:text-[var(--ops-v3-ink)]"
      >
        <span className="flex h-[23px] w-[23px] items-center justify-center rounded-md bg-[var(--ops-v3-muted-bg)] text-[13px] font-semibold">
          ›
        </span>
        <span className="[writing-mode:vertical-rl] mt-1 text-[10.5px] font-semibold uppercase tracking-[0.04em]">
          Cliente · Aparelho
        </span>
      </button>
    );
  }

  const recepcao = lerRecepcaoV3(os);
  const atrasada = isAtrasada(os);
  const risco = isEmRisco(os);
  const status = statusV3FromOS(os);
  const marcaModelo = [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ");

  return (
    <aside className="flex w-[272px] flex-none flex-col border-r border-[var(--ops-v3-line)] bg-[var(--ops-v3-surface)]">
      {/* Header strip 36 px */}
      <div className="flex h-9 flex-none items-center justify-between border-b border-[var(--ops-v3-line)] px-3">
        <span className="truncate text-xs font-semibold text-[var(--ops-v3-body)]">OS {os.codigo}</span>
        <button
          type="button"
          onClick={onToggle}
          title="Recolher coluna do cliente"
          aria-label="Recolher coluna do cliente"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--ops-v3-subtle)] hover:bg-[var(--ops-v3-muted-bg)] hover:text-[var(--ops-v3-ink)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* Cliente */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ops-v3-primary-bg)] text-[11px] font-bold text-[var(--ops-v3-primary)]">
              {iniciaisDe(os.cliente?.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--ops-v3-body)]">{os.cliente?.nome ?? "Cliente"}</p>
              {os.cliente?.telefone ? (
                <p className="truncate text-xs text-[var(--ops-v3-muted)]">{os.cliente.telefone}</p>
              ) : null}
            </div>
          </div>
          <StatusBadgeV3 status={status} />
        </div>

        {/* Aparelho */}
        <div className="border-t border-[var(--ops-v3-line)] pt-3">
          <ColBlock icon={Smartphone} titulo="Aparelho">
            <StatRow label="Modelo" value={marcaModelo || os.equipamento?.tipo} />
            <StatRow label="IMEI / Série" value={os.equipamento?.numeroSerie} />
            {os.equipamento?.defeitoRelatado ? (
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-[var(--ops-v3-subtle)]">Defeito</p>
                <p className="mt-0.5 line-clamp-4 text-[12.5px] text-[var(--ops-v3-body)]">{os.equipamento.defeitoRelatado}</p>
              </div>
            ) : null}
          </ColBlock>
        </div>

        {/* SLA */}
        <div className="border-t border-[var(--ops-v3-line)] pt-3">
          <ColBlock icon={Clock} titulo="SLA">
            <StatRow
              label="Entrada"
              value={recepcao.dataEntrada ? formatDataHora(recepcao.dataEntrada) : undefined}
            />
            <StatRow
              label="Previsão"
              value={recepcao.previsaoEntrega ? formatDataHora(recepcao.previsaoEntrega) : undefined}
              tone={atrasada ? "text-[var(--ops-v3-danger)] font-semibold" : risco ? "text-[var(--ops-v3-warning)]" : undefined}
            />
            {atrasada ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ops-v3-danger-bd)] bg-[var(--ops-v3-danger-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--ops-v3-danger-fg)]">
                Atrasada
              </span>
            ) : risco ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ops-v3-warning-bd)] bg-[var(--ops-v3-warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--ops-v3-warning-fg)]">
                Em risco
              </span>
            ) : null}
          </ColBlock>
        </div>

        {/* Técnico */}
        {os.tecnico?.nome ? (
          <div className="border-t border-[var(--ops-v3-line)] pt-3">
            <ColBlock icon={User} titulo="Técnico">
              <StatRow label="Responsável" value={os.tecnico.nome} />
            </ColBlock>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
