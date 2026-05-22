"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  ReactNode,
} from "react";
import { useTheme as useGlobalTheme } from "@/components/theme/ThemeProvider";

export type ThemeId = "light" | "soft-ice" | "midnight" | "black";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: globalTheme, setTheme: setGlobalTheme } = useGlobalTheme();

  const theme: ThemeId = useMemo(() => {
    if (globalTheme === "black-edition") return "black";
    return (globalTheme as ThemeId) || "light";
  }, [globalTheme]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (t) => {
        setGlobalTheme(t === "black" ? "black-edition" : t);
      },
      resetTheme: () => setGlobalTheme("light"),
    }),
    [theme, setGlobalTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
