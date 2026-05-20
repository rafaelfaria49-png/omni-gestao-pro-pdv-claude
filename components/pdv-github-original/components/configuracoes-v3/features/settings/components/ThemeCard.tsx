import { Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { ThemeId } from "../../../contexts/ThemeContext";
import { ThemePreview } from "./ThemePreview";
import { cn } from "../../../lib/utils";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  emoji: string;
  swatches: string[]; // hsl strings
}

interface ThemeCardProps {
  option: ThemeOption;
  active: boolean;
  onApply: () => void;
}

export function ThemeCard({ option, active, onApply }: ThemeCardProps) {
  return (
    <div
      className={cn(
        "group relative flex min-h-0 flex-col p-4 gap-4 rounded-xl border bg-card shadow-soft transition-all",
        active
          ? "border-primary ring-2 ring-primary/35 shadow-card"
          : "border-border hover:border-primary/45 hover:shadow-card",
      )}
    >
      {active && (
        <div className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        </div>
      )}

      <ThemePreview theme={option.id} />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none" aria-hidden>
            {option.emoji}
          </span>
          <h4 className="text-lg font-semibold leading-snug text-foreground">{option.name}</h4>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{option.description}</p>
      </div>

      <div className="flex items-center gap-2">
        {option.swatches.map((s, i) => (
          <span
            key={i}
            className="h-4 w-4 shrink-0 rounded-full border border-border/60"
            style={{ background: `hsl(${s})` }}
          />
        ))}
      </div>

      <Button
        variant={active ? "secondary" : "default"}
        className={cn(
          "mt-auto w-full font-medium",
          !active &&
            "border-0 bg-gradient-primary !text-white shadow-soft hover:brightness-[1.06] hover:shadow-md",
        )}
        onClick={onApply}
        disabled={active}
      >
        {active ? "Tema atual" : "Aplicar tema"}
      </Button>
    </div>
  );
}
