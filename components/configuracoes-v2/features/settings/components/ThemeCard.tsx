"use client";

import { ThemePreview } from "./ThemePreview";
import { useTheme } from "@/components/configuracoes-v2/contexts/ThemeContext";
import { cn } from "@/components/configuracoes-v2/lib/utils";
import { Button } from "@/components/configuracoes-v2/ui/button";

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
    <div className="lovable-settings-theme-grid grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <div
            key={t.id}
            className={cn(
              "lovable-settings-theme-tile rounded-2xl border border-border/70 bg-card/70 p-5 shadow-card transition-smooth hover:border-primary/20 hover:bg-muted/30 hover:shadow-card",
              active && "border-primary/40 shadow-elegant ring-1 ring-primary/15",
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
                  active ? "bg-primary" : "bg-muted-foreground/40",
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
