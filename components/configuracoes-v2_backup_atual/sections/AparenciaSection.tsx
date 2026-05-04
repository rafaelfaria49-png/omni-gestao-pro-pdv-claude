"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";
import { useState } from "react";

/** Alinhado aos modos do produto; pré-visualização só com tokens (sem cores hardcoded). */
const THEMES = [
  { id: "light", name: "Light", hint: "Clareza e contraste suave", swatch: "from-card via-muted/40 to-background" },
  { id: "soft-ice", name: "Soft Ice", hint: "Tons gelados", swatch: "from-muted/30 via-card to-muted/60" },
  { id: "midnight", name: "Midnight", hint: "Escuro elegante", swatch: "from-muted/50 via-card to-muted/80" },
  { id: "black", name: "Black Edition", hint: "Alto contraste", swatch: "from-card via-muted/70 to-muted" },
] as const;

export function AparenciaSection() {
  const [draft, setDraft] = useState<string>("light");

  return (
    <ConfigSection>
      <ConfigHeader
        title="Aparência"
        description="Pré-visualização de temas. A aplicação global será ligada nas próximas etapas."
      />

      <ConfigCard
        title="Temas"
        description="Escolha uma aparência. Esta página apenas simula a escolha."
        footer={
          <div className="flex justify-end">
            <Button size="lg" className="rounded-xl px-6" onClick={toastConfigV2Pending}>
              Aplicar tema
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((t) => {
            const active = draft === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDraft(t.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  active ? "border-primary ring-2 ring-primary/25 shadow-md" : "border-border hover:border-primary/30",
                )}
              >
                <div className={cn("mb-3 h-16 w-full rounded-xl bg-gradient-to-br ring-1 ring-border/50", t.swatch)} />
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </button>
            );
          })}
        </div>
      </ConfigCard>
    </ConfigSection>
  );
}
