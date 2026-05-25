import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "soft-ice" | "midnight" | "black-edition" | "quantum-violet" | "coffee-gold";

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
});

const GLOBAL_KEY = "omni-studio-dual-theme";
const THEME_CLASSES = ["soft-ice", "midnight", "black-edition", "quantum-violet", "coffee-gold"] as const;

function readGlobalTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(GLOBAL_KEY) as Theme | null;
  return stored ?? "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readGlobalTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...THEME_CLASSES);
    root.setAttribute("data-studio-theme", theme);
    if (theme !== "light") root.classList.add(theme);
    localStorage.setItem(GLOBAL_KEY, theme);
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
