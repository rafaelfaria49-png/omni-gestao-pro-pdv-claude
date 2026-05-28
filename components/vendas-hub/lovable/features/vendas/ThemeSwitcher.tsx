import { useEffect, useState } from "react";
import { Sun, Snowflake, Moon, Circle, Sparkles, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "ruby-black", label: "Ruby Black", icon: Moon },
  { id: "soft-ice", label: "Soft Ice", icon: Snowflake },
  { id: "midnight", label: "Midnight", icon: Moon },
  { id: "neon-ice", label: "Neon Ice", icon: Sun },
  { id: "black", label: "Black", icon: Circle },
  { id: "violet-ice", label: "Violet Ice", icon: Sparkles },
  { id: "quantum-violet", label: "Quantum Violet", icon: Sparkles },
  { id: "coffee-cream", label: "Coffee Cream", icon: Coffee },
  { id: "coffee-gold", label: "Coffee Gold", icon: Coffee },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];
const STORAGE_KEY = "omnigestao-vendas-hub-theme";

function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-vendas-hub-theme-root]").forEach((el) => {
    el.setAttribute("data-theme", theme);
  });
}

export default function ThemeSwitcher({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeId>("light");

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeId | null) ?? "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const handleChange = (next: ThemeId) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/80 backdrop-blur-md p-1 shadow-sm max-w-full">
      {THEMES.map((t) => {
        const Icon = t.icon;
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => handleChange(t.id)}
            aria-label={t.label}
            title={t.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-all duration-300",
              compact ? "px-1.5 py-1" : "px-2.5 py-1.5",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-background/40"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {!compact && <span className="hidden lg:inline">{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}