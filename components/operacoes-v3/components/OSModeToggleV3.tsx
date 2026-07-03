"use client";

import { Bell, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModoOperacoesV3 = "recepcao" | "bancada" | "auditoria";

const MODOS: { id: ModoOperacoesV3; label: string; hint: string; icon: typeof Bell }[] = [
  { id: "recepcao", label: "Recepção", hint: "Cliente + Atividade abertos", icon: Bell },
  { id: "bancada", label: "Bancada", hint: "Laterais recolhidas · workspace máximo", icon: Wrench },
  { id: "auditoria", label: "Auditoria", hint: "Cliente recolhido · Atividade aberta", icon: Search },
];

/** Seletor de modo de uso (Recepção / Bancada / Auditoria) — segmented control.
 *  Controla quais colunas laterais do cockpit ficam abertas. Estado de UI puro. */
export function OSModeToggleV3({
  value,
  onChange,
}: {
  value: ModoOperacoesV3;
  onChange: (m: ModoOperacoesV3) => void;
}) {
  return (
    <div className="flex h-7 items-center gap-[3px] rounded-[9px] border border-[var(--ops-v3-line)] bg-[var(--ops-v3-muted-bg-2)] p-0.5">
      {MODOS.map((m) => {
        const Icon = m.icon;
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            title={m.hint}
            aria-pressed={active}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold transition-colors",
              active
                ? "bg-[var(--ops-v3-surface)] text-[var(--ops-v3-primary)] shadow-sm"
                : "text-[var(--ops-v3-muted)] hover:text-[var(--ops-v3-ink)]",
            )}
          >
            <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
