import { cn } from "@/lib/utils";

export type HubTheme = "light" | "soft-ice" | "midnight" | "black";

const themes: { id: HubTheme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "bg-background border-border" },
  { id: "soft-ice", label: "Soft Ice", swatch: "bg-muted border-border" },
  { id: "midnight", label: "Midnight", swatch: "bg-card border-border" },
  { id: "black", label: "Black", swatch: "bg-foreground border-border" },
];

interface Props {
  value: HubTheme;
  onChange: (t: HubTheme) => void;
}

export const ThemeSwitcher = ({ value, onChange }: Props) => (
  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
    {themes.map((t) => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        title={t.label}
        aria-label={`Tema ${t.label}`}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
          value === t.id
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span className={cn("h-3 w-3 rounded-full border", t.swatch)} />
        <span className="hidden sm:inline">{t.label}</span>
      </button>
    ))}
  </div>
);
