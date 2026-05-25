import type { ThemeId } from "../../../contexts/ThemeContext";

interface ThemePreviewProps {
  theme: ThemeId;
}

/** Cores explícitas por tema — o preview fica correto (Midnight/Black escuros) sem depender de data-theme aninhado. */
const PALETTE: Record<
  ThemeId,
  {
    shell: string;
    sidebar: string;
    sidebarActive: string;
    muted: string;
    bar: string;
    primaryPill: string;
    card: string;
    cardBorder: string;
    accentLine: string;
    gradientBar: string;
  }
> = {
  light: {
    shell: "hsl(0 0% 100%)",
    sidebar: "hsl(240 8% 98%)",
    sidebarActive: "hsl(0 78% 96%)",
    muted: "hsl(240 5% 96%)",
    bar: "hsl(240 10% 12% / 0.85)",
    primaryPill: "hsl(0 78% 52%)",
    card: "hsl(0 0% 100%)",
    cardBorder: "hsl(240 6% 90%)",
    accentLine: "hsl(0 78% 96%)",
    gradientBar: "linear-gradient(135deg, hsl(0 78% 52%), hsl(14 90% 60%))",
  },
  "soft-ice": {
    shell: "hsl(205 60% 98%)",
    sidebar: "hsl(205 55% 96%)",
    sidebarActive: "hsl(195 80% 92%)",
    muted: "hsl(205 40% 94%)",
    bar: "hsl(215 35% 18% / 0.88)",
    primaryPill: "hsl(205 85% 52%)",
    card: "hsl(0 0% 100%)",
    cardBorder: "hsl(205 30% 88%)",
    accentLine: "hsl(195 80% 92%)",
    gradientBar: "linear-gradient(135deg, hsl(205 85% 52%), hsl(195 90% 62%))",
  },
  midnight: {
    shell: "hsl(222 47% 8%)",
    sidebar: "hsl(222 47% 7%)",
    sidebarActive: "hsl(217 60% 20%)",
    muted: "hsl(222 32% 16%)",
    bar: "hsl(210 40% 96% / 0.85)",
    primaryPill: "hsl(217 91% 60%)",
    card: "hsl(222 40% 11%)",
    cardBorder: "hsl(222 30% 18%)",
    accentLine: "hsl(217 60% 22%)",
    gradientBar: "linear-gradient(135deg, hsl(217 91% 60%), hsl(199 95% 65%))",
  },
  black: {
    shell: "hsl(0 0% 4%)",
    sidebar: "hsl(0 0% 3%)",
    sidebarActive: "hsl(142 60% 12%)",
    muted: "hsl(0 0% 12%)",
    bar: "hsl(140 15% 92% / 0.88)",
    primaryPill: "hsl(142 90% 50%)",
    card: "hsl(0 0% 7%)",
    cardBorder: "hsl(0 0% 15%)",
    accentLine: "hsl(142 60% 14%)",
    gradientBar: "linear-gradient(135deg, hsl(142 90% 50%), hsl(152 95% 55%))",
  },
  "quantum-violet": {
    shell: "hsl(275 35% 8%)",
    sidebar: "hsl(275 40% 7%)",
    sidebarActive: "hsl(310 60% 20%)",
    muted: "hsl(275 25% 14%)",
    bar: "hsl(275 20% 96% / 0.88)",
    primaryPill: "hsl(310 85% 60%)",
    card: "hsl(275 30% 12%)",
    cardBorder: "hsl(275 25% 20%)",
    accentLine: "hsl(335 85% 65%)",
    gradientBar: "linear-gradient(135deg, hsl(310 85% 60%), hsl(335 85% 65%))",
  },
  "coffee-gold": {
    shell: "hsl(30 25% 8%)",
    sidebar: "hsl(30 30% 7%)",
    sidebarActive: "hsl(38 50% 16%)",
    muted: "hsl(30 15% 14%)",
    bar: "hsl(40 20% 96% / 0.88)",
    primaryPill: "hsl(38 75% 50%)",
    card: "hsl(30 20% 12%)",
    cardBorder: "hsl(30 15% 20%)",
    accentLine: "hsl(60 70% 50%)",
    gradientBar: "linear-gradient(135deg, hsl(38 75% 50%), hsl(60 70% 50%))",
  },
  "ruby-black": {
    shell: "hsl(0 5% 7%)",
    sidebar: "hsl(0 5% 6%)",
    sidebarActive: "hsl(0 84% 15%)",
    muted: "hsl(0 4% 10%)",
    bar: "hsl(0 10% 96% / 0.88)",
    primaryPill: "hsl(0 84% 50%)",
    card: "hsl(0 4% 11%)",
    cardBorder: "hsl(0 8% 18%)",
    accentLine: "hsl(0 80% 60%)",
    gradientBar: "linear-gradient(135deg, hsl(0 84% 50%), hsl(0 80% 60%))",
  },
  "neon-ice": {
    shell: "hsl(145 30% 98%)",
    sidebar: "hsl(145 28% 96%)",
    sidebarActive: "hsl(145 80% 92%)",
    muted: "hsl(145 20% 96%)",
    bar: "hsl(145 25% 18% / 0.88)",
    primaryPill: "hsl(145 75% 45%)",
    card: "hsl(0 0% 100%)",
    cardBorder: "hsl(145 20% 90%)",
    accentLine: "hsl(145 80% 55%)",
    gradientBar: "linear-gradient(135deg, hsl(145 75% 45%), hsl(145 80% 55%))",
  },
  "violet-ice": {
    shell: "hsl(295 30% 98%)",
    sidebar: "hsl(295 28% 96%)",
    sidebarActive: "hsl(295 75% 92%)",
    muted: "hsl(295 20% 96%)",
    bar: "hsl(295 25% 18% / 0.88)",
    primaryPill: "hsl(295 70% 52%)",
    card: "hsl(0 0% 100%)",
    cardBorder: "hsl(295 20% 90%)",
    accentLine: "hsl(310 75% 58%)",
    gradientBar: "linear-gradient(135deg, hsl(295 70% 52%), hsl(310 75% 58%))",
  },
  "coffee-cream": {
    shell: "hsl(45 25% 97%)",
    sidebar: "hsl(45 25% 94%)",
    sidebarActive: "hsl(38 50% 92%)",
    muted: "hsl(45 20% 95%)",
    bar: "hsl(35 25% 18% / 0.88)",
    primaryPill: "hsl(38 65% 42%)",
    card: "hsl(45 30% 99%)",
    cardBorder: "hsl(45 15% 89%)",
    accentLine: "hsl(45 70% 48%)",
    gradientBar: "linear-gradient(135deg, hsl(38 65% 42%), hsl(45 70% 48%))",
  },
};

