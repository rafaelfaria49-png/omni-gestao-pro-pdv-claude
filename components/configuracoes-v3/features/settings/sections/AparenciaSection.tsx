import { SectionHeader } from "../components/SectionHeader";
import { ThemeCard, ThemeOption } from "../components/ThemeCard";
import { useTheme } from "../../../contexts/ThemeContext";
import { Palette, Eye, RotateCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";

const THEMES: ThemeOption[] = [
  {
    id: "light",
    name: "Light",
    description: "Claro e vibrante com toques em vermelho.",
    emoji: "☀️",
    swatches: ["0 0% 100%", "0 78% 52%", "240 5% 96%", "240 10% 12%"],
  },
  {
    id: "soft-ice",
    name: "Soft Ice",
    description: "Azul gelo, leve e moderno.",
    emoji: "🧊",
    swatches: ["205 60% 98%", "205 85% 52%", "195 80% 92%", "215 35% 18%"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Escuro elegante em azul profundo.",
    emoji: "🌌",
    swatches: ["222 47% 8%", "217 91% 60%", "199 95% 65%", "210 40% 96%"],
  },
  {
    id: "black",
    name: "Black",
    description: "Preto premium com verde neon.",
    emoji: "🖤",
    swatches: ["0 0% 4%", "142 90% 50%", "152 95% 55%", "140 15% 92%"],
  },
];

export function AparenciaSection() {
  const { theme, setTheme, resetTheme } = useTheme();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Palette className="h-5 w-5" />}
        title="Aparência"
        description="Defina o tema visual do sistema. As cores se aplicam imediatamente."
        actions={
          <>
            <Button type="button" variant="outline" disabled>
              <Eye className="mr-2 h-4 w-4" />
              Em breve
            </Button>
            <Button variant="ghost" onClick={resetTheme}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar padrão
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-snug text-foreground">Tema do sistema</h2>
          <p className="text-sm font-normal leading-relaxed text-muted-foreground">
            Aplica-se a toda interface administrativa do OmniGestão Pro.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {THEMES.map((opt) => (
            <ThemeCard
              key={opt.id}
              option={opt}
              active={theme === opt.id}
              onApply={() => setTheme(opt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
