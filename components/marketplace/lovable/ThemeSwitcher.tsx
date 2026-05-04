"use client";

import { THEMES, useTheme } from "./ThemeProvider";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 backdrop-blur p-1 shadow-sm">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "group relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={active}
            aria-label={`Tema ${t.label}`}
          >
            <span className={cn("h-3 w-3 rounded-full border", t.swatch)} />
            <span className="hidden sm:inline">{t.label}</span>
            {active && <Check className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}
