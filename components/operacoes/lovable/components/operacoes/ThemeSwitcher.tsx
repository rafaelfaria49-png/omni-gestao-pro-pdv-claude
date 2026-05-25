import { cn } from "@/lib/utils";

export type HubTheme =
  | "light"
  | "soft-ice"
  | "midnight"
  | "black"
  | "quantum-violet"
  | "coffee-gold"
  | "ruby-black"
  | "neon-ice"
  | "violet-ice"
  | "coffee-cream";

const themes: { id: HubTheme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "bg-background border-border" },
  { id: "ruby-black", label: "Ruby Black", swatch: "bg-[oklch(0.12_0.005_0)] border-[oklch(0.60_0.25_25)]" },
  { id: "soft-ice", label: "Soft Ice", swatch: "bg-muted border-border" },
  { id: "midnight", label: "Midnight", swatch: "bg-card border-border" },
  { id: "neon-ice", label: "Neon Ice", swatch: "bg-[oklch(0.985_0.006_145)] border-[oklch(0.70_0.20_145)]" },
  { id: "black", label: "Black", swatch: "bg-foreground border-border" },
  { id: "violet-ice", label: "Violet Ice", swatch: "bg-[oklch(0.985_0.006_295)] border-[oklch(0.60_0.18_295)]" },
  { id: "quantum-violet", label: "Quantum Violet", swatch: "bg-[oklch(0.65_0.25_310)] border-border" },
  { id: "coffee-cream", label: "Coffee Cream", swatch: "bg-[oklch(0.98_0.01_60)] border-[oklch(0.66_0.12_65)]" },
  { id: "coffee-gold", label: "Coffee Gold", swatch: "bg-[oklch(0.78_0.14_75)] border-border" },
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
