import { useEffect, useState } from "react";
import { Sun, Snowflake, Moon, Circle } from "lucide-react";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "soft-ice", label: "Soft Ice", icon: Snowflake },
  { id: "midnight", label: "Midnight", icon: Moon },
  { id: "black", label: "Black", icon: Circle },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];
const STORAGE_KEY = "omnigestao-vendas-hub-theme";

function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-vendas-hub-theme-root]").forEach((el) => {
    el.setAttribute("data-theme", theme);
  });
}

export default function ThemeSwitcher() {
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
    <div
      className="inline-flex items-center gap-1 rounded-xl border p-1"
      style={{
        borderColor: "hsl(var(--border))",
        backgroundColor: "hsl(var(--muted))",
      }}
    >
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
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200"
            style={{
              backgroundColor: active ? "hsl(var(--primary))" : "transparent",
              color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}