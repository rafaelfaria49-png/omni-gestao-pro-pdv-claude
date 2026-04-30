"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTheme as useNextThemes } from "next-themes"

export type Theme = "light" | "soft-ice" | "midnight" | "black-edition"

type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const ALL_CLASSES: Theme[] = ["light", "soft-ice", "midnight", "black-edition"]
const STORAGE_KEY = "ia-mestre-premium-theme"

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "midnight"
  try {
    const v = String(localStorage.getItem(STORAGE_KEY) || "").trim() as Theme
    return ALL_CLASSES.includes(v) ? v : "midnight"
  } catch {
    return "midnight"
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setTheme: setNextTheme } = useNextThemes()
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
    const root = document.documentElement
    ALL_CLASSES.forEach((c) => root.classList.remove(c))
    if (theme !== "light") root.classList.add(theme)
    // Mantém next-themes em sincronia (senão fica preso em "dark" e o painel não clareia).
    setNextTheme(theme)
    return () => {
      ALL_CLASSES.forEach((c) => root.classList.remove(c))
    }
  }, [setNextTheme, theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

