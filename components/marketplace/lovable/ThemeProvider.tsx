"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme =
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

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "light", label: "Light", swatch: "bg-white border-zinc-200" },
  { id: "ruby-black", label: "Ruby Black", swatch: "bg-[oklch(0.12_0.005_0)] border-[oklch(0.60_0.25_25)]" },
  { id: "soft-ice", label: "Soft Ice", swatch: "bg-[hsl(220_33%_98%)] border-[hsl(220_75%_52%)]" },
  { id: "midnight", label: "Midnight", swatch: "bg-[hsl(230_30%_16%)] border-[hsl(215_95%_70%)]" },
  { id: "neon-ice", label: "Neon Ice", swatch: "bg-[oklch(0.985_0.006_145)] border-[oklch(0.70_0.20_145)]" },
  { id: "black", label: "Black", swatch: "bg-black border-[hsl(142_70%_55%)]" },
  { id: "violet-ice", label: "Violet Ice", swatch: "bg-[oklch(0.985_0.006_295)] border-[oklch(0.60_0.18_295)]" },
  { id: "quantum-violet", label: "Quantum Violet", swatch: "bg-[oklch(0.65_0.25_310)] border-zinc-200" },
  { id: "coffee-cream", label: "Coffee Cream", swatch: "bg-[oklch(0.98_0.01_60)] border-[oklch(0.66_0.12_65)]" },
  { id: "coffee-gold", label: "Coffee Gold", swatch: "bg-[oklch(0.78_0.14_75)] border-zinc-200" },
];

type Ctx = { theme: Theme; setTheme: (t: Theme) => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("ogp.theme") as Theme) || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle(
      "dark",
      theme === "midnight" ||
        theme === "black" ||
        theme === "quantum-violet" ||
        theme === "coffee-gold" ||
        theme === "ruby-black"
    );
    localStorage.setItem("ogp.theme", theme);
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
