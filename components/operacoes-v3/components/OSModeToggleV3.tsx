"use client";

import { Bell, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModoOperacoesV3 = "recepcao" | "bancada" | "auditoria";

const MODOS: { id: ModoOperacoesV3; label: string; icon: typeof Bell }[] = [
  { id: "recepcao", label: "Recepção", icon: Bell },
  { id: "bancada", label: "Bancada", icon: Wrench },
  { id: "auditoria", label: "Auditoria", icon: Search },
];

/** Seletor de modo de uso (Recepção / Bancada / Auditoria). Controla quais
 *  colunas laterais do cockpit ficam abertas. Estado de UI puro — sem I/O. */
export function OSModeToggleV3({
  value,
  onChange,
}: {
  value: ModoOperacoesV3;
  onChange: (m: ModoOperacoesV3) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
      {MODOS.map((m) => {
        const Icon = m.icon;
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            title={m.label}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
