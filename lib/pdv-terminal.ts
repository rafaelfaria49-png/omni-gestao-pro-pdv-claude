"use client"

/**
 * Terminal PDV selecionado no navegador (Fase 1 — Multi-Terminais).
 *
 * Persistência por loja em localStorage (`@omnigestao:pdv-terminal:{storeId}`), além
 * de um `deviceId` estável por navegador (`@omnigestao:deviceId`) que a Fase 2 usará
 * para lock/heartbeat anti-uso-simultâneo. A mudança de terminal dispara um evento
 * `omnigestao:terminal-changed` para que PDV e CaixaStatusBar reajam na mesma aba.
 */

import { useCallback, useEffect, useState } from "react"

export type TerminalSnapshot = {
  id: string
  code: string
  name: string
}

const DEVICE_ID_KEY = "@omnigestao:deviceId"
const TERMINAL_KEY_PREFIX = "@omnigestao:pdv-terminal:"
export const TERMINAL_CHANGED_EVENT = "omnigestao:terminal-changed"

function terminalKey(storeId: string): string {
  return `${TERMINAL_KEY_PREFIX}${storeId}`
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** ID estável deste navegador/computador. Gerado uma vez e reutilizado. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id || !id.trim()) {
      id = randomId()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return ""
  }
}

/** Lê o terminal selecionado para a loja (ou null). */
export function readSelectedTerminal(storeId: string | null | undefined): TerminalSnapshot | null {
  if (typeof window === "undefined") return null
  const sid = (storeId || "").trim()
  if (!sid) return null
  try {
    const raw = localStorage.getItem(terminalKey(sid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TerminalSnapshot>
    if (parsed && typeof parsed.id === "string" && parsed.id.trim()) {
      return {
        id: parsed.id,
        code: typeof parsed.code === "string" ? parsed.code : "",
        name: typeof parsed.name === "string" ? parsed.name : "",
      }
    }
    return null
  } catch {
    return null
  }
}

function notifyChange() {
  try {
    window.dispatchEvent(new Event(TERMINAL_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

/** Persiste o terminal selecionado para a loja e notifica os consumidores. */
export function writeSelectedTerminal(storeId: string, terminal: TerminalSnapshot): void {
  if (typeof window === "undefined") return
  const sid = (storeId || "").trim()
  if (!sid || !terminal?.id) return
  try {
    localStorage.setItem(
      terminalKey(sid),
      JSON.stringify({ id: terminal.id, code: terminal.code, name: terminal.name }),
    )
    notifyChange()
  } catch {
    /* ignore */
  }
}

/** Remove o terminal selecionado da loja (força nova seleção). */
export function clearSelectedTerminal(storeId: string): void {
  if (typeof window === "undefined") return
  const sid = (storeId || "").trim()
  if (!sid) return
  try {
    localStorage.removeItem(terminalKey(sid))
    notifyChange()
  } catch {
    /* ignore */
  }
}

/**
 * Hook reativo do terminal ativo da loja. Atualiza ao trocar de terminal na mesma
 * aba (evento) ou em outra aba (`storage`).
 */
export function useTerminalAtivo(storeId: string | null | undefined) {
  const [terminal, setTerminalState] = useState<TerminalSnapshot | null>(null)

  useEffect(() => {
    const sid = (storeId || "").trim()
    if (!sid) {
      setTerminalState(null)
      return
    }
    const read = () => setTerminalState(readSelectedTerminal(sid))
    read()
    const onChange = () => read()
    const onStorage = (e: StorageEvent) => {
      if (e.key === terminalKey(sid)) read()
    }
    window.addEventListener(TERMINAL_CHANGED_EVENT, onChange)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(TERMINAL_CHANGED_EVENT, onChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [storeId])

  const select = useCallback(
    (t: TerminalSnapshot) => {
      const sid = (storeId || "").trim()
      if (sid) writeSelectedTerminal(sid, t)
    },
    [storeId],
  )

  const clear = useCallback(() => {
    const sid = (storeId || "").trim()
    if (sid) clearSelectedTerminal(sid)
  }, [storeId])

  return { terminal, select, clear }
}
