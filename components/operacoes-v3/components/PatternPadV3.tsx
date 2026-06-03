"use client";

// ============================================================================
// Operações V3 — Senha padrão (desenho 3×3), persistida como sequência "1-2-3".
// Compartilhado pela Nova OS Enterprise e pelo bloco Senha do Workspace.
// ============================================================================

import { cn } from "@/lib/utils";
import { ButtonV3 } from "./UiV3";

export function PatternPadV3({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const seq = value ? value.split("-").filter(Boolean) : [];
  const toggle = (n: string) => {
    if (seq.includes(n)) return;
    onChange([...seq, n].join("-"));
  };
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-background p-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => {
          const idx = seq.indexOf(n);
          const on = idx >= 0;
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
              )}
              aria-label={`Ponto ${n}`}
            >
              {on ? idx + 1 : ""}
            </button>
          );
        })}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Toque os pontos na ordem do desenho.</p>
        <p className="text-sm font-medium text-foreground">{seq.length ? seq.join(" → ") : "—"}</p>
        <ButtonV3 variant="ghost" className="px-2 py-1 text-xs" onClick={() => onChange("")}>
          Limpar
        </ButtonV3>
      </div>
    </div>
  );
}
