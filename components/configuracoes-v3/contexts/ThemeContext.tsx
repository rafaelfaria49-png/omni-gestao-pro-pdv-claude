"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

export type ThemeId = "light" | "soft-ice" | "midnight" | "black";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "omnigestao.theme";
const DEFAULT_THEME: ThemeId = "light";

const VALID_THEMES: readonly ThemeId[] = ["light", "soft-ice", "midnight", "black"];

function normalizeStoredTheme(raw: string | null): ThemeId {
  if (!raw) return DEFAULT_THEME;
  if (raw === "black-edition") return "black";
  if (VALID_THEMES.includes(raw as ThemeId)) return raw as ThemeId;
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return normalizeStoredTheme(localStorage.getItem(STORAGE_KEY));
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (t) => setThemeState(t),
      resetTheme: () => setThemeState(DEFAULT_THEME),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
