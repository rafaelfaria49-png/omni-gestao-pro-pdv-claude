"use client"

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useTheme as useNextThemes } from "next-themes"

export type StudioThemeMode = "light" | "soft-ice" | "midnight" | "black" | "classic"

const STORAGE_KEY = "omni-studio-dual-theme"

type StudioThemeContextValue = {
  /** Modo do estúdio / shell (Black vs Classic). */
  mode: StudioThemeMode
  setMode: (m: StudioThemeMode) => void
  toggle: () => void
}

const StudioThemeContext = createContext<StudioThemeContextValue | null>(null)
function readInitialMode(): StudioThemeMode {
  if (typeof window === "undefined") return "black"
  try {
    const v = String(localStorage.getItem(STORAGE_KEY) || "").trim()
    if (v === "light" || v === "soft-ice" || v === "midnight" || v === "black" || v === "classic") return v
    return "black"
  } catch {
    return "black"
  }
}

function applyTheme(m: StudioThemeMode, setTheme: (t: string) => void) {
  const next = m === "classic" ? "light" : m
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const root = document.documentElement
    root.classList.remove("theme-light", "theme-softice", "theme-midnight", "theme-black")
    root.classList.remove("light", "soft-ice", "midnight", "black-edition", "dark")
    root.setAttribute("data-studio-theme", next)
    if (next === "black") {
      root.classList.add("black-edition", "theme-black")
    } else if (next === "soft-ice") {
      root.classList.add("soft-ice", "theme-softice")
    } else if (next === "midnight") {
      root.classList.add("midnight", "theme-midnight")
    } else {
      root.classList.add("light", "theme-light")
    }
  }
  setTheme(next === "black" ? "black-edition" : next)
}

/**
 * Tema dual do produto (Marketing Studio + shell): sincroniza `data-studio-theme` no `<html>`
 * e espelha em `next-themes` (dark = Black, light = Classic) para tokens globais.
 */
export function StudioThemeProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useNextThemes()
  const [mode, setModeState] = useState<StudioThemeMode>("black")

  useLayoutEffect(() => {
    const initial = readInitialMode()
    setModeState(initial)
    applyTheme(initial, setTheme)
  }, [setTheme])

  const setMode = useCallback(
    (m: StudioThemeMode) => {
      setModeState(m)
      applyTheme(m, setTheme)
    },
    [setTheme]
  )

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "black" ? "light" : "black"
      applyTheme(next, setTheme)
      return next
    })
  }, [setTheme])

  const value = useMemo<StudioThemeContextValue>(
    () => ({
      mode,
      setMode,
      toggle,
    }),
    [mode, setMode, toggle]
  )

  return <StudioThemeContext.Provider value={value}>{children}</StudioThemeContext.Provider>
}

export function useStudioTheme(): StudioThemeContextValue {
  const c = useContext(StudioThemeContext)
  if (!c) {
    throw new Error("useStudioTheme must be used within StudioThemeProvider")
  }
  return c
}

/** API compatível com o snippet Lovable (`theme === "dark"` = Black Edition). */
export function useTheme() {
  const { mode, setMode, toggle } = useStudioTheme()
  const theme = mode === "classic" ? "light" : mode
  return {
    theme,
    mode,
    setTheme: (t: "light" | "soft-ice" | "midnight" | "black" | "dark") => setMode(t === "dark" ? "black" : t),
    toggle,
  }
}
