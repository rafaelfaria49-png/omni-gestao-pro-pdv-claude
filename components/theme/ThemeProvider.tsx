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

export type StudioThemeMode = "light" | "soft-ice" | "midnight" | "black" | "classic"
export type StudioThemeClass = "light" | "soft-ice" | "midnight" | "black-edition"

const STORAGE_KEY = "omni-studio-dual-theme"

type StudioThemeContextValue = {
  /** Modo do estúdio / shell (Black vs Classic). */
  mode: StudioThemeMode
  setMode: (m: StudioThemeMode) => void
  toggle: () => void
}

export const StudioThemeContext = createContext<StudioThemeContextValue | null>(null)
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

function modeToClass(m: StudioThemeMode): StudioThemeClass {
  if (m === "black") return "black-edition"
  if (m === "classic") return "light"
  return m
}

function applyTheme(m: StudioThemeMode, setTheme: (t: string) => void) {
  const nextClass = modeToClass(m)
  try {
    localStorage.setItem(STORAGE_KEY, m)
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const root = document.documentElement
    // Reset classes conhecidas
    root.classList.remove("light", "soft-ice", "midnight", "black-edition")
    // Fonte de verdade do shell (usado por CSS utilitário / alinhamento do body)
    root.setAttribute("data-studio-theme", m === "classic" ? "classic" : m)
    // Aplica a classe do tema (Tailwind + vars em globals.css)
    if (nextClass !== "light") root.classList.add(nextClass)
    else root.classList.add("light")
  }
  setTheme(nextClass)
}

/**
 * Tema dual do produto (Marketing Studio + shell): sincroniza `data-studio-theme` no `<html>`
 * e espelha em `next-themes` (dark = Black, light = Classic) para tokens globais.
 */
export function StudioThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StudioThemeMode>("black")

  useLayoutEffect(() => {
    const initial = readInitialMode()
    setModeState(initial)
    applyTheme(initial, () => {})
  }, [])

  const setMode = useCallback(
    (m: StudioThemeMode) => {
      setModeState(m)
      applyTheme(m, () => {})
    },
    []
  )

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "black" ? "light" : "black"
      applyTheme(next, () => {})
      return next
    })
  }, [])

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
  const theme: StudioThemeClass = modeToClass(mode)
  return {
    theme,
    mode,
    setTheme: (t: StudioThemeClass | "dark" | "black") =>
      setMode(t === "dark" || t === "black" || t === "black-edition" ? "black" : t),
    toggle,
  }
}
