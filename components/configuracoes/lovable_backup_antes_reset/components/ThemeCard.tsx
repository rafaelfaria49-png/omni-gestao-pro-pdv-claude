"use client";

import { ThemePreview } from "./ThemePreview";
import { useTheme } from "../contexts/ThemeContext";
import { cn } from "@/components/configuracoes/lovable/lib/utils";
import { Button } from "@/components/configuracoes/lovable/ui/button";

type ThemeOption = {
  id: "light" | "soft-ice" | "midnight" | "black-edition";
  label: string;
  hint?: string;
};

const THEMES: ThemeOption[] = [
  { id: "light", label: "Light", hint: "Clássico claro" },
  { id: "soft-ice", label: "Soft Ice", hint: "Neutro e suave" },
  { id: "midnight", label: "Midnight", hint: "Escuro elegante" },
  { id: "black-edition", label: "Black Edition", hint: "Alto contraste" },
];

export function ThemeCard() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <div
            key={t.id}
            className={cn(
              "rounded-2xl border border-border bg-card/60 p-4 transition-smooth hover:bg-muted/40",
              active && "border-primary/35 shadow-elegant"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{t.label}</div>
                {t.hint ? <div className="text-xs text-muted-foreground">{t.hint}</div> : null}
              </div>
              <span
                className={cn(
                  "mt-1 h-2.5 w-2.5 rounded-full",
                  active ? "bg-primary" : "bg-muted-foreground/40"
                )}
              />
            </div>

            <div className="mt-3">
              <ThemePreview active={active} label="Preview" />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                className={cn("w-full", !active && "bg-primary/90")}
                onClick={() => setTheme(t.id)}
              >
                {active ? "Tema ativo" : "Aplicar tema"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

