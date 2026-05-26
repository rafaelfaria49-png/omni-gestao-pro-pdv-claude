"use client";

import { useCallback, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { ThemeCard, ThemeOption } from "../components/ThemeCard";
import { useTheme, type ThemeId } from "../../../contexts/ThemeContext";
import { Palette, RotateCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { mergeAppearanceIntoPrinterConfig } from "@/lib/store-appearance";
import type { StudioThemeMode } from "@/components/theme/ThemeProvider";
import { UnidadeAtivaRequiredBanner } from "../components/UnidadeAtivaRequiredBanner";

const THEMES: ThemeOption[] = [
  { id: "light", name: "Light", description: "Claro e vibrante com toques em vermelho.", emoji: "☀️", swatches: ["0 0% 100%", "0 78% 52%", "240 5% 96%", "240 10% 12%"] },
  { id: "soft-ice", name: "Soft Ice", description: "Azul gelo, leve e moderno.", emoji: "🧊", swatches: ["205 60% 98%", "205 85% 52%", "195 80% 92%", "215 35% 18%"] },
  { id: "midnight", name: "Midnight", description: "Escuro elegante em azul profundo.", emoji: "🌌", swatches: ["222 47% 8%", "217 91% 60%", "199 95% 65%", "210 40% 96%"] },
  { id: "black", name: "Black", description: "Preto premium com verde neon.", emoji: "🖤", swatches: ["0 0% 4%", "142 90% 50%", "152 95% 55%", "140 15% 92%"] },
  { id: "quantum-violet", name: "Quantum Violet", description: "Violeta tridimensional com magenta neon.", emoji: "🔮", swatches: ["275 35% 8%", "310 85% 60%", "335 85% 65%", "275 20% 96%"] },
  { id: "coffee-gold", name: "Coffee Gold", description: "Café premium com ouro neon.", emoji: "☕", swatches: ["30 25% 8%", "38 75% 50%", "60 70% 50%", "40 20% 96%"] },
  { id: "ruby-black", name: "Ruby Black", description: "Fundo preto profundo com vermelho RafaCell.", emoji: "🔴", swatches: ["0 5% 7%", "0 84% 50%", "0 80% 60%", "0 10% 96%"] },
  { id: "neon-ice", name: "Neon Ice", description: "Branco gelo futurista com verde neon suave.", emoji: "🟢", swatches: ["145 30% 98%", "145 75% 45%", "145 80% 55%", "145 25% 18%"] },
  { id: "violet-ice", name: "Violet Ice", description: "Lilás gelo premium com roxo suave.", emoji: "🟣", swatches: ["295 30% 98%", "295 70% 52%", "310 75% 58%", "295 25% 18%"] },
  { id: "coffee-cream", name: "Coffee Cream", description: "Creme e bronze com ouro suave sofisticado.", emoji: "🧉", swatches: ["45 25% 97%", "38 65% 42%", "45 70% 48%", "35 25% 18%"] },
];

function toStudioTheme(id: ThemeId): StudioThemeMode {
  return id === "black" ? "black" : id;
}

export function AparenciaSection() {
  const { theme, setTheme } = useTheme();
  const { lojaAtivaId } = useLojaAtiva();
  const { appearance, settings, save, hydrated } = useStoreSettings();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const noLoja = !lojaAtivaId?.trim();
  const savedTheme = appearance.studioTheme;
  const activeTheme: ThemeId = savedTheme === "black" ? "black" : (savedTheme as ThemeId | undefined) ?? theme;

  const persistTheme = useCallback(
    async (next: ThemeId) => {
      const lojaHeader = lojaAtivaId?.trim();
      if (!lojaHeader) {
        toast({
          title: "Nenhuma unidade ativa",
          description: "Selecione a unidade em Lojas antes de salvar o tema.",
          variant: "destructive",
        });
        return;
      }
      setSaving(true);
      try {
        const base =
          settings?.printerConfig && typeof settings.printerConfig === "object"
            ? { ...(settings.printerConfig as Record<string, unknown>) }
            : {};
        const printerConfig = mergeAppearanceIntoPrinterConfig(base, {
          studioTheme: toStudioTheme(next),
        });
        await save({ printerConfig });
        setTheme(next);
        toast({ title: "Tema salvo", description: "Preferência gravada para esta unidade." });
      } catch (e) {
        toast({
          title: "Não foi possível salvar",
          description: e instanceof Error ? e.message : "Erro inesperado",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [lojaAtivaId, save, setTheme, settings?.printerConfig, toast],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Palette className="h-5 w-5" />}
        title="Aparência"
        description="Tema visual por unidade — salvo em printerConfig.appearance da loja ativa."
        actions={
          <Button variant="ghost" onClick={() => void persistTheme("light")} disabled={noLoja || saving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar padrão
          </Button>
        }
      />

      {noLoja ? <UnidadeAtivaRequiredBanner hint="O tema é independente em cada unidade." /> : null}

      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-snug text-foreground">Tema da unidade</h2>
          <p className="text-sm font-normal leading-relaxed text-muted-foreground">
            {hydrated && savedTheme
              ? "Tema salvo para esta unidade. Ao trocar de loja, o painel aplica o tema correspondente."
              : "Escolha um tema e ele será gravado para a unidade ativa."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {THEMES.map((opt) => (
            <ThemeCard
              key={opt.id}
              option={opt}
              active={activeTheme === opt.id}
              onApply={() => void persistTheme(opt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
