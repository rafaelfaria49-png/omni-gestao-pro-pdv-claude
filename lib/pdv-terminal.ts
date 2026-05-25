"use client"

/**
 * Terminal PDV selecionado no navegador (Fase 1 — Multi-Terminais).
 *
 * Persistência por loja em localStorage (`@omnigestao:pdv-terminal:{storeId}`), além
 * de um `deviceId` estável por navegador (`@omnigestao:deviceId`) que a Fase 2 usará
 * para lock/heartbeat anti-uso-simultâneo. A mudança de terminal dispara um evento
 * `omnigestao:terminal-changed` para que PDV e CaixaStatusBar reajam na mesma aba.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { TERMINAL_HEARTBEAT_INTERVAL_MS } from "@/lib/pdv-terminal-lock"

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

// ─── Fase 2 — lock / heartbeat (client) ──────────────────────────────────────

export type LockResult = {
  ok: boolean
  granted?: boolean
  occupied?: boolean
  inactive?: boolean
  degraded?: boolean
  lockedByOperador?: string | null
  heartbeatAt?: string | null
  error?: string
}

/** Reserva o terminal para este device. `force` = assumir ocupado (admin). */
export async function lockTerminal(
  storeId: string,
  terminalId: string,
  opts?: { force?: boolean },
): Promise<LockResult> {
  const sid = (storeId || "").trim()
  const tid = (terminalId || "").trim()
  if (!sid || !tid) return { ok: false, error: "Parâmetros inválidos." }
  try {
    const res = await fetch("/api/ops/terminal/lock", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: sid },
      body: JSON.stringify({ terminalId: tid, deviceId: getDeviceId(), force: opts?.force === true }),
    })
    return (await res.json().catch(() => ({}))) as LockResult
  } catch {
    // Rede caiu — degradar (não bloquear a operação).
    return { ok: true, degraded: true }
  }
}

/** Prova de vida do terminal ativo. `lost` quando o lock não é mais deste device. */
export async function heartbeatTerminal(
  storeId: string,
  terminalId: string,
): Promise<{ ok: boolean; lost?: boolean; degraded?: boolean }> {
  const sid = (storeId || "").trim()
  const tid = (terminalId || "").trim()
  if (!sid || !tid) return { ok: false }
  try {
    const res = await fetch("/api/ops/terminal/heartbeat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: sid },
      body: JSON.stringify({ terminalId: tid, deviceId: getDeviceId() }),
    })
    return (await res.json().catch(() => ({}))) as { ok: boolean; lost?: boolean; degraded?: boolean }
  } catch {
    return { ok: true, degraded: true }
  }
}

/** Libera o lock. `force` = liberar de outro device (admin). `beacon` para unload. */
export function unlockTerminal(
  storeId: string,
  terminalId: string,
  opts?: { force?: boolean; beacon?: boolean },
): void {
  const sid = (storeId || "").trim()
  const tid = (terminalId || "").trim()
  if (!sid || !tid) return
  const payload = JSON.stringify({
    terminalId: tid,
    deviceId: getDeviceId(),
    force: opts?.force === true,
  })
  // sendBeacon não envia headers → storeId vai na query (aceito pelo helper de escrita).
  if (opts?.beacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(
        `/api/ops/terminal/unlock?storeId=${encodeURIComponent(sid)}`,
        new Blob([payload], { type: "application/json" }),
      )
      return
    } catch {
      /* cai para o fetch abaixo */
    }
  }
  try {
    void fetch("/api/ops/terminal/unlock", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: sid },
      body: payload,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

export type TerminalLockHookState = "pending" | "granted" | "lost"

/**
 * Mantém o lock do terminal ativo: adquire ao montar, bate heartbeat periódico e
 * detecta perda de lock. Libera (best-effort) ao desmontar / fechar a aba.
 * Em falha de infra, `degraded=true` e NÃO bloqueia a operação.
 */
export function useTerminalHeartbeat(params: {
  storeId: string | null | undefined
  terminalId: string | null | undefined
  enabled: boolean
}) {
  const { storeId, terminalId, enabled } = params
  const [status, setStatus] = useState<TerminalLockHookState>("pending")
  const [degraded, setDegraded] = useState(false)
  const [occupiedBy, setOccupiedBy] = useState<{
    operador: string | null
    heartbeatAt: string | null
  } | null>(null)
  const intervalRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const acquire = useCallback(
    async (force?: boolean): Promise<boolean> => {
      const sid = (storeId || "").trim()
      const tid = (terminalId || "").trim()
      if (!sid || !tid) return false
      const r = await lockTerminal(sid, tid, { force })
      if (r.degraded) {
        setDegraded(true)
        setOccupiedBy(null)
        setStatus("granted")
        return true
      }
      if (r.ok && r.granted) {
        setDegraded(false)
        setOccupiedBy(null)
        setStatus("granted")
        return true
      }
      if (r.occupied) {
        setOccupiedBy({ operador: r.lockedByOperador ?? null, heartbeatAt: r.heartbeatAt ?? null })
        setStatus("lost")
        return false
      }
      // Erro inesperado (404/permissão) — degradar para não travar a operação atual.
      setDegraded(true)
      setStatus("granted")
      return true
    },
    [storeId, terminalId],
  )

  const beat = useCallback(async () => {
    const sid = (storeId || "").trim()
    const tid = (terminalId || "").trim()
    if (!sid || !tid) return
    const r = await heartbeatTerminal(sid, tid)
    if (r.degraded) {
      setDegraded(true)
      return
    }
    if (r.lost) {
      setStatus("lost")
      stop()
      return
    }
    setDegraded(false)
  }, [storeId, terminalId, stop])

  const reacquire = useCallback(
    async (force?: boolean): Promise<boolean> => {
      const ok = await acquire(force)
      if (ok) {
        stop()
        intervalRef.current = window.setInterval(() => void beat(), TERMINAL_HEARTBEAT_INTERVAL_MS)
      }
      return ok
    },
    [acquire, beat, stop],
  )

  useEffect(() => {
    const sid = (storeId || "").trim()
    const tid = (terminalId || "").trim()
    if (!enabled || !sid || !tid) {
      stop()
      setStatus("pending")
      setDegraded(false)
      setOccupiedBy(null)
      return
    }
    let cancelled = false
    setStatus("pending")
    void (async () => {
      const ok = await acquire(false)
      if (cancelled) return
      if (ok) {
        stop()
        intervalRef.current = window.setInterval(() => void beat(), TERMINAL_HEARTBEAT_INTERVAL_MS)
      }
    })()

    const onUnload = () => unlockTerminal(sid, tid, { beacon: true })
    window.addEventListener("beforeunload", onUnload)

    return () => {
      cancelled = true
      stop()
      window.removeEventListener("beforeunload", onUnload)
      // Libera ao desmontar / trocar terminal (best-effort).
      unlockTerminal(sid, tid, { beacon: false })
    }
  }, [storeId, terminalId, enabled, acquire, beat, stop])

  return { status, degraded, occupiedBy, reacquire }
}

