"use client"

import { useEffect, useState } from "react"
import { directPrintClient, isTransientDirectError } from "./client"

export type DirectPrintAvailability = { available: boolean; terminalId: string | null }

/**
 * Direct print is used only when the store opted in, the terminal has an ACTIVE binding and the server gate is open
 * (a disabled server answers 404 and the PDV keeps its current print flow). An offline agent still counts as
 * available: the job is registered and the operator sees "não enviado" + explicit alternatives.
 */
export function useDirectPrintAvailability(storeId: string | null | undefined, terminalId: string | null | undefined, enabled: boolean): DirectPrintAvailability {
  const [state, setState] = useState<DirectPrintAvailability>({ available: false, terminalId: null })
  useEffect(() => {
    const sid = (storeId || "").trim(), tid = (terminalId || "").trim()
    if (!enabled || !sid || !tid) { setState({ available: false, terminalId: null }); return }
    const ctrl = new AbortController()
    let alive = true
    const load = () => {
      directPrintClient.terminalStatus(sid, tid, ctrl.signal)
        .then(r => {
          if (!alive) return
          // A transient failure (network/5xx/429) keeps the last known answer: no silent switch of print path (P3-2).
          if (!r.ok && isTransientDirectError(r)) return
          setState({ available: r.ok && r.value.status.configured, terminalId: tid })
        })
        .catch(() => undefined)
    }
    setState(prev => (prev.terminalId === tid ? prev : { available: false, terminalId: null }))
    load()
    window.addEventListener("focus", load)
    return () => { alive = false; ctrl.abort(); window.removeEventListener("focus", load) }
  }, [storeId, terminalId, enabled])
  return state
}
