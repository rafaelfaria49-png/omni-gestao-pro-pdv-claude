"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import type { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
let scopeEpoch = 0
export function pessoasScopeEpoch() { return scopeEpoch }
export type Disponibilidade = Awaited<ReturnType<typeof lerDisponibilidade>>
export function refreshPessoas() { window.dispatchEvent(new Event("pessoas:refresh")) }
export function useDisponibilidade() {
  const { data: session, status } = useSession()
  const { lojaAtivaId } = useLojaAtiva()
  const key = JSON.stringify([status, session?.user?.id, session?.user?.role, lojaAtivaId])
  const [state, setState] = useState<{ key: string; data?: Disponibilidade; error?: string; generation: number }>()
  const [generation, setGeneration] = useState(0)
  const [scopeRevision, setScopeRevision] = useState(0)
  const request = useRef(0)
  const scopeKey = key + ":" + scopeRevision
  const refresh = useCallback(() => { request.current++; setGeneration(n => n + 1) }, [])
  const invalidate = useCallback(() => {
    scopeEpoch++
    setState(undefined); setScopeRevision(n => n + 1); refresh()
  }, [refresh])
  useEffect(() => {
    // O evento sinaliza a troca; a autoridade continua sendo exigirAtor no servidor.
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "assistec-pro-loja-ativa-v1") invalidate()
    }
    window.addEventListener("focus", refresh)
    window.addEventListener("pageshow", refresh)
    window.addEventListener("pessoas:refresh", invalidate)
    window.addEventListener("storage", storage)
    window.addEventListener("offline", refresh)
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh)
      window.removeEventListener("pessoas:refresh", invalidate); window.removeEventListener("storage", storage)
      window.removeEventListener("offline", refresh); window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [refresh, invalidate])
  useEffect(() => {
    const controller = new AbortController()
    const currentRequest = ++request.current
    const fail = (error: string) => setState(previous => ({ key: scopeKey, generation, error,
      ...(error === "REDE" && previous?.key === scopeKey && previous.data?.disponivel === true ? { data: previous.data } : {}) }))
    if (status !== "authenticated" || !lojaAtivaId || document.visibilityState === "hidden") return () => controller.abort()
    void (async () => {
      try {
        const response = await fetch("/api/pessoas/disponibilidade", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        const body = await response.json()
        if (controller.signal.aborted || currentRequest !== request.current) return
        if (!response.ok) fail(body.code ?? "FALHA_INTERNA")
        else if (body.storeId !== lojaAtivaId) fail("LOJA_DIVERGENTE")
        else setState({ key: scopeKey, generation, data: body })
      } catch { if (!controller.signal.aborted && currentRequest === request.current) fail("REDE") }
    })()
    return () => controller.abort()
  }, [scopeKey, generation, status, lojaAtivaId])
  const current = state?.key === scopeKey && state.generation === generation ? state : undefined
  return { data: current?.error ? undefined : current?.data, retainedData: state?.key === scopeKey ? state.data : undefined, error: current?.error, refresh, contextKey: scopeKey,
    loading: !current, disponivel: !current?.error && current?.data?.disponivel === true }
}
