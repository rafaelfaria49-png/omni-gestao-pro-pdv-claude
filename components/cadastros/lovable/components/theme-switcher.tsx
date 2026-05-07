import { useTheme } from "./theme-provider";
import { Palette } from "lucide-react";
import { useState } from "react";

const themes = [
  { id: "light", label: "Light", swatch: "linear-gradient(135deg, #fff, oklch(0.58 0.22 25))" },
  { id: "soft-ice", label: "Soft Ice", swatch: "linear-gradient(135deg, oklch(0.984 0.006 240), oklch(0.55 0.18 240))" },
  { id: "midnight", label: "Midnight", swatch: "linear-gradient(135deg, oklch(0.21 0.04 265), oklch(0.72 0.18 230))" },
  { id: "black-edition", label: "Black Edition", swatch: "linear-gradient(135deg, oklch(0.145 0 0), oklch(0.78 0.18 145))" },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent transition"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden md:inline text-foreground">{themes.find((t) => t.id === theme)?.label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover p-2 shadow-xl z-50">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent transition ${theme === t.id ? "bg-accent" : ""}`}
              >
                <span className="h-6 w-6 rounded-md border border-border" style={{ background: t.swatch }} />
                <span className="text-foreground">{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
