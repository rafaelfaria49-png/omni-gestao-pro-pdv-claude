"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ComponentType } from "react";
import * as FinanceiroRouteModule from "./routes/financeiro";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function resolveTanstackRouteComponent(mod: unknown): ComponentType | null {
  if (!isRecord(mod)) return null;
  const route = mod["Route"];
  if (!isRecord(route)) return null;
  const options = route["options"];
  if (!isRecord(options)) return null;
  const comp = options["component"];
  if (typeof comp !== "function") return null;
  return comp as unknown as ComponentType;
}

/**
 * Wrapper de isolamento para montar o Financeiro HUB Lovable dentro do Next.js:
 * - NÃO importa `styles.css` global do bundle Lovable
 * - NÃO monta o `__root.tsx` do TanStack Router (evita <html>/<body> e links globais)
 * - Renderiza somente o componente da rota `/financeiro`
 *
 * Observação: o componente Lovable lida com tema via `localStorage("theme")` e
 * `document.documentElement[data-theme]`. Isso mantém sincronia com o tema global.
 */
export function FinanceiroHubIsolated() {
  const Hub = resolveTanstackRouteComponent(FinanceiroRouteModule as unknown);
  if (!Hub) {
    return (
      <div className="w-full min-w-0 max-w-full overflow-x-hidden p-6 text-sm text-muted-foreground">
        Financeiro HUB indisponível (módulo Lovable não pôde ser carregado).
      </div>
    );
  }

  const [theme, setTheme] = useState<"light" | "soft-ice" | "midnight" | "black">("light");

  useEffect(() => {
    const get = () => {
      const v = document.documentElement.getAttribute("data-theme");
      if (v === "soft-ice" || v === "midnight" || v === "black" || v === "light") return v;
      return "light";
    };
    setTheme(get());
    const obs = new MutationObserver(() => setTheme(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const chartPalette = useMemo(() => {
    // Paleta por tema (HSL) — aplicada localmente apenas no Financeiro V2.
    // Evita classes hardcoded (text-red/bg-blue/etc) e mantém consistência premium nos gráficos.
    if (theme === "black") {
      return {
        chart1: "hsl(142 72% 45%)", // verde neon
        chart2: "hsl(84 84% 52%)", // lime tech
        chart3: "hsl(160 68% 35%)", // emerald escuro
        chart4: "hsl(142 54% 28%)",
        chart5: "hsl(170 70% 30%)",
      };
    }
    if (theme === "midnight") {
      return {
        chart1: "hsl(200 95% 56%)", // sky blue
        chart2: "hsl(190 90% 45%)", // cyan escuro
        chart3: "hsl(220 90% 68%)", // azul neon suave
        chart4: "hsl(210 30% 60%)", // slate
        chart5: "hsl(180 80% 40%)",
      };
    }
    if (theme === "soft-ice") {
      return {
        chart1: "hsl(200 90% 52%)", // azul gelo
        chart2: "hsl(190 85% 46%)", // cyan suave
        chart3: "hsl(215 85% 62%)", // azul calmo
        chart4: "hsl(210 22% 62%)", // slate leve
        chart5: "hsl(180 70% 44%)",
      };
    }
    // light
    return {
      chart1: "hsl(214 100% 50%)", // azul vivo
      chart2: "hsl(210 90% 44%)", // azul médio
      chart3: "hsl(196 90% 42%)", // cyan
      chart4: "hsl(215 24% 62%)", // slate leve
      chart5: "hsl(210 100% 72%)", // azul claro
    };
  }, [theme]);

  const tokenizedVars = useMemo(() => {
    // Conecta o bundle Lovable (que usa var(--color-*)) aos tokens globais do OmniGestão.
    // Mantém escopo local para evitar side-effects globais.
    return {
      "--color-background": "hsl(var(--background))",
      "--color-foreground": "hsl(var(--foreground))",
      "--color-card": "hsl(var(--card))",
      "--color-card-foreground": "hsl(var(--card-foreground))",
      "--color-popover": "hsl(var(--popover))",
      "--color-popover-foreground": "hsl(var(--popover-foreground))",
      "--color-border": "hsl(var(--border))",
      "--color-input": "hsl(var(--input))",
      "--color-muted": "hsl(var(--muted))",
      "--color-muted-foreground": "hsl(var(--muted-foreground))",
      "--color-primary": chartPalette.chart1,
      "--color-primary-foreground": "hsl(var(--primary-foreground))",
      "--color-ring": "hsl(var(--ring))",
      // Charts
      "--color-chart-2": chartPalette.chart2,
      "--color-chart-3": chartPalette.chart3,
      "--color-chart-4": chartPalette.chart4,
      "--color-chart-5": chartPalette.chart5,
      // Mantém destructive vindo do tema global (alertas/erros), não para série de gráficos.
      "--color-destructive": "hsl(var(--destructive))",
    } as unknown as CSSProperties;
  }, [chartPalette]);

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden" style={tokenizedVars}>
      <Hub />
    </div>
  );
}

export default FinanceiroHubIsolated;

