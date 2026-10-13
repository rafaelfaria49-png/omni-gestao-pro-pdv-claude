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
    if (status !== "authenticated" || !lojaAtivaId || document.visibilityState === "hidden") return () => controller.abort()
    void (async () => {
      try {
        const response = await fetch("/api/pessoas/disponibilidade", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        const body = await response.json()
        if (controller.signal.aborted || currentRequest !== request.current) return
        if (!response.ok) setState({ key, generation, error: body.code ?? "FALHA_INTERNA" })
        else if (body.storeId !== lojaAtivaId) setState({ key, generation, error: "LOJA_DIVERGENTE" })
        else setState({ key, generation, data: body })
      } catch { if (!controller.signal.aborted && currentRequest === request.current) setState({ key, generation, error: "REDE" }) }
    })()
    return () => controller.abort()
  }, [key, generation, status, lojaAtivaId])
  const current = state?.key === key && state.generation === generation ? state : undefined
  return { data: current?.data, retainedData: state?.key === key ? state.data : undefined, error: current?.error, refresh, contextKey: key + ":" + scopeRevision,
    loading: !current, disponivel: current?.data?.disponivel === true }
}
