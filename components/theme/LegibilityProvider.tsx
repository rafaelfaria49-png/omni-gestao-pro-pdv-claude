"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "@/hooks/use-toast"

/**
 * Modo Alta Legibilidade (global, opt-in).
 *
 * Fonte de verdade = atributo `data-legibility` no <html>:
 *   - "normal" → visual premium padrão (intacto)
 *   - "high"   → reforço de contraste / fontes / bordas (styles/legibility.css)
 *
 * Persistência: localStorage (`omni-legibility`). Aplicado via useLayoutEffect
 * (antes do paint) para minimizar flash — mesmo padrão do StudioThemeProvider.
 * Não toca em nenhuma lógica de negócio; apenas alterna a camada de CSS.
 */
export type LegibilityMode = "normal" | "high"

const STORAGE_KEY = "omni-legibility"

type LegibilityContextValue = {
  mode: LegibilityMode
  /** true após a 1ª leitura do localStorage no cliente (evita mismatch SSR). */
  mounted: boolean
  setMode: (m: LegibilityMode) => void
  toggle: () => void
}

const LegibilityContext = createContext<LegibilityContextValue | null>(null)

function readInitialMode(): LegibilityMode {
  if (typeof window === "undefined") return "normal"
  try {
    return String(localStorage.getItem(STORAGE_KEY) || "").trim() === "high" ? "high" : "normal"
  } catch {
    return "normal"
  }
}

function applyMode(m: LegibilityMode) {
  try {
    localStorage.setItem(STORAGE_KEY, m)
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-legibility", m)
  }
}

export function LegibilityProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LegibilityMode>("normal")
  const [mounted, setMounted] = useState(false)
  // Espelho síncrono do modo: evita closure obsoleta no toggle (botão 👁 + Alt+L
  // compartilham a mesma action) e dispara o toast com o valor correto.
  const modeRef = useRef<LegibilityMode>("normal")

  useLayoutEffect(() => {
    const initial = readInitialMode()
    modeRef.current = initial
    setModeState(initial)
    applyMode(initial)
    setMounted(true)
  }, [])

  const setMode = useCallback((m: LegibilityMode) => {
    modeRef.current = m
    setModeState(m)
    applyMode(m)
  }, [])

  // Única action de alternância (botão e atalho usam esta) — sem duplicar estado.
  const toggle = useCallback(() => {
    const next: LegibilityMode = modeRef.current === "high" ? "normal" : "high"
    setMode(next)
    toast({
      title: next === "high" ? "Alta Legibilidade ativada" : "Alta Legibilidade desativada",
    })
  }, [setMode])

  // Atalho global Alt + L → alterna Normal ⇄ Alta Legibilidade.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // `e.code === "KeyL"` é robusto a layouts onde Alt produz caractere especial.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyL") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  const value = useMemo<LegibilityContextValue>(
    () => ({ mode, mounted, setMode, toggle }),
    [mode, mounted, setMode, toggle]
  )

  return <LegibilityContext.Provider value={value}>{children}</LegibilityContext.Provider>
}

export function useLegibility(): LegibilityContextValue {
  const c = useContext(LegibilityContext)
  if (!c) {
    throw new Error("useLegibility must be used within LegibilityProvider")
  }
  return c
}