export function ThemePreview({ theme }: ThemePreviewProps) {
  const c = PALETTE[theme];

  return (
    <div
      className="overflow-hidden rounded-lg border shadow-inner"
      style={{ backgroundColor: c.shell, borderColor: c.cardBorder }}
    >
      <div className="flex h-32">
        <div className="w-1/3 shrink-0 space-y-1 p-2" style={{ backgroundColor: c.sidebar }}>
          <div className="h-1.5 w-3/4 rounded" style={{ backgroundColor: c.muted }} />
          <div className="h-1.5 w-full rounded" style={{ backgroundColor: c.sidebarActive }} />
          <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: c.muted }} />
          <div className="h-1.5 w-3/4 rounded" style={{ backgroundColor: c.muted }} />
          <div className="mt-1.5 h-4 w-full rounded-sm" style={{ background: c.gradientBar }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-2" style={{ backgroundColor: c.shell }}>
          <div className="flex items-center justify-between gap-1.5">
            <div className="h-1.5 w-1/2 rounded" style={{ backgroundColor: c.bar }} />
            <div className="h-3 w-8 shrink-0 rounded-sm" style={{ backgroundColor: c.primaryPill }} />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 pt-0.5">
            <div className="rounded-lg border" style={{ backgroundColor: c.card, borderColor: c.cardBorder }} />
            <div className="rounded-lg border" style={{ backgroundColor: c.card, borderColor: c.cardBorder }} />
          </div>
          <div className="space-y-1 pt-0.5">
            <div className="h-1 w-full rounded" style={{ backgroundColor: c.muted }} />
            <div className="h-1 w-4/5 rounded" style={{ backgroundColor: c.muted }} />
            <div className="h-1 w-2/3 rounded" style={{ backgroundColor: c.accentLine }} />
          </div>
        </div>
      </div>
    </div>
  );
}
